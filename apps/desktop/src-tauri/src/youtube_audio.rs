//! Audio-only YouTube playback. The bundled yt-dlp resolves a video's audio
//! stream with the YouTube session from Connections, and a loopback proxy
//! hands it to the webview's <audio> element.
//!
//! Resolving takes seconds, so songs the user is likely to play are resolved
//! ahead of time, and the first half megabyte of their audio is fetched too:
//! the proxy answers the player's first request from memory and streams the
//! rest behind it, so a prefetched song starts at once.

use axum::{
    body::{Body, Bytes},
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::get,
    Router,
};
use futures_util::{StreamExt, TryStreamExt};
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, VecDeque};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, LazyLock, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tokio::sync::{Mutex, OnceCell};

const RESOLVE_TIMEOUT: Duration = Duration::from_secs(45);
/// Streams kept registered: the one playing and the few the webview is leaving.
const MAX_STREAMS: usize = 4;
/// Reading cookies goes through WebView2's UI thread, and the session only
/// changes on sign-in or sign-out, which both clear this.
const SESSION_TTL: Duration = Duration::from_secs(600);
/// googlevideo URLs state their own expiry; one is reused until shortly before.
const EXPIRY_MARGIN: Duration = Duration::from_secs(600);
const MAX_REUSE: Duration = Duration::from_secs(3 * 3600);
const REUSE_WITHOUT_EXPIRY: Duration = Duration::from_secs(1800);
/// Prefetches resolving at once, each a yt-dlp and a deno process.
const PREFETCH_WORKERS: usize = 2;
/// Waiting prefetches; older ones fall off when newer, likelier songs arrive.
const MAX_QUEUED: usize = 8;
/// Audio fetched ahead for a prefetched song, about half a minute of it.
const HEAD_BYTES: u64 = 512 * 1024;
const HEAD_TIMEOUT: Duration = Duration::from_secs(6);
const MAX_HEADS: usize = 16;

/// The first bytes of a stream, held in memory.
struct Head {
    bytes: Bytes,
    total: u64,
    content_type: Option<String>,
}

#[derive(Clone)]
struct Stream {
    url: String,
    headers: Vec<(String, String)>,
    head: Option<Arc<Head>>,
}

#[derive(Clone)]
struct Resolved {
    stream: Stream,
    fresh_until: Instant,
}

/// One resolve per video, shared by everyone who asks for it meanwhile.
type Slot = Arc<OnceCell<Result<Resolved, String>>>;

#[derive(Default)]
struct Registry {
    streams: HashMap<String, Stream>,
    order: VecDeque<String>,
}

struct Server {
    port: u16,
    registry: Arc<Mutex<Registry>>,
}

static SERVER: OnceCell<Server> = OnceCell::const_new();
static GENERATION: AtomicU64 = AtomicU64::new(0);
static RESOLVED: LazyLock<Mutex<HashMap<String, (u64, Slot)>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static HEADS: LazyLock<std::sync::Mutex<HashMap<String, (Instant, Arc<Head>)>>> =
    LazyLock::new(|| std::sync::Mutex::new(HashMap::new()));
static SESSION: std::sync::Mutex<Option<(Instant, String)>> = std::sync::Mutex::new(None);
static QUEUE: std::sync::Mutex<VecDeque<String>> = std::sync::Mutex::new(VecDeque::new());
static WORKERS: AtomicUsize = AtomicUsize::new(0);
static PROXY: OnceLock<reqwest::Client> = OnceLock::new();

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioStream {
    stream_id: String,
    url: String,
}

fn allowed_url(url: &reqwest::Url) -> bool {
    url.scheme() == "https" && url.host_str().is_some_and(|h| h.ends_with(".googlevideo.com"))
}

fn valid_video_id(id: &str) -> bool {
    id.len() == 11 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// How long a resolved URL may be handed out again.
fn reuse_window(url: &str, now_unix: u64) -> Duration {
    let expires = reqwest::Url::parse(url).ok().and_then(|url| {
        url.query_pairs()
            .find(|(key, _)| key == "expire")
            .and_then(|(_, value)| value.parse::<u64>().ok())
    });
    match expires {
        Some(at) => Duration::from_secs(at.saturating_sub(now_unix))
            .saturating_sub(EXPIRY_MARGIN)
            .min(MAX_REUSE),
        None => REUSE_WITHOUT_EXPIRY,
    }
}

/// `bytes=start-` or `bytes=start-end`; anything fancier goes straight upstream.
fn parse_range(value: &str) -> Option<(u64, Option<u64>)> {
    let spec = value.trim().strip_prefix("bytes=")?;
    if spec.contains(',') {
        return None;
    }
    let (start, end) = spec.split_once('-')?;
    let start = start.trim().parse().ok()?;
    let end = end.trim();
    let end = if end.is_empty() {
        None
    } else {
        Some(end.parse().ok()?)
    };
    Some((start, end))
}

/// One client for every request, so seeking reuses the open connection.
fn proxy_client() -> Result<&'static reqwest::Client, StatusCode> {
    if let Some(client) = PROXY.get() {
        return Ok(client);
    }
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() < 4 && allowed_url(attempt.url()) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    Ok(PROXY.get_or_init(|| client))
}

fn upstream(stream: &Stream, range: Option<String>) -> Result<reqwest::RequestBuilder, StatusCode> {
    let mut request = proxy_client()?.get(&stream.url);
    for (key, value) in &stream.headers {
        request = request.header(key, value);
    }
    if let Some(range) = range {
        request = request.header("range", range);
    }
    Ok(request)
}

/// Answers a request from the start of the file: the held bytes at once, the
/// rest streamed from YouTube behind them.
fn serve_head(stream: &Stream, head: &Head, end: u64, partial: bool) -> Result<Response, StatusCode> {
    let length = end + 1;
    let held = head.bytes.len() as u64;
    let first = head.bytes.slice(..held.min(length) as usize);
    let body = if length <= held {
        Body::from(first)
    } else {
        let request = upstream(stream, Some(format!("bytes={held}-{end}")))?;
        let rest = futures_util::stream::once(async move {
            let response = request.send().await.map_err(std::io::Error::other)?;
            if response.status() != StatusCode::PARTIAL_CONTENT {
                return Err(std::io::Error::other("YouTube refused the rest of the stream"));
            }
            Ok(response.bytes_stream().map_err(std::io::Error::other))
        })
        .try_flatten();
        Body::from_stream(
            futures_util::stream::once(async move { Ok::<_, std::io::Error>(first) }).chain(rest),
        )
    };
    let mut response = Response::builder()
        .status(if partial {
            StatusCode::PARTIAL_CONTENT
        } else {
            StatusCode::OK
        })
        .header("cache-control", "no-store")
        .header("accept-ranges", "bytes")
        .header("content-length", length);
    if partial {
        response = response.header("content-range", format!("bytes 0-{end}/{}", head.total));
    }
    if let Some(content_type) = &head.content_type {
        response = response.header("content-type", content_type);
    }
    response.body(body).map_err(|_| StatusCode::BAD_GATEWAY)
}

async fn audio(
    Path(token): Path<String>,
    State(registry): State<Arc<Mutex<Registry>>>,
    headers: HeaderMap,
) -> Result<Response, StatusCode> {
    let stream = registry
        .lock()
        .await
        .streams
        .get(&token)
        .cloned()
        .ok_or(StatusCode::NOT_FOUND)?;
    let range = headers.get("range").and_then(|value| value.to_str().ok());
    let parsed = range.map(parse_range);
    if let Some(head) = &stream.head {
        let requested_end = match parsed {
            None => Some(None),
            Some(Some((0, end))) => Some(end),
            _ => None,
        };
        if let Some(end) = requested_end {
            let last = head.total - 1;
            return serve_head(&stream, head, end.map_or(last, |end| end.min(last)), range.is_some());
        }
    }
    let mut request = upstream(&stream, None)?;
    for key in ["range", "if-range"] {
        if let Some(value) = headers.get(key) {
            request = request.header(key, value);
        }
    }
    let upstream = request.send().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    let mut response = Response::builder()
        .status(upstream.status())
        .header("cache-control", "no-store");
    for key in ["content-type", "content-length", "content-range", "accept-ranges"] {
        if let Some(value) = upstream.headers().get(key) {
            response = response.header(key, value);
        }
    }
    response
        .body(Body::from_stream(upstream.bytes_stream()))
        .map_err(|_| StatusCode::BAD_GATEWAY)
}

async fn server() -> Result<&'static Server, String> {
    SERVER
        .get_or_try_init(|| async {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
                .await
                .map_err(|e| e.to_string())?;
            let port = listener.local_addr().map_err(|e| e.to_string())?.port();
            let registry = Arc::new(Mutex::new(Registry::default()));
            let router = Router::new()
                .route("/audio/{token}", get(audio))
                .with_state(registry.clone());
            tauri::async_runtime::spawn(async move {
                let _ = axum::serve(listener, router).await;
            });
            Ok(Server { port, registry })
        })
        .await
}

fn binary(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let extension = if cfg!(windows) { ".exe" } else { "" };
    let platform = if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };
    let arch = std::env::consts::ARCH;
    let root = if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    } else {
        app.path().resource_dir().map_err(|e| e.to_string())?
    };
    // Each helper sits in its own folder. yt-dlp is its unpacked build: the
    // single-file one extracted itself on every start, a second per song.
    let path = root
        .join("resources")
        .join("audio")
        .join(format!("{platform}-{arch}"))
        .join(name)
        .join(format!("{name}{extension}"));
    if path.is_file() {
        Ok(path)
    } else {
        Err("Audio helper is missing. Run pnpm --filter desktop audio:prepare or reinstall MiniFy.".into())
    }
}

pub(crate) async fn invalidate_session() {
    GENERATION.fetch_add(1, Ordering::SeqCst);
    forget_session();
    if let Ok(mut queue) = QUEUE.lock() {
        queue.clear();
    }
    if let Ok(mut heads) = HEADS.lock() {
        heads.clear();
    }
    RESOLVED.lock().await.clear();
    if let Some(server) = SERVER.get() {
        *server.registry.lock().await = Registry::default();
    }
}

/// Drops the cached cookies, so the next resolve reads the current session.
pub(crate) fn forget_session() {
    if let Ok(mut session) = SESSION.lock() {
        *session = None;
    }
}

async fn session(app: &AppHandle) -> Result<String, String> {
    let cached = SESSION.lock().ok().and_then(|session| {
        session
            .as_ref()
            .filter(|(at, _)| at.elapsed() < SESSION_TTL)
            .map(|(_, text)| text.clone())
    });
    if let Some(text) = cached {
        return Ok(text);
    }
    let text = crate::music_video::audio_session(app).await?;
    if let Ok(mut session) = SESSION.lock() {
        *session = Some((Instant::now(), text.clone()));
    }
    Ok(text)
}

async fn resolve(app: AppHandle, video_id: String) -> Result<Resolved, String> {
    let session = session(&app).await?;
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    let directory = cache.join("audio-session");
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let mut cookies =
        tempfile::NamedTempFile::new_in(&directory).map_err(|_| "Cannot create audio session")?;
    cookies
        .write_all(session.as_bytes())
        .map_err(|_| "Cannot prepare audio session")?;
    let mut command = tokio::process::Command::new(binary(&app, "yt-dlp")?);
    command
        .args([
            "--ignore-config",
            "--no-plugin-dirs",
            "--no-playlist",
            "--skip-download",
            "--dump-single-json",
            "--no-warnings",
            "--socket-timeout",
            "15",
            "--retries",
            "1",
            "--format",
            "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
            // Manifests and translated subtitles are never used here.
            "--extractor-args",
            "youtube:skip=dash,hls,translated_subs",
        ])
        // Keeps YouTube's player script and solved challenges between songs.
        .arg("--cache-dir")
        .arg(cache.join("yt-dlp"))
        .arg("--js-runtimes")
        .arg(format!("deno:{}", binary(&app, "deno")?.display()))
        .arg("--cookies")
        .arg(cookies.path())
        .arg("--")
        .arg(format!("https://www.youtube.com/watch?v={video_id}"))
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let output = tokio::time::timeout(RESOLVE_TIMEOUT, command.output())
        .await
        .map_err(|_| "YouTube audio timed out. Try again.")?
        .map_err(|_| "Audio helper could not start")?;
    // Resolver stderr can contain account or signed URL details; never forward it.
    if !output.status.success() {
        return Err("YouTube could not provide this audio. The video may be unavailable or your session may need a new sign-in.".into());
    }
    let data: Value = serde_json::from_slice(&output.stdout).map_err(|_| "Invalid audio response")?;
    let url = data["url"]
        .as_str()
        .ok_or("No playable audio format available")?;
    if !reqwest::Url::parse(url).is_ok_and(|url| allowed_url(&url)) {
        return Err("Unsupported audio stream".into());
    }
    let headers = ["User-Agent", "Referer", "Origin"]
        .iter()
        .filter_map(|key| {
            data["http_headers"][key]
                .as_str()
                .map(|value| (key.to_string(), value.to_string()))
        })
        .collect();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    Ok(Resolved {
        fresh_until: Instant::now() + reuse_window(url, now),
        stream: Stream {
            url: url.into(),
            headers,
            head: None,
        },
    })
}

/// The video's stream: cached while its URL is fresh, otherwise resolved once
/// no matter how many callers wait for it.
async fn resolved(app: &AppHandle, video_id: &str, fresh: bool) -> Result<Stream, String> {
    let generation = GENERATION.load(Ordering::SeqCst);
    let slot = {
        let mut cache = RESOLVED.lock().await;
        let now = Instant::now();
        cache.retain(|_, (made, slot)| {
            *made == generation
                && match slot.get() {
                    Some(Ok(resolved)) => resolved.fresh_until > now,
                    Some(Err(_)) => false,
                    None => true,
                }
        });
        if fresh {
            cache.remove(video_id);
        }
        cache
            .entry(video_id.to_owned())
            .or_insert_with(|| (generation, Arc::new(OnceCell::new())))
            .1
            .clone()
    };
    let result = slot
        .get_or_init(|| resolve(app.clone(), video_id.to_owned()))
        .await
        .clone();
    if generation != GENERATION.load(Ordering::SeqCst) {
        return Err("YouTube session changed".into());
    }
    result.map(|resolved| resolved.stream)
}

fn cached_head(url: &str) -> Option<Arc<Head>> {
    HEADS.lock().ok()?.get(url).map(|(_, head)| head.clone())
}

fn remember_head(url: &str, head: Head) {
    let Ok(mut heads) = HEADS.lock() else { return };
    heads.insert(url.to_owned(), (Instant::now(), Arc::new(head)));
    while heads.len() > MAX_HEADS {
        let Some(oldest) = heads
            .iter()
            .min_by_key(|(_, (at, _))| *at)
            .map(|(url, _)| url.clone())
        else {
            break;
        };
        heads.remove(&oldest);
    }
}

async fn fetch_head(stream: &Stream) -> Option<Head> {
    let request = upstream(stream, Some(format!("bytes=0-{}", HEAD_BYTES - 1))).ok()?;
    let response = tokio::time::timeout(HEAD_TIMEOUT, request.send())
        .await
        .ok()?
        .ok()?;
    if response.status() != StatusCode::PARTIAL_CONTENT {
        return None;
    }
    let total = response
        .headers()
        .get("content-range")?
        .to_str()
        .ok()?
        .rsplit('/')
        .next()?
        .parse::<u64>()
        .ok()?;
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let bytes = tokio::time::timeout(HEAD_TIMEOUT, response.bytes())
        .await
        .ok()?
        .ok()?;
    (!bytes.is_empty() && bytes.len() as u64 <= total).then_some(Head {
        bytes,
        total,
        content_type,
    })
}

fn ensure_workers(app: &AppHandle) {
    loop {
        let running = WORKERS.load(Ordering::SeqCst);
        let waiting = QUEUE.lock().map(|queue| !queue.is_empty()).unwrap_or(false);
        if running >= PREFETCH_WORKERS || !waiting {
            return;
        }
        if WORKERS
            .compare_exchange(running, running + 1, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            let app = app.clone();
            tauri::async_runtime::spawn(prefetch_worker(app));
        }
    }
}

async fn prefetch_worker(app: AppHandle) {
    loop {
        let next = QUEUE.lock().ok().and_then(|mut queue| queue.pop_front());
        let Some(video_id) = next else { break };
        if let Ok(stream) = resolved(&app, &video_id, false).await {
            if cached_head(&stream.url).is_none() {
                if let Some(head) = fetch_head(&stream).await {
                    remember_head(&stream.url, head);
                }
            }
        }
    }
    WORKERS.fetch_sub(1, Ordering::SeqCst);
    // A song queued while this worker was on its way out still gets its turn.
    ensure_workers(&app);
}

async fn register(mut stream: Stream) -> Result<AudioStream, String> {
    stream.head = cached_head(&stream.url);
    let server = server().await?;
    let stream_id = format!("{:032x}", rand::random::<u128>());
    let mut registry = server.registry.lock().await;
    registry.streams.insert(stream_id.clone(), stream);
    registry.order.push_back(stream_id.clone());
    while registry.order.len() > MAX_STREAMS {
        if let Some(oldest) = registry.order.pop_front() {
            registry.streams.remove(&oldest);
        }
    }
    Ok(AudioStream {
        url: format!("http://127.0.0.1:{}/audio/{stream_id}", server.port),
        stream_id,
    })
}

#[tauri::command]
pub async fn release_youtube_audio(stream_id: String) {
    if let Some(server) = SERVER.get() {
        let mut registry = server.registry.lock().await;
        registry.streams.remove(&stream_id);
        registry.order.retain(|id| id != &stream_id);
    }
}

/// `fresh` skips the cache, for a stream whose URL stopped working.
#[tauri::command]
pub async fn resolve_youtube_audio(
    app: AppHandle,
    video_id: String,
    fresh: Option<bool>,
) -> Result<AudioStream, String> {
    if !valid_video_id(&video_id) {
        return Err("Invalid YouTube video".into());
    }
    let stream = resolved(&app, &video_id, fresh.unwrap_or(false)).await?;
    register(stream).await
}

/// Queues videos to resolve ahead of time, the first one most urgently.
#[tauri::command]
pub async fn prefetch_youtube_audio(app: AppHandle, video_ids: Vec<String>) {
    {
        let Ok(mut queue) = QUEUE.lock() else { return };
        for id in video_ids.into_iter().take(MAX_QUEUED).rev() {
            if !valid_video_id(&id) {
                continue;
            }
            queue.retain(|queued| queued != &id);
            queue.push_front(id);
        }
        queue.truncate(MAX_QUEUED);
    }
    ensure_workers(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proxy_restricts_destinations() {
        for url in [
            "http://x.googlevideo.com/a",
            "https://googlevideo.com.evil.test",
            "https://127.0.0.1/",
        ] {
            assert!(!allowed_url(&url.parse().unwrap()));
        }
        assert!(allowed_url(
            &"https://rr1.googlevideo.com/videoplayback".parse().unwrap()
        ));
    }

    #[test]
    fn reuse_stops_before_the_url_expires() {
        let url = "https://rr1.googlevideo.com/videoplayback?expire=10000&id=x";
        assert_eq!(reuse_window(url, 10000 - 3600), Duration::from_secs(3000));
        assert_eq!(reuse_window(url, 9900), Duration::ZERO);
        assert_eq!(
            reuse_window("https://rr1.googlevideo.com/videoplayback", 0),
            REUSE_WITHOUT_EXPIRY
        );
    }

    #[test]
    fn video_ids_are_checked() {
        assert!(valid_video_id("dQw4w9WgXcQ"));
        assert!(!valid_video_id("dQw4w9WgXc"));
        assert!(!valid_video_id("dQw4w9WgX/Q"));
    }

    #[test]
    fn ranges_are_parsed() {
        assert_eq!(parse_range("bytes=0-"), Some((0, None)));
        assert_eq!(parse_range("bytes=0-1023"), Some((0, Some(1023))));
        assert_eq!(parse_range("bytes=500-"), Some((500, None)));
        assert_eq!(parse_range("bytes=0-1,5-9"), None);
        assert_eq!(parse_range("items=0-"), None);
    }
}

//! Music videos from YouTube: a YouTube sign-in inside MiniFy, and a search
//! for a track's music video made with that session.
//!
//! The sign-in is youtube.com's own, in a MiniFy window. Its cookies land in
//! the webview profile every MiniFy window shares, so the embedded videos play
//! as that account (with YouTube Premium, without ads) and the search below
//! sends the same session. No API project, client id or quota involved.

use serde::Serialize;
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const LOGIN_WINDOW: &str = "youtube-login";
const ORIGIN: &str = "https://www.youtube.com";
const SEARCH_URL: &str = "https://www.youtube.com/youtubei/v1/search?prettyPrint=false";
const CLIENT_VERSION: &str = "2.20250312.04.00";
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
/// youtube.com's own "Type: Video" search filter.
const VIDEOS_ONLY: &str = "EgIQAQ%3D%3D";
const MAX_CANDIDATES: usize = 12;
const SIGN_IN_URL: &str = "https://accounts.google.com/ServiceLogin?service=youtube&passive=true\
     &continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26next%3D%252F";
const SIGN_IN_TIMEOUT_SECS: u64 = 600;
/// Google sets the rest of the session right after the first cookie appears.
const SIGN_IN_SETTLE_MS: u64 = 1500;

type CookieJar = Vec<(String, String)>;

/// Reading cookies goes through WebView2 on the UI thread. Once per track
/// change that added up, and the session only changes on sign-in or sign-out.
const COOKIE_CACHE_TTL: Duration = Duration::from_secs(300);
const COOKIE_READ_TIMEOUT: Duration = Duration::from_secs(3);
/// A search nobody is waiting for any more must not stay open: one took 68s
/// while the app hung. Past this the track simply keeps its cover.
const SEARCH_TIMEOUT: Duration = Duration::from_secs(8);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(4);
static COOKIE_CACHE: Mutex<Option<(Instant, CookieJar)>> = Mutex::new(None);

fn remember_cookies(jar: &CookieJar) {
    if let Ok(mut cache) = COOKIE_CACHE.lock() {
        *cache = Some((Instant::now(), jar.clone()));
    }
}

fn forget_cookies() {
    if let Ok(mut cache) = COOKIE_CACHE.lock() {
        *cache = None;
    }
}

/// The session for requests: from the cache while it is fresh.
async fn session_cookies(app: &AppHandle) -> CookieJar {
    if let Ok(cache) = COOKIE_CACHE.lock() {
        if let Some((at, jar)) = cache.as_ref() {
            if at.elapsed() < COOKIE_CACHE_TTL {
                return jar.clone();
            }
        }
    }
    let jar = youtube_cookies(app).await;
    remember_cookies(&jar);
    jar
}

/// youtube.com cookies from the webview profile all MiniFy windows share.
async fn youtube_cookies(app: &AppHandle) -> CookieJar {
    let window = app
        .get_webview_window("main")
        .or_else(|| app.webview_windows().into_values().next());
    let (Some(window), Ok(url)) = (window, tauri::Url::parse(ORIGIN)) else {
        return Vec::new();
    };

    // Reading cookies on the UI thread deadlocks WebView2, so it happens on a
    // worker, and bounded: a UI thread that cannot answer must not hold up a
    // search. An empty jar only means an anonymous one.
    let read = tauri::async_runtime::spawn_blocking(move || window.cookies_for_url(url));
    tokio::time::timeout(COOKIE_READ_TIMEOUT, read)
        .await
        .ok()
        .and_then(Result::ok)
        .and_then(Result::ok)
        .map(|cookies| {
            cookies
                .into_iter()
                .map(|cookie| (cookie.name().to_string(), cookie.value().to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn sapisid(jar: &CookieJar) -> Option<&str> {
    ["SAPISID", "__Secure-3PAPISID"].iter().find_map(|name| {
        jar.iter()
            .find(|(cookie, _)| cookie == name)
            .map(|(_, value)| value.as_str())
    })
}

fn is_signed_in(jar: &CookieJar) -> bool {
    sapisid(jar).is_some()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YouTubeWebStatus {
    signed_in: bool,
}

#[tauri::command]
pub async fn youtube_web_status(app: AppHandle) -> YouTubeWebStatus {
    let jar = youtube_cookies(&app).await;
    remember_cookies(&jar);
    YouTubeWebStatus {
        signed_in: is_signed_in(&jar),
    }
}

/// Opens YouTube's sign-in in a MiniFy window and closes it once the session
/// exists. The outcome arrives as a `youtube-web-sign-in` event.
#[tauri::command]
pub async fn youtube_web_sign_in(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LOGIN_WINDOW) {
        let _ = window.set_focus();
        return Ok(());
    }

    let url = tauri::Url::parse(SIGN_IN_URL).map_err(|err| err.to_string())?;
    WebviewWindowBuilder::new(&app, LOGIN_WINDOW, WebviewUrl::External(url))
        .title("Sign in to YouTube")
        .inner_size(480.0, 720.0)
        .center()
        .build()
        .map_err(|err| err.to_string())?;

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let started = std::time::Instant::now();
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let window = handle.get_webview_window(LOGIN_WINDOW);
            let mut signed_in = is_signed_in(&youtube_cookies(&handle).await);
            let timed_out = started.elapsed().as_secs() > SIGN_IN_TIMEOUT_SECS;

            if !signed_in && window.is_some() && !timed_out {
                continue;
            }
            if signed_in && window.is_some() {
                tokio::time::sleep(std::time::Duration::from_millis(SIGN_IN_SETTLE_MS)).await;
                signed_in = is_signed_in(&youtube_cookies(&handle).await);
            }
            if let Some(window) = handle.get_webview_window(LOGIN_WINDOW) {
                let _ = window.close();
            }
            // The next search reads the new session instead of a cached one.
            forget_cookies();
            let _ = handle.emit("youtube-web-sign-in", json!({ "signedIn": signed_in }));
            break;
        }
    });

    Ok(())
}

/// Drops the Google and YouTube cookies from MiniFy's webview profile. The
/// browser the user normally uses is not touched.
#[tauri::command]
pub async fn youtube_web_sign_out(app: AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    let result = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        for cookie in window.cookies().map_err(|err| err.to_string())? {
            let google = cookie.domain().is_some_and(|domain| {
                let domain = domain.trim_start_matches('.');
                ["youtube.com", "google.com"]
                    .iter()
                    .any(|site| domain == *site || domain.ends_with(&format!(".{site}")))
            });
            if google {
                let _ = window.delete_cookie(cookie);
            }
        }
        Ok(())
    })
    .await
    .map_err(|err| err.to_string())?;

    forget_cookies();
    result
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoCandidate {
    video_id: String,
    title: String,
    channel: String,
    duration_s: Option<u32>,
    /// YouTube's music-note badge: the artist's own channel.
    verified_artist: bool,
    verified: bool,
}

/// youtube.com's search, in result order. Ranking happens in the frontend.
#[tauri::command]
pub async fn search_music_videos(
    app: AppHandle,
    query: String,
) -> Result<Vec<VideoCandidate>, String> {
    let jar = session_cookies(&app).await;
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(SEARCH_TIMEOUT)
        .connect_timeout(CONNECT_TIMEOUT)
        .build()
        .map_err(|err| err.to_string())?;

    // With the account when there is one. YouTube answers the same search
    // anonymously, so a rejected session is not the end of it.
    if is_signed_in(&jar) {
        match search(&client, &query, Some(&jar)).await {
            Ok(found) => return Ok(found),
            Err(error) => {
                eprintln!("signed-in YouTube search failed, retrying anonymously: {error}")
            }
        }
    }
    search(&client, &query, None).await
}

async fn search(
    client: &reqwest::Client,
    query: &str,
    jar: Option<&CookieJar>,
) -> Result<Vec<VideoCandidate>, String> {
    let body = json!({
        "context": { "client": { "clientName": "WEB", "clientVersion": CLIENT_VERSION, "hl": "en" } },
        "query": query,
        "params": VIDEOS_ONLY,
    });

    let mut request = client
        .post(SEARCH_URL)
        .header("Origin", ORIGIN)
        .header("X-Origin", ORIGIN)
        .header("Referer", format!("{ORIGIN}/"))
        .header("X-Youtube-Client-Name", "1")
        .header("X-Youtube-Client-Version", CLIENT_VERSION)
        .json(&body);

    if let Some(jar) = jar {
        let cookies = jar
            .iter()
            .map(|(name, value)| format!("{name}={value}"))
            .collect::<Vec<_>>()
            .join("; ");
        request = request
            .header("Cookie", cookies)
            .header("X-Goog-AuthUser", "0");
        if let Some(sid) = sapisid(jar) {
            request = request.header("Authorization", sapisid_hash(sid));
        }
    }

    let response = request.send().await.map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!("YouTube search answered {}", response.status()));
    }

    let data: Value = response.json().await.map_err(|err| err.to_string())?;
    let mut found = Vec::new();
    collect_videos(&data, &mut found);
    Ok(found)
}

/// How youtube.com proves a request comes from the signed-in session.
fn sapisid_hash(sapisid: &str) -> String {
    let now = chrono::Utc::now().timestamp();
    let digest = Sha1::digest(format!("{now} {sapisid} {ORIGIN}").as_bytes());
    format!("SAPISIDHASH {now}_{}", hex::encode(digest))
}

fn collect_videos(node: &Value, found: &mut Vec<VideoCandidate>) {
    if found.len() >= MAX_CANDIDATES {
        return;
    }
    match node {
        Value::Object(map) => {
            if let Some(video) = map.get("videoRenderer") {
                if let Some(candidate) = parse_video(video) {
                    found.push(candidate);
                }
                return;
            }
            for value in map.values() {
                collect_videos(value, found);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_videos(item, found);
            }
        }
        _ => {}
    }
}

fn text(value: &Value) -> Option<String> {
    if let Some(simple) = value.get("simpleText").and_then(Value::as_str) {
        return Some(simple.to_string());
    }
    let runs = value.get("runs")?.as_array()?;
    Some(
        runs.iter()
            .filter_map(|run| run.get("text").and_then(Value::as_str))
            .collect(),
    )
}

/// "3:56" or "1:02:03" -> seconds.
fn parse_duration(text: &str) -> Option<u32> {
    text.split(':').try_fold(0u32, |total, part| {
        part.trim().parse::<u32>().ok().map(|n| total * 60 + n)
    })
}

fn parse_video(video: &Value) -> Option<VideoCandidate> {
    let video_id = video.get("videoId")?.as_str()?.to_string();
    let title = text(video.get("title")?)?;
    let channel = video.get("ownerText").and_then(text).unwrap_or_default();
    let duration_s = video
        .get("lengthText")
        .and_then(text)
        .as_deref()
        .and_then(parse_duration);
    let badges: Vec<&str> = video
        .get("ownerBadges")
        .and_then(Value::as_array)
        .map(|badges| {
            badges
                .iter()
                .filter_map(|badge| badge.pointer("/metadataBadgeRenderer/style")?.as_str())
                .collect()
        })
        .unwrap_or_default();

    Some(VideoCandidate {
        video_id,
        title,
        channel,
        duration_s,
        verified_artist: badges.contains(&"BADGE_STYLE_TYPE_VERIFIED_ARTIST"),
        verified: badges.contains(&"BADGE_STYLE_TYPE_VERIFIED"),
    })
}

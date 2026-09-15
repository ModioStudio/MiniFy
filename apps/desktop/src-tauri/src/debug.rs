use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const LOG_FILE: &str = "diagnostics.log";
/// Truncated past this; the last run or two of trouble is what matters.
const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;
const WATCH_INTERVAL: Duration = Duration::from_secs(1);
/// Below this nobody notices; above it, a click or a skip feels stuck.
const UI_LAG_REPORT: Duration = Duration::from_millis(500);
const RENDERER_SILENT_REPORT_MS: u64 = 3000;
/// A heartbeat this late was sent on time but queued on the way into Rust.
const HEARTBEAT_LATE_REPORT_MS: u64 = 2000;
const HEARTBEAT_LATE_LOG_EVERY_MS: u64 = 5000;

static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();
static LAST_HEARTBEAT_MS: AtomicU64 = AtomicU64::new(0);
/// Timers of a hidden page are throttled, so its silence means nothing.
static RENDERER_VISIBLE: AtomicBool = AtomicBool::new(true);
/// One probe at a time: a blocked UI thread would otherwise collect a queue of
/// them and report the same freeze once per second it lasted.
static PROBE_PENDING: AtomicBool = AtomicBool::new(false);
static LAST_LATE_LOG_MS: AtomicU64 = AtomicU64::new(0);

static LAST_DISPATCH_LATE_LOG_MS: AtomicU64 = AtomicU64::new(0);
/// One runtime probe at a time, like the UI thread probe.
static RUNTIME_PROBE_PENDING: AtomicBool = AtomicBool::new(false);
/// A task that waits this long to start means every runtime worker was busy.
const RUNTIME_LAG_REPORT: Duration = Duration::from_millis(500);

/// A heartbeat reaching the command dispatcher, before its command runs. Late
/// here means the webview's transport held it; on time here but late in
/// `renderer_heartbeat` means Rust's async runtime had no worker free.
pub fn note_heartbeat_dispatch(sent_at: Option<f64>) {
    let Some(sent_at) = sent_at else {
        return;
    };
    let now = now_ms();
    let late = now.saturating_sub(sent_at.max(0.0) as u64);
    if late > HEARTBEAT_LATE_REPORT_MS
        && now.saturating_sub(LAST_DISPATCH_LATE_LOG_MS.load(Ordering::Relaxed))
            > HEARTBEAT_LATE_LOG_EVERY_MS
    {
        LAST_DISPATCH_LATE_LOG_MS.store(now, Ordering::Relaxed);
        write_log(
            "watchdog",
            &format!("heartbeat reached Rust's dispatcher {late} ms after it was sent: the webview transport is jammed"),
        );
    }
}

/// Seconds of calls summed up per flood report.
const COMMAND_WINDOW_TICKS: u32 = 10;
/// Fewer calls than this in a window is normal traffic, not worth a line.
const COMMAND_FLOOD_REPORT: u32 = 60;
static COMMAND_COUNTS: Mutex<Option<HashMap<String, u32>>> = Mutex::new(None);

/// Counts calls into Rust by command, for the watchdog's flood report.
pub fn count_command(name: &str) {
    if let Ok(mut counts) = COMMAND_COUNTS.lock() {
        *counts
            .get_or_insert_with(HashMap::new)
            .entry(name.to_string())
            .or_insert(0) += 1;
    }
}

/// The busiest commands of the last window, when there were enough of them
/// to jam the queue into Rust.
fn report_commands() {
    let counts = COMMAND_COUNTS
        .lock()
        .ok()
        .and_then(|mut counts| counts.take())
        .unwrap_or_default();
    let total: u32 = counts.values().sum();
    if total < COMMAND_FLOOD_REPORT {
        return;
    }

    let mut busiest: Vec<(String, u32)> = counts.into_iter().collect();
    busiest.sort_by(|a, b| b.1.cmp(&a.1));
    let list = busiest
        .iter()
        .take(6)
        .map(|(name, count)| format!("{name} {count}"))
        .collect::<Vec<_>>()
        .join(", ");
    write_log(
        "watchdog",
        &format!("{total} calls into Rust in {COMMAND_WINDOW_TICKS} s: {list}"),
    );
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

/// stdout for `tauri dev`, and `diagnostics.log` in the app's log folder for
/// everything else: a release build has no console to read.
pub fn write_log(scope: &str, message: &str) {
    let line = format!(
        "{} [{scope}] {message}",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f")
    );
    println!("{line}");

    let Some(path) = LOG_PATH.get() else {
        return;
    };
    if std::fs::metadata(path).is_ok_and(|meta| meta.len() > MAX_LOG_BYTES) {
        let _ = std::fs::remove_file(path);
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{line}");
    }
}

#[tauri::command]
pub fn open_webview_devtools(app: AppHandle) {
    let _ = app; // no-op on Tauri v2
}

/// The webview's diagnostics, which Windows does not forward from its console.
/// Async so the file write never lands on the UI thread.
#[tauri::command]
pub async fn log_diagnostic(scope: String, message: String) {
    write_log(&scope, &message);
}

/// The main window's JavaScript saying it is alive; see `start_watchdog`.
/// `sent_at` tells the two kinds of silence apart: a frozen page sends
/// nothing, while calls backed up on their way into Rust arrive late.
#[tauri::command]
pub async fn renderer_heartbeat(visible: bool, sent_at: f64) {
    let now = now_ms();
    let late = now.saturating_sub(sent_at.max(0.0) as u64);
    if visible
        && late > HEARTBEAT_LATE_REPORT_MS
        && now.saturating_sub(LAST_LATE_LOG_MS.load(Ordering::Relaxed))
            > HEARTBEAT_LATE_LOG_EVERY_MS
    {
        LAST_LATE_LOG_MS.store(now, Ordering::Relaxed);
        write_log(
            "watchdog",
            &format!("heartbeat command ran {late} ms after it was sent"),
        );
    }

    RENDERER_VISIBLE.store(visible, Ordering::Relaxed);
    LAST_HEARTBEAT_MS.store(now, Ordering::Relaxed);
}

/// Leaves a trace when MiniFy stops responding. Two clocks are watched: the UI
/// thread (window messages and synchronous commands) and the main window's
/// renderer (all of the app's JavaScript), because a freeze in either looks
/// the same from the outside and needs a different fix.
pub fn start_watchdog(app: AppHandle) {
    if let Ok(dir) = app.path().app_log_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = LOG_PATH.set(dir.join(LOG_FILE));
    }
    write_log(
        "watchdog",
        &format!("MiniFy {} started", app.package_info().version),
    );

    let spawned = std::thread::Builder::new()
        .name("watchdog".into())
        .spawn(move || {
            let mut silent_since: Option<u64> = None;
            let mut ticks: u32 = 0;
            loop {
                std::thread::sleep(WATCH_INTERVAL);
                ticks = ticks.wrapping_add(1);
                if ticks % COMMAND_WINDOW_TICKS == 0 {
                    report_commands();
                }

                // Async commands run on this runtime. If blocking code holds
                // every worker, commands wait although nothing else is busy.
                if !RUNTIME_PROBE_PENDING.swap(true, Ordering::Relaxed) {
                    let sent = Instant::now();
                    tauri::async_runtime::spawn(async move {
                        RUNTIME_PROBE_PENDING.store(false, Ordering::Relaxed);
                        let lag = sent.elapsed();
                        if lag > RUNTIME_LAG_REPORT {
                            write_log(
                                "watchdog",
                                &format!(
                                    "async runtime had no free worker for {} ms",
                                    lag.as_millis()
                                ),
                            );
                        }
                    });
                }

                if !PROBE_PENDING.swap(true, Ordering::Relaxed) {
                    let sent = Instant::now();
                    let _ = app.run_on_main_thread(move || {
                        PROBE_PENDING.store(false, Ordering::Relaxed);
                        let lag = sent.elapsed();
                        if lag > UI_LAG_REPORT {
                            write_log(
                                "watchdog",
                                &format!("UI thread was blocked for {} ms", lag.as_millis()),
                            );
                        }
                    });
                }

                let last = LAST_HEARTBEAT_MS.load(Ordering::Relaxed);
                let watched = last != 0
                    && RENDERER_VISIBLE.load(Ordering::Relaxed)
                    && app.get_webview_window("main").is_some();
                if !watched {
                    silent_since = None;
                    continue;
                }

                let silent = now_ms().saturating_sub(last);
                match (silent > RENDERER_SILENT_REPORT_MS, silent_since) {
                    (true, None) => {
                        silent_since = Some(last);
                        write_log(
                            "watchdog",
                            &format!("main window JavaScript has not answered for {silent} ms"),
                        );
                    }
                    (false, Some(since)) => {
                        write_log(
                            "watchdog",
                            &format!(
                                "main window JavaScript back after {} ms",
                                now_ms().saturating_sub(since)
                            ),
                        );
                        silent_since = None;
                    }
                    _ => {}
                }
            }
        });

    if spawned.is_err() {
        write_log("watchdog", "could not start the watchdog thread");
    }
}

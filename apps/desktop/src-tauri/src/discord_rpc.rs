//! Discord Rich Presence.
//!
//! Discord's IPC is a blocking named pipe, and a busy or rate-limited Discord
//! can take seconds to answer. Tauri runs synchronous commands on the UI
//! thread, so talking to the pipe from a command froze the whole window, most
//! of all on track changes, which is exactly when presence updates arrive.
//! All pipe work happens on one worker thread; the commands only hand it the
//! latest wanted state and return at once.

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, Instant};
use tauri::State;

// MiniFy Discord Application ID
const DISCORD_APPLICATION_ID: &str = "1456693272163385447";
const GITHUB_URL: &str = "https://github.com/ModioStudio/MiniFy";
/// Discord not running is the normal case; do not knock on its pipe on every update.
const RECONNECT_BACKOFF: Duration = Duration::from_secs(30);
/// Discord rejects activity text longer than this.
const MAX_TEXT_CHARS: usize = 128;

struct Presence {
    track_name: Option<String>,
    artist_name: Option<String>,
    is_playing: bool,
    ai_queue_active: bool,
}

enum Message {
    Enabled(bool),
    Presence(Presence),
}

pub struct DiscordState {
    enabled: AtomicBool,
    sender: Mutex<mpsc::Sender<Message>>,
}

impl DiscordState {
    /// Off until `init_discord_rpc` applies the saved setting.
    pub fn new() -> Self {
        let (sender, receiver) = mpsc::channel();
        std::thread::Builder::new()
            .name("discord-rpc".into())
            .spawn(move || run(receiver))
            .expect("failed to start the Discord presence thread");

        Self {
            enabled: AtomicBool::new(false),
            sender: Mutex::new(sender),
        }
    }

    fn send(&self, message: Message) {
        if let Ok(sender) = self.sender.lock() {
            let _ = sender.send(message);
        }
    }

    fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Relaxed);
        self.send(Message::Enabled(enabled));
    }
}

impl Default for DiscordState {
    fn default() -> Self {
        Self::new()
    }
}

fn connect_discord() -> Result<DiscordIpcClient, String> {
    let mut client = DiscordIpcClient::new(DISCORD_APPLICATION_ID);

    client
        .connect()
        .map_err(|e| format!("Failed to connect to Discord: {}", e))?;

    Ok(client)
}

fn clip(text: String) -> String {
    if text.chars().count() <= MAX_TEXT_CHARS {
        return text;
    }
    let mut clipped: String = text.chars().take(MAX_TEXT_CHARS - 1).collect();
    clipped.push('…');
    clipped
}

/// The track even while paused: "Paused" alone said nothing about what was on.
fn show(client: &mut DiscordIpcClient, presence: Option<&Presence>) -> bool {
    let (details, state) = match presence.filter(|p| p.track_name.is_some()) {
        Some(p) => {
            let track = p.track_name.clone().unwrap_or_default();
            let artist = p
                .artist_name
                .clone()
                .unwrap_or_else(|| "Unknown artist".to_string());
            let mut state = if p.is_playing {
                artist
            } else {
                format!("Paused · {artist}")
            };
            if p.ai_queue_active {
                state.push_str(" • AI Queue");
            }
            (clip(track), clip(state))
        }
        None => (
            "Listening to MiniFy".to_string(),
            "Streaming music".to_string(),
        ),
    };

    let mut assets = activity::Assets::new()
        .large_image("minify_logo")
        .large_text("MiniFy - Minimal Music Player");
    if presence.is_some_and(|p| p.ai_queue_active) {
        assets = assets.small_image("ai_queue").small_text("AI Queue Active");
    }

    let activity = activity::Activity::new()
        .details(&details)
        .state(&state)
        .assets(assets)
        .buttons(vec![activity::Button::new("View on GitHub", GITHUB_URL)]);

    client.set_activity(activity).is_ok()
}

fn run(receiver: mpsc::Receiver<Message>) {
    let mut client: Option<DiscordIpcClient> = None;
    let mut last_failure: Option<Instant> = None;
    let mut enabled = false;
    let mut wanted: Option<Presence> = None;

    while let Ok(first) = receiver.recv() {
        // A burst (skipping through tracks) collapses into its final state.
        for message in std::iter::once(first).chain(receiver.try_iter()) {
            match message {
                Message::Enabled(on) => {
                    // Switching it on deserves a fresh attempt right away.
                    if on && !enabled {
                        last_failure = None;
                    }
                    enabled = on;
                }
                // Kept while disabled too, so switching on shows the current track.
                Message::Presence(presence) => wanted = Some(presence),
            }
        }

        if !enabled {
            if let Some(mut open) = client.take() {
                let _ = open.clear_activity();
                let _ = open.close();
            }
            continue;
        }

        if client.is_none() {
            if last_failure.is_some_and(|at| at.elapsed() < RECONNECT_BACKOFF) {
                continue;
            }
            match connect_discord() {
                Ok(open) => client = Some(open),
                Err(_) => {
                    last_failure = Some(Instant::now());
                    continue;
                }
            }
        }

        let Some(open) = client.as_mut() else {
            continue;
        };
        if !show(open, wanted.as_ref()) {
            // Discord went away; reconnect on a later update instead of spinning here.
            client = None;
            last_failure = Some(Instant::now());
        }
    }
}

#[tauri::command]
pub fn enable_discord_rpc(state: State<DiscordState>) -> Result<(), String> {
    state.set_enabled(true);
    Ok(())
}

#[tauri::command]
pub fn disable_discord_rpc(state: State<DiscordState>) -> Result<(), String> {
    state.set_enabled(false);
    Ok(())
}

#[tauri::command]
pub fn update_discord_presence(
    state: State<DiscordState>,
    track_name: Option<String>,
    artist_name: Option<String>,
    is_playing: bool,
    ai_queue_active: bool,
) -> Result<(), String> {
    state.send(Message::Presence(Presence {
        track_name,
        artist_name,
        is_playing,
        ai_queue_active,
    }));
    Ok(())
}

#[tauri::command]
pub fn is_discord_rpc_enabled(state: State<DiscordState>) -> Result<bool, String> {
    Ok(state.enabled.load(Ordering::Relaxed))
}

/// Applies the saved setting at startup; connecting happens on the worker.
pub fn init_discord_rpc(state: &DiscordState, enabled: bool) {
    state.set_enabled(enabled);
}

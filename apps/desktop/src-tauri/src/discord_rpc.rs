use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::Mutex;
use tauri::State;

// MiniFy Discord Application ID
const DISCORD_APPLICATION_ID: &str = "1456693272163385447";
const GITHUB_URL: &str = "https://github.com/ModioStudio/MiniFy";

pub struct DiscordState {
    pub client: Mutex<Option<DiscordIpcClient>>,
    pub enabled: Mutex<bool>,
}

impl DiscordState {
    pub fn new() -> Self {
        Self {
            client: Mutex::new(None),
            enabled: Mutex::new(true),
        }
    }
}

impl Default for DiscordState {
    fn default() -> Self {
        Self::new()
    }
}

fn connect_discord() -> Result<DiscordIpcClient, String> {
    let mut client = DiscordIpcClient::new(DISCORD_APPLICATION_ID)
        .map_err(|e| format!("Failed to create Discord client: {}", e))?;

    client
        .connect()
        .map_err(|e| format!("Failed to connect to Discord: {}", e))?;

    Ok(client)
}

fn create_buttons() -> Vec<activity::Button<'static>> {
    vec![activity::Button::new("View on GitHub", GITHUB_URL)]
}

#[tauri::command]
pub fn enable_discord_rpc(state: State<DiscordState>) -> Result<(), String> {
    let mut enabled = state
        .enabled
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    *enabled = true;

    let mut client_lock = state
        .client
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    if client_lock.is_none() {
        match connect_discord() {
            Ok(client) => {
                *client_lock = Some(client);
            }
            Err(e) => {
                return Err(format!("Could not connect to Discord: {}", e));
            }
        }
    }

    if let Some(client) = client_lock.as_mut() {
        let activity = activity::Activity::new()
            .state("Streaming music")
            .details("Listening to MiniFy")
            .assets(
                activity::Assets::new()
                    .large_image("minify_logo")
                    .large_text("MiniFy - Minimal Music Player"),
            )
            .buttons(create_buttons());

        client
            .set_activity(activity)
            .map_err(|e| format!("Failed to set activity: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn disable_discord_rpc(state: State<DiscordState>) -> Result<(), String> {
    let mut enabled = state
        .enabled
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    *enabled = false;

    let mut client_lock = state
        .client
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    if let Some(client) = client_lock.as_mut() {
        let _ = client.clear_activity();
        let _ = client.close();
    }

    *client_lock = None;

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
    let enabled = state
        .enabled
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    if !*enabled {
        return Ok(());
    }

    drop(enabled);

    let mut client_lock = state
        .client
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    if client_lock.is_none() {
        match connect_discord() {
            Ok(client) => {
                *client_lock = Some(client);
            }
            Err(_) => {
                return Ok(());
            }
        }
    }

    if let Some(client) = client_lock.as_mut() {
        let details = if is_playing {
            track_name.unwrap_or_else(|| "Listening to music".to_string())
        } else {
            "Paused".to_string()
        };

        let state_text = if ai_queue_active {
            format!(
                "{} • AI Queue",
                artist_name.unwrap_or_else(|| "MiniFy".to_string())
            )
        } else if is_playing {
            artist_name.unwrap_or_else(|| "Unknown Artist".to_string())
        } else {
            "MiniFy".to_string()
        };

        let small_image = if ai_queue_active { "ai_queue" } else { "" };
        let small_text = if ai_queue_active {
            "AI Queue Active"
        } else {
            ""
        };

        let mut assets = activity::Assets::new()
            .large_image("minify_logo")
            .large_text("MiniFy - Minimal Music Player");

        if ai_queue_active {
            assets = assets.small_image(small_image).small_text(small_text);
        }

        let activity = activity::Activity::new()
            .details(&details)
            .state(&state_text)
            .assets(assets)
            .buttons(create_buttons());

        if client.set_activity(activity).is_err() {
            *client_lock = None;
            if let Ok(new_client) = connect_discord() {
                *client_lock = Some(new_client);
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn is_discord_rpc_enabled(state: State<DiscordState>) -> Result<bool, String> {
    let enabled = state
        .enabled
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    Ok(*enabled)
}

pub fn init_discord_rpc(state: &DiscordState) {
    if let Ok(mut client_lock) = state.client.lock() {
        if let Ok(client) = connect_discord() {
            *client_lock = Some(client);

            if let Some(c) = client_lock.as_mut() {
                let activity = activity::Activity::new()
                    .state("Streaming music")
                    .details("Listening to MiniFy")
                    .assets(
                        activity::Assets::new()
                            .large_image("minify_logo")
                            .large_text("MiniFy - Minimal Music Player"),
                    )
                    .buttons(create_buttons());
                let _ = c.set_activity(activity);
            }
        }
    }
}


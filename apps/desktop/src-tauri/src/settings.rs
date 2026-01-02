use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use dirs::config_dir;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Settings {
    pub first_boot_done: bool,
    pub spotify: SpotifyTokens,
    pub layout: String,
    pub theme: String,
    #[serde(default)]
    pub ai_providers: Vec<AIProviderConfig>,
    #[serde(default)]
    pub active_ai_provider: Option<String>,
    #[serde(default = "default_music_provider")]
    pub active_music_provider: Option<String>,
    #[serde(default = "default_true")]
    pub show_ai_queue_border: bool,
    #[serde(default = "default_true")]
    pub discord_rpc_enabled: bool,
}

fn default_true() -> bool {
    true
}

fn default_music_provider() -> Option<String> {
    Some("spotify".to_string())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SpotifyTokens {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AIProviderConfig {
    pub provider: String,
    #[serde(default, skip_serializing)]
    pub api_key: String,
    pub enabled: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            first_boot_done: false,
            spotify: SpotifyTokens { access_token: None, refresh_token: None },
            layout: "LayoutA".into(),
            theme: "dark".into(),
            ai_providers: Vec::new(),
            active_ai_provider: None,
            active_music_provider: Some("spotify".into()),
            show_ai_queue_border: true,
            discord_rpc_enabled: true,
        }
    }
}

fn get_settings_path() -> PathBuf {
    let mut path = config_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("MiniFy");
    fs::create_dir_all(&path).ok();
    path.push("settings.json");
    path
}

#[tauri::command]
pub fn read_settings() -> Settings {
    let path = get_settings_path();
    if let Ok(raw) = fs::read_to_string(&path) {
        serde_json::from_str(&raw).unwrap_or_default()
    } else {
        Settings::default()
    }
}

#[tauri::command]
pub fn write_settings(settings: Settings) -> bool {
    let path = get_settings_path();
    fs::write(&path, serde_json::to_string_pretty(&settings).unwrap()).is_ok()
}

#[tauri::command]
pub fn clear_settings() -> bool {
    let path = get_settings_path();
    fs::remove_file(&path).is_ok()
}


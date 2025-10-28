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
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SpotifyTokens {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            first_boot_done: false,
            spotify: SpotifyTokens { access_token: None, refresh_token: None },
            layout: "LayoutA".into(),
            theme: "dark".into(),
        }
    }
}

fn get_settings_path() -> PathBuf {
    let mut path = config_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("spotify-mini-player");
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


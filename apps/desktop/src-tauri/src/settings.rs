use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

fn get_settings_path() -> PathBuf {
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let mut path = PathBuf::from(app_data);
    path.push("MiniFy");
    fs::create_dir_all(&path).ok();
    path.push("settings.json");
    path
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CachedTrackArtist {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CachedTrackAlbumImage {
    pub url: String,
    pub height: u32,
    pub width: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CachedTrackAlbum {
    pub id: String,
    pub name: String,
    pub images: Vec<CachedTrackAlbumImage>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CachedTrack {
    pub id: String,
    pub name: String,
    pub duration_ms: u64,
    pub artists: Vec<CachedTrackArtist>,
    pub album: CachedTrackAlbum,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LastPlayedTrack {
    pub track: CachedTrack,
    pub progress_ms: u64,
    pub cached_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Settings {
    pub first_boot_done: bool,
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
    #[serde(default)]
    pub last_played_track: Option<LastPlayedTrack>,
}

fn default_true() -> bool {
    true
}

fn default_music_provider() -> Option<String> {
    Some("spotify".to_string())
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
            layout: "LayoutA".into(),
            theme: "dark".into(),
            ai_providers: Vec::new(),
            active_ai_provider: None,
            active_music_provider: Some("spotify".into()),
            show_ai_queue_border: true,
            discord_rpc_enabled: true,
            last_played_track: None,
        }
    }
}

#[tauri::command]
pub fn read_settings() -> Settings {
    let path = get_settings_path();
    
    if !path.exists() {
        return Settings::default();
    }
    
    fs::read_to_string(&path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn write_settings(settings: Settings) -> bool {
    let path = get_settings_path();
    
    let json = match serde_json::to_string_pretty(&settings) {
        Ok(j) => j,
        Err(e) => {
            eprintln!("Failed to serialize settings: {}", e);
            return false;
        }
    };
    
    match fs::write(&path, &json) {
        Ok(_) => true,
        Err(e) => {
            eprintln!("Failed to write settings: {}", e);
            false
        }
    }
}

#[tauri::command]
pub fn clear_settings() -> bool {
    let path = get_settings_path();
    
    if path.exists() {
        fs::remove_file(&path).is_ok()
    } else {
        true
    }
}

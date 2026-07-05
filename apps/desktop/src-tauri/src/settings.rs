use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn get_settings_path(app: &AppHandle) -> PathBuf {
    let mut path = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
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
    pub uri: String,
    pub provider: String,
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
    #[serde(default = "default_window_opacity")]
    pub window_opacity: u8,
    #[serde(default)]
    pub show_music_visualizer: bool,
    #[serde(default = "default_visualizer_color")]
    pub music_visualizer_color: String,
    #[serde(default = "default_visualizer_intensity")]
    pub music_visualizer_intensity: u8,
    #[serde(default)]
    pub last_played_track: Option<LastPlayedTrack>,
}

fn default_true() -> bool {
    true
}

fn default_music_provider() -> Option<String> {
    Some("spotify".to_string())
}

fn default_window_opacity() -> u8 {
    100
}

fn default_visualizer_color() -> String {
    "theme".to_string()
}

fn default_visualizer_intensity() -> u8 {
    100
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
            window_opacity: 100,
            show_music_visualizer: false,
            music_visualizer_color: "theme".into(),
            music_visualizer_intensity: 100,
            last_played_track: None,
        }
    }
}

#[tauri::command]
pub fn read_settings(app: AppHandle) -> Settings {
    let path = get_settings_path(&app);
    
    if !path.exists() {
        return Settings::default();
    }
    
    fs::read_to_string(&path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn write_settings(app: AppHandle, settings: Settings) -> bool {
    let path = get_settings_path(&app);
    
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
pub fn clear_settings(app: AppHandle) -> bool {
    let path = get_settings_path(&app);
    
    if path.exists() {
        fs::remove_file(&path).is_ok()
    } else {
        true
    }
}

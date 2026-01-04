use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

fn get_custom_themes_dir() -> PathBuf {
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let mut path = PathBuf::from(app_data);
    path.push("MiniFy");
    path.push("themes");
    fs::create_dir_all(&path).ok();
    path
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect::<String>()
        .to_lowercase()
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CustomTheme {
    pub name: String,
    pub panel: Option<PanelConfig>,
    pub settings: Option<SettingsConfig>,
    pub controls: Option<ControlsConfig>,
    pub playbar: Option<PlaybarConfig>,
    pub typography: Option<TypographyConfig>,
    pub actions: Option<ActionsConfig>,
    pub cover: Option<CoverConfig>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PanelConfig {
    pub background: Option<String>,
    #[serde(rename = "borderRadius")]
    pub border_radius: Option<u32>,
    pub shadow: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SettingsConfig {
    #[serde(rename = "panelBg")]
    pub panel_bg: Option<String>,
    #[serde(rename = "panelBorder")]
    pub panel_border: Option<String>,
    pub text: Option<String>,
    #[serde(rename = "textMuted")]
    pub text_muted: Option<String>,
    #[serde(rename = "itemHover")]
    pub item_hover: Option<String>,
    #[serde(rename = "itemActive")]
    pub item_active: Option<String>,
    pub accent: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ControlsConfig {
    #[serde(rename = "iconColor")]
    pub icon_color: Option<String>,
    #[serde(rename = "iconColorActive")]
    pub icon_color_active: Option<String>,
    #[serde(rename = "iconBackground")]
    pub icon_background: Option<String>,
    #[serde(rename = "iconBackgroundHover")]
    pub icon_background_hover: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PlaybarConfig {
    #[serde(rename = "trackBg")]
    pub track_bg: Option<String>,
    #[serde(rename = "trackFill")]
    pub track_fill: Option<String>,
    #[serde(rename = "thumbColor")]
    pub thumb_color: Option<String>,
    #[serde(rename = "timeTextColor")]
    pub time_text_color: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TypographyConfig {
    #[serde(rename = "songTitle")]
    pub song_title: Option<TextStyle>,
    #[serde(rename = "songArtist")]
    pub song_artist: Option<TextStyle>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TextStyle {
    pub color: Option<String>,
    pub weight: Option<u32>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ActionsConfig {
    #[serde(rename = "iconColor")]
    pub icon_color: Option<String>,
    #[serde(rename = "iconBackground")]
    pub icon_background: Option<String>,
    #[serde(rename = "iconBackgroundHover")]
    pub icon_background_hover: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CoverConfig {
    #[serde(rename = "borderColor")]
    pub border_color: Option<String>,
    #[serde(rename = "borderRadius")]
    pub border_radius: Option<u32>,
}

#[tauri::command]
pub fn save_custom_theme(theme_json: String) -> Result<String, String> {
    let theme: CustomTheme = serde_json::from_str(&theme_json)
        .map_err(|e| format!("Invalid JSON: {}", e))?;
    
    let filename = format!("{}.json", sanitize_filename(&theme.name));
    let mut path = get_custom_themes_dir();
    path.push(&filename);
    
    fs::write(&path, &theme_json)
        .map_err(|e| format!("Failed to save theme: {}", e))?;
    
    Ok(theme.name)
}

#[tauri::command]
pub fn load_custom_themes() -> Vec<CustomTheme> {
    let dir = get_custom_themes_dir();
    
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };
    
    entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry.path().extension()
                .map(|ext| ext == "json")
                .unwrap_or(false)
        })
        .filter_map(|entry| {
            fs::read_to_string(entry.path())
                .ok()
                .and_then(|content| serde_json::from_str(&content).ok())
        })
        .collect()
}

#[tauri::command]
pub fn delete_custom_theme(theme_name: String) -> Result<bool, String> {
    let filename = format!("{}.json", sanitize_filename(&theme_name));
    let mut path = get_custom_themes_dir();
    path.push(&filename);
    
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete theme: {}", e))?;
        Ok(true)
    } else {
        Err("Theme not found".to_string())
    }
}

#[tauri::command]
pub fn export_custom_theme(theme_name: String) -> Result<String, String> {
    let filename = format!("{}.json", sanitize_filename(&theme_name));
    let mut path = get_custom_themes_dir();
    path.push(&filename);
    
    if path.exists() {
        fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read theme: {}", e))
    } else {
        Err("Theme not found".to_string())
    }
}

#[tauri::command]
pub fn validate_theme_json(theme_json: String) -> Result<bool, String> {
    let _: CustomTheme = serde_json::from_str(&theme_json)
        .map_err(|e| format!("Invalid JSON: {}", e))?;
    Ok(true)
}

pub fn clear_custom_themes() -> bool {
    let dir = get_custom_themes_dir();
    
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if entry.path().extension().map(|e| e == "json").unwrap_or(false) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    true
}

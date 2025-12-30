use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use dirs::config_dir;

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

fn get_custom_themes_dir() -> PathBuf {
    let mut path = config_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("MiniFy");
    path.push("custom_themes");
    fs::create_dir_all(&path).ok();
    path
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect::<String>()
        .to_lowercase()
}

#[tauri::command]
pub fn save_custom_theme(theme_json: String) -> Result<String, String> {
    let theme: CustomTheme = serde_json::from_str(&theme_json)
        .map_err(|e| format!("Invalid JSON: {}", e))?;
    
    if theme.name.trim().is_empty() {
        return Err("Theme name is required".to_string());
    }
    
    let filename = format!("{}.json", sanitize_filename(&theme.name));
    let mut path = get_custom_themes_dir();
    path.push(&filename);
    
    fs::write(&path, serde_json::to_string_pretty(&theme).unwrap())
        .map_err(|e| format!("Failed to save theme: {}", e))?;
    
    Ok(filename)
}

#[tauri::command]
pub fn load_custom_themes() -> Vec<CustomTheme> {
    let dir = get_custom_themes_dir();
    let mut themes = Vec::new();
    
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(theme) = serde_json::from_str::<CustomTheme>(&content) {
                        themes.push(theme);
                    }
                }
            }
        }
    }
    
    themes
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


use keyring::Entry;
use serde::{Deserialize, Serialize};

const KEYRING_SERVICE: &str = "minify";

const AI_KEY_PREFIX: &str = "ai_key_";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIProviderKeyring {
    pub provider: String,
    pub has_key: bool,
}

fn get_ai_key_name(provider: &str) -> String {
    format!("{}{}", AI_KEY_PREFIX, provider)
}

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, key).map_err(|e| format!("Keyring init failed: {}", e))
}

#[tauri::command]
pub async fn save_ai_api_key(provider: String, api_key: String) -> Result<(), String> {
    if api_key.trim().is_empty() {
        return Err("API key is empty".to_string());
    }
    
    let key_name = get_ai_key_name(&provider);
    entry(&key_name)?
        .set_password(&api_key)
        .map_err(|e| format!("Failed to save AI API key: {}", e))
}

#[tauri::command]
pub async fn get_ai_api_key(provider: String) -> Result<String, String> {
    let key_name = get_ai_key_name(&provider);
    entry(&key_name)?
        .get_password()
        .map_err(|e| format!("Failed to get AI API key: {}", e))
}

#[tauri::command]
pub async fn has_ai_api_key(provider: String) -> bool {
    let key_name = get_ai_key_name(&provider);
    entry(&key_name)
        .and_then(|e| e.get_password().map_err(|e| e.to_string()))
        .is_ok()
}

#[tauri::command]
pub async fn delete_ai_api_key(provider: String) -> Result<(), String> {
    let key_name = get_ai_key_name(&provider);
    entry(&key_name)?
        .delete_password()
        .map_err(|e| format!("Failed to delete AI API key: {}", e))
}

#[tauri::command]
pub async fn get_all_ai_providers() -> Vec<AIProviderKeyring> {
    let providers = vec!["openai", "anthropic", "google", "groq"];
    
    providers
        .into_iter()
        .map(|p| {
            let key_name = get_ai_key_name(p);
            let has_key = entry(&key_name)
                .and_then(|e| e.get_password().map_err(|e| e.to_string()))
                .is_ok();
            AIProviderKeyring {
                provider: p.to_string(),
                has_key,
            }
        })
        .collect()
}

#[tauri::command]
pub async fn clear_all_ai_keys() -> Result<(), String> {
    let providers = vec!["openai", "anthropic", "google", "groq"];
    
    for provider in providers {
        let key_name = get_ai_key_name(provider);
        let _ = entry(&key_name).and_then(|e| e.delete_password().map_err(|e| e.to_string()));
    }
    
    Ok(())
}


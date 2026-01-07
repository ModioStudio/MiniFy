use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

const KEYRING_SERVICE: &str = "minify";
const AI_KEY_PREFIX: &str = "ai_key_";

lazy_static::lazy_static! {
    static ref AI_KEY_CACHE: Arc<Mutex<HashMap<String, String>>> = Arc::new(Mutex::new(HashMap::new()));
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIProviderKeyring {
    pub provider: String,
    pub has_key: bool,
}

fn get_ai_key_name(provider: &str) -> String {
    format!("{}{}", AI_KEY_PREFIX, provider)
}

fn entry(key: &str) -> Result<Entry, keyring::Error> {
    Entry::new(KEYRING_SERVICE, key)
}

fn get_cached_ai_key(provider: &str) -> Option<String> {
    AI_KEY_CACHE.lock().ok().and_then(|g| g.get(provider).cloned())
}

fn set_cached_ai_key(provider: &str, key: &str) {
    if let Ok(mut cache) = AI_KEY_CACHE.lock() {
        cache.insert(provider.to_string(), key.to_string());
    }
}

fn remove_cached_ai_key(provider: &str) {
    if let Ok(mut cache) = AI_KEY_CACHE.lock() {
        cache.remove(provider);
    }
}

fn clear_all_cached_ai_keys() {
    if let Ok(mut cache) = AI_KEY_CACHE.lock() {
        cache.clear();
    }
}

#[tauri::command]
pub async fn save_ai_api_key(provider: String, api_key: String) -> Result<(), String> {
    if api_key.trim().is_empty() {
        return Err("API key is empty".to_string());
    }
    
    let api_key_trimmed = api_key.trim().to_string();
    set_cached_ai_key(&provider, &api_key_trimmed);
    
    let key_name = get_ai_key_name(&provider);
    let api_key_clone = api_key_trimmed.clone();
    
    tokio::task::spawn_blocking(move || {
        entry(&key_name)
            .map_err(|e| format!("Keyring error: {}", e))?
            .set_password(&api_key_clone)
            .map_err(|e| format!("Failed to save AI API key: {}", e))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_ai_api_key(provider: String) -> Result<String, String> {
    if let Some(cached) = get_cached_ai_key(&provider) {
        return Ok(cached);
    }
    
    let key_name = get_ai_key_name(&provider);
    let provider_clone = provider.clone();
    
    let result = tokio::task::spawn_blocking(move || {
        entry(&key_name)
            .map_err(|e| format!("Keyring error: {}", e))?
            .get_password()
            .map_err(|e| format!("Failed to get AI API key: {}", e))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;
    
    set_cached_ai_key(&provider_clone, &result);
    Ok(result)
}

#[tauri::command]
pub async fn has_ai_api_key(provider: String) -> bool {
    if get_cached_ai_key(&provider).is_some() {
        return true;
    }
    
    let key_name = get_ai_key_name(&provider);
    let provider_clone = provider.clone();
    
    let result = tokio::task::spawn_blocking(move || {
        entry(&key_name).ok().and_then(|e| e.get_password().ok())
    })
    .await
    .ok()
    .flatten();
    
    if let Some(ref key) = result {
        set_cached_ai_key(&provider_clone, key);
    }
    
    result.is_some()
}

#[tauri::command]
pub async fn delete_ai_api_key(provider: String) -> Result<(), String> {
    remove_cached_ai_key(&provider);
    
    let key_name = get_ai_key_name(&provider);
    tokio::task::spawn_blocking(move || {
        entry(&key_name)
            .map_err(|e| format!("Keyring error: {}", e))?
            .delete_password()
            .map_err(|e| format!("Failed to delete AI API key: {}", e))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_all_ai_providers() -> Vec<AIProviderKeyring> {
    let providers = vec!["openai", "anthropic", "google", "groq"];
    
    let mut results = Vec::new();
    for p in providers {
        let has_key = has_ai_api_key(p.to_string()).await;
        results.push(AIProviderKeyring {
            provider: p.to_string(),
            has_key,
        });
    }
    results
}

#[tauri::command]
pub async fn clear_all_ai_keys() -> Result<(), String> {
    clear_all_cached_ai_keys();
    
    let providers = vec!["openai", "anthropic", "google", "groq"];
    
    tokio::task::spawn_blocking(move || {
        for p in providers {
            let key_name = get_ai_key_name(p);
            if let Ok(e) = entry(&key_name) {
                let _ = e.delete_password();
            }
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

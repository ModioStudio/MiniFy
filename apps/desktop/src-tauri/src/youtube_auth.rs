use chrono::Utc;
use rand::RngCore;
use reqwest::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tauri::async_runtime as rt;
use tauri::AppHandle;
use tauri::Emitter;
use keyring::Entry;
use tokio::time::sleep;

const KEYRING_SERVICE: &str = "minify";
const YT_ACCESS_TOKEN_KEY: &str = "youtube_access_token";
const YT_REFRESH_TOKEN_KEY: &str = "youtube_refresh_token";
const YT_TOKEN_EXPIRY_KEY: &str = "youtube_token_expiry";
const YT_CLIENT_ID_KEY: &str = "youtube_client_id";
const YT_CLIENT_SECRET_KEY: &str = "youtube_client_secret";

lazy_static::lazy_static! {
    static ref YT_CLIENT_ID_CACHE: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    static ref YT_CLIENT_SECRET_CACHE: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    static ref YT_TOKENS_CACHE: Arc<Mutex<Option<YouTubeTokens>>> = Arc::new(Mutex::new(None));
}

fn get_embedded_youtube_client_id() -> Option<String> {
    option_env!("YOUTUBE_CLIENT_ID")
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

fn get_embedded_youtube_client_secret() -> Option<String> {
    option_env!("YOUTUBE_CLIENT_SECRET")
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

fn has_embedded_youtube_credentials() -> bool {
    get_embedded_youtube_client_id().is_some() && get_embedded_youtube_client_secret().is_some()
}

fn get_cached_yt_tokens() -> Option<YouTubeTokens> {
    YT_TOKENS_CACHE.lock().ok().and_then(|g| g.clone())
}

fn set_cached_yt_tokens(tokens: &YouTubeTokens) {
    if let Ok(mut cache) = YT_TOKENS_CACHE.lock() {
        *cache = Some(tokens.clone());
    }
}

fn clear_cached_yt_tokens() {
    if let Ok(mut cache) = YT_TOKENS_CACHE.lock() {
        *cache = None;
    }
}

fn get_cached_yt_client_id() -> Option<String> {
    YT_CLIENT_ID_CACHE.lock().ok().and_then(|g| g.clone())
}

fn set_cached_yt_client_id(id: &str) {
    if let Ok(mut cache) = YT_CLIENT_ID_CACHE.lock() {
        *cache = Some(id.to_string());
    }
}

fn clear_cached_yt_client_id() {
    if let Ok(mut cache) = YT_CLIENT_ID_CACHE.lock() {
        *cache = None;
    }
}

fn get_cached_yt_client_secret() -> Option<String> {
    YT_CLIENT_SECRET_CACHE.lock().ok().and_then(|g| g.clone())
}

fn set_cached_yt_client_secret(secret: &str) {
    if let Ok(mut cache) = YT_CLIENT_SECRET_CACHE.lock() {
        *cache = Some(secret.to_string());
    }
}

fn clear_cached_yt_client_secret() {
    if let Ok(mut cache) = YT_CLIENT_SECRET_CACHE.lock() {
        *cache = None;
    }
}

fn entry(key: &str) -> Result<Entry, keyring::Error> {
    Entry::new(KEYRING_SERVICE, key)
}

async fn get_stored_youtube_client_id() -> Option<String> {
    if let Some(cached) = get_cached_yt_client_id() {
        return Some(cached);
    }
    
    let result = tokio::task::spawn_blocking(|| {
        entry(YT_CLIENT_ID_KEY).ok().and_then(|e| e.get_password().ok())
    })
    .await
    .ok()
    .flatten();
    
    if let Some(ref id) = result {
        set_cached_yt_client_id(id);
    }
    
    result
}

async fn get_stored_youtube_client_secret() -> Option<String> {
    if let Some(cached) = get_cached_yt_client_secret() {
        return Some(cached);
    }
    
    let result = tokio::task::spawn_blocking(|| {
        entry(YT_CLIENT_SECRET_KEY).ok().and_then(|e| e.get_password().ok())
    })
    .await
    .ok()
    .flatten();
    
    if let Some(ref secret) = result {
        set_cached_yt_client_secret(secret);
    }
    
    result
}

#[tauri::command]
pub async fn has_youtube_client_id() -> bool {
    has_embedded_youtube_credentials() || 
    (get_stored_youtube_client_id().await.is_some() && get_stored_youtube_client_secret().await.is_some())
}

#[tauri::command]
pub async fn has_youtube_credentials() -> bool {
    has_embedded_youtube_credentials() || 
    (get_stored_youtube_client_id().await.is_some() && get_stored_youtube_client_secret().await.is_some())
}

#[tauri::command]
pub async fn save_youtube_credentials(client_id: String, client_secret: String) -> Result<(), String> {
    if client_id.trim().is_empty() {
        return Err("Client ID is empty".to_string());
    }
    if client_secret.trim().is_empty() {
        return Err("Client Secret is empty".to_string());
    }
    
    let client_id_trimmed = client_id.trim().to_string();
    let client_secret_trimmed = client_secret.trim().to_string();
    
    set_cached_yt_client_id(&client_id_trimmed);
    set_cached_yt_client_secret(&client_secret_trimmed);
    
    let id_clone = client_id_trimmed.clone();
    let secret_clone = client_secret_trimmed.clone();
    
    tokio::task::spawn_blocking(move || {
        entry(YT_CLIENT_ID_KEY)
            .map_err(|e| format!("Keyring error: {}", e))?
            .set_password(&id_clone)
            .map_err(|e| format!("Failed to save YouTube client ID: {}", e))?;
        entry(YT_CLIENT_SECRET_KEY)
            .map_err(|e| format!("Keyring error: {}", e))?
            .set_password(&secret_clone)
            .map_err(|e| format!("Failed to save YouTube client secret: {}", e))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn needs_youtube_setup() -> bool {
    !has_embedded_youtube_credentials() && !has_youtube_credentials().await
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YouTubeTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
}

#[derive(Debug, Clone)]
struct YouTubeAuthState {
    client_id: String,
    client_secret: String,
    state_nonce: String,
}

lazy_static::lazy_static! {
    static ref YT_AUTH_STATE: Arc<Mutex<Option<YouTubeAuthState>>> = Arc::new(Mutex::new(None));
    static ref YT_OAUTH_SHUTDOWN: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>> = Arc::new(Mutex::new(None));
}

async fn save_youtube_tokens(tokens: &YouTubeTokens) -> Result<(), String> {
    set_cached_yt_tokens(tokens);
    
    let access_token = tokens.access_token.clone();
    let refresh_token = tokens.refresh_token.clone();
    let expires_at = tokens.expires_at.to_string();
    
    tokio::task::spawn_blocking(move || {
        entry(YT_ACCESS_TOKEN_KEY)
            .map_err(|e| format!("Keyring error: {}", e))?
            .set_password(&access_token)
            .map_err(|e| format!("Failed to save YouTube access token: {}", e))?;
        entry(YT_REFRESH_TOKEN_KEY)
            .map_err(|e| format!("Keyring error: {}", e))?
            .set_password(&refresh_token)
            .map_err(|e| format!("Failed to save YouTube refresh token: {}", e))?;
        entry(YT_TOKEN_EXPIRY_KEY)
            .map_err(|e| format!("Keyring error: {}", e))?
            .set_password(&expires_at)
            .map_err(|e| format!("Failed to save YouTube token expiry: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_youtube_tokens() -> Result<YouTubeTokens, String> {
    if let Some(cached) = get_cached_yt_tokens() {
        return Ok(cached);
    }
    
    let result = tokio::task::spawn_blocking(|| -> Result<YouTubeTokens, String> {
        let access_token = entry(YT_ACCESS_TOKEN_KEY)
            .map_err(|e| format!("Keyring error: {}", e))?
            .get_password()
            .map_err(|e| format!("Failed to get YouTube access token: {}", e))?;
        let refresh_token = entry(YT_REFRESH_TOKEN_KEY)
            .map_err(|e| format!("Keyring error: {}", e))?
            .get_password()
            .map_err(|e| format!("Failed to get YouTube refresh token: {}", e))?;
        let expires_at_str = entry(YT_TOKEN_EXPIRY_KEY)
            .map_err(|e| format!("Keyring error: {}", e))?
            .get_password()
            .map_err(|e| format!("Failed to get YouTube token expiry: {}", e))?;
        let expires_at = expires_at_str
            .parse::<i64>()
            .map_err(|e| format!("Failed to parse expiry: {}", e))?;

        Ok(YouTubeTokens { access_token, refresh_token, expires_at })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;
    
    set_cached_yt_tokens(&result);
    Ok(result)
}

#[tauri::command]
pub async fn has_valid_youtube_tokens() -> bool {
    match get_youtube_tokens().await {
        Ok(tokens) => Utc::now().timestamp() < tokens.expires_at,
        Err(_) => false,
    }
}

#[tauri::command]
pub async fn clear_youtube_credentials() -> Result<(), String> {
    {
        let mut s = YT_AUTH_STATE.lock().unwrap();
        *s = None;
    }
    {
        let mut shutdown = YT_OAUTH_SHUTDOWN.lock().unwrap();
        if let Some(tx) = shutdown.take() {
            let _ = tx.send(());
        }
    }
    clear_cached_yt_client_id();
    clear_cached_yt_client_secret();
    clear_cached_yt_tokens();
    
    tokio::task::spawn_blocking(|| {
        if let Ok(e) = entry(YT_ACCESS_TOKEN_KEY) { let _ = e.delete_password(); }
        if let Ok(e) = entry(YT_REFRESH_TOKEN_KEY) { let _ = e.delete_password(); }
        if let Ok(e) = entry(YT_TOKEN_EXPIRY_KEY) { let _ = e.delete_password(); }
        if let Ok(e) = entry(YT_CLIENT_ID_KEY) { let _ = e.delete_password(); }
        if let Ok(e) = entry(YT_CLIENT_SECRET_KEY) { let _ = e.delete_password(); }
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;
    Ok(())
}

async fn exchange_youtube_code_for_tokens(state: &YouTubeAuthState, code: &str) -> Result<YouTubeTokens, String> {
    let redirect_uri = "http://127.0.0.1:3001/callback";
    let form = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", &state.client_id),
        ("client_secret", &state.client_secret),
    ];

    let client = reqwest::Client::new();
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("Token request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Token request failed: {} - {}", status, text));
    }

    #[derive(Deserialize)]
    struct TokenResponse {
        access_token: String,
        refresh_token: Option<String>,
        expires_in: i64,
    }

    let tr: TokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    let expires_at = Utc::now().timestamp() + tr.expires_in - 30;
    let refresh_token = tr
        .refresh_token
        .ok_or_else(|| "Missing refresh_token in response".to_string())?;

    Ok(YouTubeTokens { access_token: tr.access_token, refresh_token, expires_at })
}

#[tauri::command]
pub async fn cancel_youtube_oauth_flow() -> Result<(), String> {
    {
        let mut s = YT_AUTH_STATE.lock().unwrap();
        *s = None;
    }
    let mut shutdown = YT_OAUTH_SHUTDOWN.lock().unwrap();
    if let Some(tx) = shutdown.take() {
        let _ = tx.send(());
    }
    Ok(())
}

#[tauri::command]
pub async fn start_youtube_oauth_flow(app: AppHandle) -> Result<(), String> {
    {
        let mut shutdown = YT_OAUTH_SHUTDOWN.lock().unwrap();
        if let Some(tx) = shutdown.take() {
            let _ = tx.send(());
        }
    }
    
    sleep(std::time::Duration::from_millis(100)).await;

    let client_id = get_embedded_youtube_client_id()
        .or(get_stored_youtube_client_id().await)
        .ok_or_else(|| "No YouTube Client ID configured. Please set up your credentials first.".to_string())?;
    
    let client_secret = get_embedded_youtube_client_secret()
        .or(get_stored_youtube_client_secret().await)
        .ok_or_else(|| "No YouTube Client Secret configured. Please set up your credentials first.".to_string())?;

    {
        let mut s = YT_AUTH_STATE.lock().unwrap();
        *s = None;
    }

    let mut state_bytes = [0u8; 16];
    rand::rng().fill_bytes(&mut state_bytes);
    let state_nonce = hex::encode(state_bytes);

    {
        let mut s = YT_AUTH_STATE.lock().unwrap();
        *s = Some(YouTubeAuthState { 
            client_id: client_id.clone(),
            client_secret: client_secret.clone(),
            state_nonce: state_nonce.clone(),
        });
    }

    let app_handle = app.clone();
    let (ready_tx, ready_rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    
    {
        let mut shutdown = YT_OAUTH_SHUTDOWN.lock().unwrap();
        *shutdown = Some(shutdown_tx);
    }

    rt::spawn(async move {
        use axum::{extract::Query, routing::get, Router};
        use std::collections::HashMap;

        let (callback_done_tx, mut callback_done_rx) = tokio::sync::mpsc::channel::<()>(1);

        let router = Router::new().route(
            "/callback",
            get({
                let app = app_handle.clone();
                let done_tx = callback_done_tx.clone();
                move |query: Query<HashMap<String, String>>| {
                    let app = app.clone();
                    let done_tx = done_tx.clone();
                    async move {
                        let result = handle_youtube_oauth_callback(query, app).await;
                        let _ = done_tx.send(()).await;
                        result
                    }
                }
            }),
        );

        let addr: SocketAddr = "127.0.0.1:3001".parse().unwrap();
        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                let _ = app_handle.emit("youtube-oauth-failed", json!({ "error": format!("bind_failed: {}", e) }));
                let _ = ready_tx.send(Err(format!("bind_failed: {}", e)));
                return;
            }
        };
        let _ = ready_tx.send(Ok(()));

        let server = axum::serve(listener, router);
        
        tokio::select! {
            _ = server => {}
            _ = callback_done_rx.recv() => {
                sleep(std::time::Duration::from_millis(500)).await;
            }
            _ = shutdown_rx => {}
            _ = sleep(std::time::Duration::from_secs(300)) => {
                let _ = app_handle.emit("youtube-oauth-failed", json!({ "error": "OAuth timeout - please try again" }));
            }
        }
        
        let mut shutdown = YT_OAUTH_SHUTDOWN.lock().unwrap();
        *shutdown = None;
    });

    let _ = ready_rx.await.map_err(|_| "server_not_ready".to_string())??;

    let redirect_uri = urlencoding::encode("http://127.0.0.1:3001/callback");
    let scopes = "https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.readonly";
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&response_type=code&redirect_uri={}&scope={}&access_type=offline&prompt=consent&state={}",
        urlencoding::encode(&client_id),
        redirect_uri,
        urlencoding::encode(scopes),
        state_nonce
    );

    webbrowser::open(&auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;

    Ok(())
}

async fn handle_youtube_oauth_callback(
    query: axum::extract::Query<std::collections::HashMap<String, String>>,
    app: AppHandle,
) -> axum::response::Html<String> {
    use axum::response::Html;

    if let Some(err) = query.get("error") {
        let _ = app.emit("youtube-oauth-failed", json!({ "error": err }));
        return Html(youtube_error_page("Authentication was denied or failed"));
    }

    let code = match query.get("code") {
        Some(c) => c.to_string(),
        None => {
            let _ = app.emit("youtube-oauth-failed", json!({ "error": "missing_code" }));
            return Html(youtube_error_page("Missing authorization code"));
        }
    };

    let auth_state = {
        let s = YT_AUTH_STATE.lock().unwrap();
        s.clone()
    };

    let Some(st) = auth_state else {
        let _ = app.emit("youtube-oauth-failed", json!({ "error": "no_auth_state" }));
        return Html(youtube_error_page("Session expired - please close old browser tabs and try again"));
    };

    let state_param = query.get("state").cloned().unwrap_or_default();
    if state_param != st.state_nonce {
        return Html(youtube_error_page("This login session has expired. Please close this tab and try again in the app."));
    }

    {
        let mut s = YT_AUTH_STATE.lock().unwrap();
        *s = None;
    }

    match exchange_youtube_code_for_tokens(&st, &code).await {
        Ok(tokens) => {
            if let Err(e) = save_youtube_tokens(&tokens).await {
                let _ = app.emit("youtube-oauth-failed", json!({ "error": e }));
                return Html(youtube_error_page("Failed to save credentials"));
            }
            
            let _ = app.emit("youtube-oauth-success", json!({}));
            Html(youtube_success_page())
        }
        Err(e) => {
            let _ = app.emit("youtube-oauth-failed", json!({ "error": e }));
            Html(youtube_error_page(&format!("Token exchange failed: {}", e)))
        }
    }
}

fn youtube_success_page() -> String {
    r##"<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>MiniFy - YouTube Connected</title></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
<div style="text-align:center;padding:2rem;background:rgba(255,255,255,0.05);border-radius:16px;border:1px solid rgba(255,255,255,0.1)">
<div style="width:64px;height:64px;background:#ff0000;border-radius:12px;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem">
<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
</div>
<h1 style="color:#ff0000;margin:0 0 0.5rem;font-size:1.5rem">YouTube Connected!</h1>
<p style="color:rgba(255,255,255,0.6);margin:0">You can close this window</p>
<script>setTimeout(()=>window.close(),1500)</script>
</div></body></html>"##.to_string()
}

fn escape_html(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}

fn youtube_error_page(message: &str) -> String {
    let escaped_message = escape_html(message);
    format!(r##"<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>MiniFy - Error</title></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
<div style="text-align:center;padding:2rem;background:rgba(255,255,255,0.05);border-radius:16px;border:1px solid rgba(239,68,68,0.3);max-width:400px">
<div style="width:64px;height:64px;background:#ef4444;border-radius:12px;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem">
<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
</div>
<h1 style="color:#ef4444;margin:0 0 0.5rem;font-size:1.25rem">Authentication Failed</h1>
<p style="color:rgba(255,255,255,0.6);margin:0;font-size:0.9rem">{}</p>
<p style="color:rgba(255,255,255,0.4);margin:1rem 0 0;font-size:0.8rem">Please close this window and try again in the app</p>
</div></body></html>"##, escaped_message)
}

#[tauri::command]
pub async fn refresh_youtube_access_token() -> Result<YouTubeTokens, String> {
    let tokens = get_youtube_tokens().await?;
    let client_id = get_embedded_youtube_client_id()
        .or(get_stored_youtube_client_id().await)
        .ok_or_else(|| "No YouTube Client ID configured".to_string())?;
    let client_secret = get_embedded_youtube_client_secret()
        .or(get_stored_youtube_client_secret().await)
        .ok_or_else(|| "No YouTube Client Secret configured".to_string())?;
    
    let form = [
        ("grant_type", "refresh_token"),
        ("refresh_token", tokens.refresh_token.as_str()),
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
    ];

    let client = reqwest::Client::new();
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("Refresh request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Refresh failed: {} - {}", status, text));
    }

    #[derive(Deserialize)]
    struct RefreshResponse {
        access_token: String,
        expires_in: i64,
    }

    let rr: RefreshResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    let expires_at = Utc::now().timestamp() + rr.expires_in - 30;
    let updated = YouTubeTokens { 
        access_token: rr.access_token, 
        refresh_token: tokens.refresh_token, 
        expires_at 
    };
    save_youtube_tokens(&updated).await?;
    Ok(updated)
}

pub fn spawn_youtube_token_refresh_task(app: AppHandle) {
    let _ = app;
    rt::spawn(async move {
        loop {
            sleep(std::time::Duration::from_secs(300)).await;
            if let Ok(tokens) = get_youtube_tokens().await {
                let now = Utc::now().timestamp();
                if now + 300 >= tokens.expires_at {
                    let _ = refresh_youtube_access_token().await;
                }
            }
        }
    });
}

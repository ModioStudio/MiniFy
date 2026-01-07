use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use rand::RngCore;
use reqwest::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tauri::async_runtime as rt;
use tauri::AppHandle;
use tauri::Emitter;
use keyring::Entry;
use tokio::time::sleep;

const KEYRING_SERVICE: &str = "minify";
const ACCESS_TOKEN_KEY: &str = "access_token";
const REFRESH_TOKEN_KEY: &str = "refresh_token";
const TOKEN_EXPIRY_KEY: &str = "token_expiry";
const MUSIC_PROVIDER_KEY: &str = "music_provider";
const SPOTIFY_CLIENT_ID_KEY: &str = "spotify_client_id";

lazy_static::lazy_static! {
    static ref CLIENT_ID_CACHE: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    static ref TOKENS_CACHE: Arc<Mutex<Option<SpotifyTokens>>> = Arc::new(Mutex::new(None));
    static ref MUSIC_PROVIDER_CACHE: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
}

fn get_cached_tokens() -> Option<SpotifyTokens> {
    TOKENS_CACHE.lock().ok().and_then(|g| g.clone())
}

fn set_cached_tokens(tokens: &SpotifyTokens) {
    if let Ok(mut cache) = TOKENS_CACHE.lock() {
        *cache = Some(tokens.clone());
    }
}

fn clear_cached_tokens() {
    if let Ok(mut cache) = TOKENS_CACHE.lock() {
        *cache = None;
    }
}

fn get_cached_music_provider() -> Option<String> {
    MUSIC_PROVIDER_CACHE.lock().ok().and_then(|g| g.clone())
}

fn set_cached_music_provider(provider: &str) {
    if let Ok(mut cache) = MUSIC_PROVIDER_CACHE.lock() {
        *cache = Some(provider.to_string());
    }
}

fn clear_cached_music_provider() {
    if let Ok(mut cache) = MUSIC_PROVIDER_CACHE.lock() {
        *cache = None;
    }
}

fn get_embedded_spotify_client_id() -> Option<String> {
    option_env!("SPOTIFY_CLIENT_ID")
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

fn get_cached_client_id() -> Option<String> {
    CLIENT_ID_CACHE.lock().ok().and_then(|g| g.clone())
}

fn set_cached_client_id(id: &str) {
    if let Ok(mut cache) = CLIENT_ID_CACHE.lock() {
        *cache = Some(id.to_string());
    }
}

fn clear_cached_client_id() {
    if let Ok(mut cache) = CLIENT_ID_CACHE.lock() {
        *cache = None;
    }
}

fn entry(key: &str) -> Result<Entry, keyring::Error> {
    Entry::new(KEYRING_SERVICE, key)
}

async fn get_stored_spotify_client_id() -> Option<String> {
    if let Some(cached) = get_cached_client_id() {
        return Some(cached);
    }
    
    let result = tokio::task::spawn_blocking(|| {
        entry(SPOTIFY_CLIENT_ID_KEY).ok().and_then(|e| e.get_password().ok())
    })
    .await
    .ok()
    .flatten();
    
    if let Some(ref id) = result {
        set_cached_client_id(id);
    }
    
    result
}

#[tauri::command]
pub async fn has_spotify_client_id() -> bool {
    get_embedded_spotify_client_id().is_some() || get_stored_spotify_client_id().await.is_some()
}

#[tauri::command]
pub async fn save_spotify_client_id(client_id: String) -> Result<(), String> {
    if client_id.trim().is_empty() {
        return Err("Client ID is empty".to_string());
    }
    let client_id_trimmed = client_id.trim().to_string();
    
    set_cached_client_id(&client_id_trimmed);
    
    let client_id_clone = client_id_trimmed.clone();
    tokio::task::spawn_blocking(move || {
        entry(SPOTIFY_CLIENT_ID_KEY)
            .map_err(|e| format!("Keyring error: {}", e))?
            .set_password(&client_id_clone)
            .map_err(|e| format!("Failed to save client ID: {}", e))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn needs_spotify_setup() -> bool {
    !has_spotify_client_id().await
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
}

#[derive(Debug, Clone)]
struct AuthState {
    code_verifier: String,
    client_id: String,
    state_nonce: String,
}

lazy_static::lazy_static! {
    static ref AUTH_STATE: Arc<Mutex<Option<AuthState>>> = Arc::new(Mutex::new(None));
}

fn urlsafe_b64_no_pad(bytes: &[u8]) -> String {
    general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn generate_code_verifier() -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut rng = rand::rng();
    let mut verifier = String::with_capacity(64);
    for _ in 0..64 {
        let idx = (rng.next_u32() as usize) % CHARSET.len();
        verifier.push(CHARSET[idx] as char);
    }
    verifier
}

fn generate_code_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let hash = hasher.finalize();
    urlsafe_b64_no_pad(&hash)
}

#[tauri::command]
pub async fn set_music_provider(provider: String) -> Result<(), String> {
    let provider_clone = provider.clone();
    tokio::task::spawn_blocking(move || {
        entry(MUSIC_PROVIDER_KEY)
            .map_err(|e| format!("Keyring error: {}", e))?
            .set_password(&provider_clone)
            .map_err(|e| format!("Failed to save music provider: {}", e))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;
    
    set_cached_music_provider(&provider);
    Ok(())
}

#[tauri::command]
pub async fn get_music_provider() -> Result<String, String> {
    if let Some(cached) = get_cached_music_provider() {
        return Ok(cached);
    }
    
    let result = tokio::task::spawn_blocking(|| {
        entry(MUSIC_PROVIDER_KEY)
            .map_err(|e| format!("Keyring error: {}", e))?
            .get_password()
            .map_err(|e| format!("Failed to get music provider: {}", e))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;
    
    set_cached_music_provider(&result);
    Ok(result)
}

#[tauri::command]
pub async fn has_music_provider() -> bool {
    get_music_provider().await.is_ok()
}

async fn save_tokens(tokens: &SpotifyTokens) -> Result<(), String> {
    let access_token = tokens.access_token.clone();
    let refresh_token = tokens.refresh_token.clone();
    let expires_at = tokens.expires_at.to_string();
    
    tokio::task::spawn_blocking(move || {
        entry(ACCESS_TOKEN_KEY)
            .map_err(|e| format!("Keyring error: {}", e))?
            .set_password(&access_token)
            .map_err(|e| format!("Failed to save access token: {}", e))?;
        entry(REFRESH_TOKEN_KEY)
            .map_err(|e| format!("Keyring error: {}", e))?
            .set_password(&refresh_token)
            .map_err(|e| format!("Failed to save refresh token: {}", e))?;
        entry(TOKEN_EXPIRY_KEY)
            .map_err(|e| format!("Keyring error: {}", e))?
            .set_password(&expires_at)
            .map_err(|e| format!("Failed to save token expiry: {}", e))?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;
    
    set_cached_tokens(tokens);
    Ok(())
}

pub async fn verify_spotify_access(access_token: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.spotify.com/v1/me")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Verification request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Verification failed: {} - {}", status, text));
    }
    Ok(())
}

#[tauri::command]
pub async fn get_tokens() -> Result<SpotifyTokens, String> {
    if let Some(cached) = get_cached_tokens() {
        return Ok(cached);
    }
    
    let result = tokio::task::spawn_blocking(|| -> Result<SpotifyTokens, String> {
        let access_token = entry(ACCESS_TOKEN_KEY)
            .map_err(|e| format!("Keyring error: {}", e))?
            .get_password()
            .map_err(|e| format!("Failed to get access token: {}", e))?;
        let refresh_token = entry(REFRESH_TOKEN_KEY)
            .map_err(|e| format!("Keyring error: {}", e))?
            .get_password()
            .map_err(|e| format!("Failed to get refresh token: {}", e))?;
        let expires_at_str = entry(TOKEN_EXPIRY_KEY)
            .map_err(|e| format!("Keyring error: {}", e))?
            .get_password()
            .map_err(|e| format!("Failed to get token expiry: {}", e))?;
        let expires_at = expires_at_str
            .parse::<i64>()
            .map_err(|e| format!("Failed to parse expiry: {}", e))?;

        Ok(SpotifyTokens { access_token, refresh_token, expires_at })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;
    
    set_cached_tokens(&result);
    Ok(result)
}

#[tauri::command]
pub async fn has_valid_tokens() -> bool {
    match get_tokens().await {
        Ok(tokens) => Utc::now().timestamp() < tokens.expires_at,
        Err(_) => false,
    }
}

#[tauri::command]
pub async fn clear_credentials() -> Result<(), String> {
    if let Ok(mut s) = AUTH_STATE.lock() {
        *s = None;
    }
    if let Ok(mut shutdown) = OAUTH_SHUTDOWN.lock() {
        if let Some(tx) = shutdown.take() {
            let _ = tx.send(());
        }
    }
    clear_cached_client_id();
    clear_cached_tokens();
    clear_cached_music_provider();
    
    tokio::task::spawn_blocking(|| {
        if let Ok(e) = entry(ACCESS_TOKEN_KEY) { let _ = e.delete_password(); }
        if let Ok(e) = entry(REFRESH_TOKEN_KEY) { let _ = e.delete_password(); }
        if let Ok(e) = entry(TOKEN_EXPIRY_KEY) { let _ = e.delete_password(); }
        if let Ok(e) = entry(MUSIC_PROVIDER_KEY) { let _ = e.delete_password(); }
        if let Ok(e) = entry(SPOTIFY_CLIENT_ID_KEY) { let _ = e.delete_password(); }
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;
    Ok(())
}

async fn exchange_code_for_tokens(state: &AuthState, code: &str) -> Result<SpotifyTokens, String> {
    let redirect_uri = "http://127.0.0.1:3000/callback";
    let form = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", &state.client_id),
        ("code_verifier", &state.code_verifier),
    ];

    let client = reqwest::Client::new();
    let response = client
        .post("https://accounts.spotify.com/api/token")
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

    Ok(SpotifyTokens { access_token: tr.access_token, refresh_token, expires_at })
}

lazy_static::lazy_static! {
    static ref OAUTH_SHUTDOWN: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>> = Arc::new(Mutex::new(None));
}

#[tauri::command]
pub async fn cancel_oauth_flow() -> Result<(), String> {
    if let Ok(mut s) = AUTH_STATE.lock() {
        *s = None;
    }
    if let Ok(mut shutdown) = OAUTH_SHUTDOWN.lock() {
        if let Some(tx) = shutdown.take() {
            let _ = tx.send(());
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn start_oauth_flow(app: AppHandle) -> Result<(), String> {
    if let Ok(mut shutdown) = OAUTH_SHUTDOWN.lock() {
        if let Some(tx) = shutdown.take() {
            let _ = tx.send(());
        }
    }
    
    sleep(std::time::Duration::from_millis(100)).await;

    let client_id = get_embedded_spotify_client_id()
        .or(get_stored_spotify_client_id().await)
        .ok_or_else(|| "No Spotify Client ID configured. Please set up your Client ID first.".to_string())?;

    if let Ok(mut s) = AUTH_STATE.lock() {
        *s = None;
    }

    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);
    let mut state_bytes = [0u8; 16];
    rand::rng().fill_bytes(&mut state_bytes);
    let state_nonce = hex::encode(state_bytes);

    if let Ok(mut s) = AUTH_STATE.lock() {
        *s = Some(AuthState { 
            code_verifier, 
            client_id: client_id.clone(),
            state_nonce: state_nonce.clone(),
        });
    }

    let app_handle = app.clone();
    let (ready_tx, ready_rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    
    if let Ok(mut shutdown) = OAUTH_SHUTDOWN.lock() {
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
                        let result = handle_oauth_callback(query, app).await;
                        let _ = done_tx.send(()).await;
                        result
                    }
                }
            }),
        );

        let addr: SocketAddr = "127.0.0.1:3000".parse().unwrap();
        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                let _ = app_handle.emit("oauth-failed", json!({ "error": format!("bind_failed: {}", e) }));
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
                let _ = app_handle.emit("oauth-failed", json!({ "error": "OAuth timeout - please try again" }));
            }
        }
        
        if let Ok(mut shutdown) = OAUTH_SHUTDOWN.lock() {
            *shutdown = None;
        }
    });

    let _ = ready_rx.await.map_err(|_| "server_not_ready".to_string())??;

    let redirect_uri = urlencoding::encode("http://127.0.0.1:3000/callback");
    let scopes = "user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-modify-public playlist-modify-private user-top-read user-read-recently-played user-library-read";
    let auth_url = format!(
        "https://accounts.spotify.com/authorize?client_id={}&response_type=code&redirect_uri={}&scope={}&code_challenge_method=S256&code_challenge={}&state={}",
        urlencoding::encode(&client_id),
        redirect_uri,
        urlencoding::encode(scopes),
        code_challenge,
        state_nonce
    );

    webbrowser::open(&auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;

    Ok(())
}

async fn handle_oauth_callback(
    query: axum::extract::Query<std::collections::HashMap<String, String>>,
    app: AppHandle,
) -> axum::response::Html<String> {
    use axum::response::Html;

    if let Some(err) = query.get("error") {
        let _ = app.emit("oauth-failed", json!({ "error": err }));
        return Html(error_page("Authentication was denied or failed"));
    }

    let code = match query.get("code") {
        Some(c) => c.to_string(),
        None => {
            let _ = app.emit("oauth-failed", json!({ "error": "missing_code" }));
            return Html(error_page("Missing authorization code"));
        }
    };

    let auth_state = AUTH_STATE.lock().ok().and_then(|s| s.clone());

    let Some(st) = auth_state else {
        let _ = app.emit("oauth-failed", json!({ "error": "no_auth_state" }));
        return Html(error_page("Session expired - please close old browser tabs and try again"));
    };

    let state_param = query.get("state").cloned().unwrap_or_default();
    if state_param != st.state_nonce {
        return Html(error_page("This login session has expired. Please close this tab and try again in the app."));
    }

    if let Ok(mut s) = AUTH_STATE.lock() {
        *s = None;
    }

    match exchange_code_for_tokens(&st, &code).await {
        Ok(tokens) => {
            if let Err(e) = save_tokens(&tokens).await {
                let _ = app.emit("oauth-failed", json!({ "error": e }));
                return Html(error_page("Failed to save credentials"));
            }
            
            match verify_spotify_access(&tokens.access_token).await {
                Ok(_) => {
                    let _ = app.emit("oauth-success", json!({}));
                    Html(success_page())
                }
                Err(err_msg) => {
                    let _ = app.emit("oauth-failed", json!({ "error": err_msg }));
                    Html(error_page("Invalid credentials - check your Client ID"))
                }
            }
        }
        Err(e) => {
            let _ = app.emit("oauth-failed", json!({ "error": e }));
            Html(error_page(&format!("Token exchange failed: {}", e)))
        }
    }
}

fn success_page() -> String {
    r##"<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>MiniFy - Success</title></head>
<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
<div style="text-align:center;padding:2rem;background:rgba(255,255,255,0.05);border-radius:16px;border:1px solid rgba(255,255,255,0.1)">
<div style="width:64px;height:64px;background:#1db954;border-radius:12px;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem">
<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
</div>
<h1 style="color:#1db954;margin:0 0 0.5rem;font-size:1.5rem">Connected!</h1>
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

fn error_page(message: &str) -> String {
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
pub async fn refresh_access_token() -> Result<SpotifyTokens, String> {
    let tokens = get_tokens().await?;
    let client_id = get_embedded_spotify_client_id()
        .or(get_stored_spotify_client_id().await)
        .ok_or_else(|| "No Spotify Client ID configured".to_string())?;
    let form = [
        ("grant_type", "refresh_token"),
        ("refresh_token", tokens.refresh_token.as_str()),
        ("client_id", client_id.as_str()),
    ];

    let client = reqwest::Client::new();
    let response = client
        .post("https://accounts.spotify.com/api/token")
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
        refresh_token: Option<String>,
        expires_in: i64,
    }

    let rr: RefreshResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    let expires_at = Utc::now().timestamp() + rr.expires_in - 30;
    let refresh_token = rr.refresh_token.unwrap_or(tokens.refresh_token);

    let updated = SpotifyTokens { access_token: rr.access_token, refresh_token, expires_at };
    save_tokens(&updated).await?;
    Ok(updated)
}

pub fn spawn_token_refresh_task(app: AppHandle) {
    let _ = app;
    rt::spawn(async move {
        loop {
            sleep(std::time::Duration::from_secs(300)).await;
            if let Ok(tokens) = get_tokens().await {
                let now = Utc::now().timestamp();
                if now + 300 >= tokens.expires_at {
                    let _ = refresh_access_token().await;
                }
            }
        }
    });
}

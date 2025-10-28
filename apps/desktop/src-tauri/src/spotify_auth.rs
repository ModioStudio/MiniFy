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
const CLIENT_ID_KEY: &str = "client_id";
const ACCESS_TOKEN_KEY: &str = "access_token";
const REFRESH_TOKEN_KEY: &str = "refresh_token";
const TOKEN_EXPIRY_KEY: &str = "token_expiry";

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
}

lazy_static::lazy_static! {
    static ref AUTH_STATE: Arc<Mutex<Option<AuthState>>> = Arc::new(Mutex::new(None));
}

fn urlsafe_b64_no_pad(bytes: &[u8]) -> String {
    general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn generate_code_verifier() -> String {
    // RFC 7636 recommends 43-128 chars. Use 64 for good entropy.
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut rng = rand::thread_rng();
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

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, key).map_err(|e| format!("Keyring init failed: {}", e))
}

#[tauri::command]
pub async fn save_client_id(client_id: String) -> Result<(), String> {
    if client_id.trim().is_empty() {
        return Err("Client ID is empty".to_string());
    }
    entry(CLIENT_ID_KEY)
        .and_then(|e| e.set_password(&client_id).map_err(|e| format!("Failed to save client ID: {}", e)))
}

#[tauri::command]
pub async fn get_client_id() -> Result<String, String> {
    entry(CLIENT_ID_KEY)
        .and_then(|e| e.get_password().map_err(|e| format!("Failed to get client ID: {}", e)))
}

#[tauri::command]
pub async fn has_client_id() -> bool {
    get_client_id().await.is_ok()
}

async fn save_tokens(tokens: &SpotifyTokens) -> Result<(), String> {
    entry(ACCESS_TOKEN_KEY)
        .and_then(|e| e.set_password(&tokens.access_token).map_err(|e| format!("Failed to save access token: {}", e)))?;
    entry(REFRESH_TOKEN_KEY)
        .and_then(|e| e.set_password(&tokens.refresh_token).map_err(|e| format!("Failed to save refresh token: {}", e)))?;
    entry(TOKEN_EXPIRY_KEY)
        .and_then(|e| e.set_password(&tokens.expires_at.to_string()).map_err(|e| format!("Failed to save token expiry: {}", e)))?;
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
    let access_token = entry(ACCESS_TOKEN_KEY)
        .and_then(|e| e.get_password().map_err(|e| format!("Failed to get access token: {}", e)))?;
    let refresh_token = entry(REFRESH_TOKEN_KEY)
        .and_then(|e| e.get_password().map_err(|e| format!("Failed to get refresh token: {}", e)))?;
    let expires_at_str = entry(TOKEN_EXPIRY_KEY)
        .and_then(|e| e.get_password().map_err(|e| format!("Failed to get token expiry: {}", e)))?;
    let expires_at = expires_at_str
        .parse::<i64>()
        .map_err(|e| format!("Failed to parse expiry: {}", e))?;

    Ok(SpotifyTokens { access_token, refresh_token, expires_at })
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
    let _ = entry(CLIENT_ID_KEY).and_then(|e| e.delete_password().map_err(|e| e.to_string()));
    let _ = entry(ACCESS_TOKEN_KEY).and_then(|e| e.delete_password().map_err(|e| e.to_string()));
    let _ = entry(REFRESH_TOKEN_KEY).and_then(|e| e.delete_password().map_err(|e| e.to_string()));
    let _ = entry(TOKEN_EXPIRY_KEY).and_then(|e| e.delete_password().map_err(|e| e.to_string()));
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

    let expires_at = Utc::now().timestamp() + tr.expires_in - 30; // small skew
    let refresh_token = tr
        .refresh_token
        .ok_or_else(|| "Missing refresh_token in response".to_string())?;

    Ok(SpotifyTokens { access_token: tr.access_token, refresh_token, expires_at })
}

#[tauri::command]
pub async fn start_oauth_flow(app: AppHandle) -> Result<(), String> {
    // Prepare PKCE and state
    let client_id = get_client_id().await?;
    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);
    let mut state_bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut state_bytes);
    let state_nonce = hex::encode(state_bytes);

    {
        let mut s = AUTH_STATE.lock().unwrap();
        *s = Some(AuthState { code_verifier, client_id: client_id.clone() });
    }

    // Start Axum server on 127.0.0.1:3000 and keep it alive
    let app_handle = app.clone();
    let state_for_route = state_nonce.clone();
    let (ready_tx, ready_rx) = tokio::sync::oneshot::channel::<Result<(), String>>();

    rt::spawn(async move {
        use axum::{extract::Query, response::Html, routing::get, Router};
        use std::collections::HashMap;

        async fn callback_handler(
            query: Query<HashMap<String, String>>,
            expected_state: String,
            app: AppHandle,
        ) -> Html<String> {
            if let Some(err) = query.get("error") {
                let _ = app.emit("oauth-failed", json!({ "error": err }));
                return Html("Auth failed".to_string());
            }

            let code = match query.get("code") {
                Some(c) => c.to_string(),
                None => {
                    let _ = app.emit("oauth-failed", json!({ "error": "missing_code" }));
                    return Html("Missing code".to_string());
                }
            };

            let state_param = query.get("state").cloned().unwrap_or_default();
            if state_param != expected_state {
                let _ = app.emit("oauth-failed", json!({ "error": "state_mismatch" }));
                return Html("State mismatch".to_string());
            }

            let auth_state = {
                let s = AUTH_STATE.lock().unwrap();
                s.clone()
            };

            if let Some(st) = auth_state {
                match exchange_code_for_tokens(&st, &code).await {
                    Ok(tokens) => {
                        if let Err(e) = save_tokens(&tokens).await {
                            let _ = app.emit("oauth-failed", json!({ "error": e }));
                            return Html("Failed to save tokens".to_string());
                        }
                        // Verify token by calling Spotify API
                        match crate::spotify_auth::verify_spotify_access(&tokens.access_token).await {
                            Ok(_) => {
                        let _ = app.emit("oauth-success", json!({}));
                        return Html("<html><body style='font-family:sans-serif;background:#1e1e1e;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh'><div style='text-align:center;padding:2rem;background:rgba(0,0,0,0.6);border-radius:12px'><h1 style='color:#1db954'>Success!</h1><p>You can close this window.</p><script>setTimeout(()=>window.close(),500);</script><button onclick='window.close()' style='padding:0.5rem 1rem;background:#1db954;color:#fff;border:none;border-radius:6px'>Close</button></div></body></html>".to_string());
                            }
                            Err(err_msg) => {
                                let _ = app.emit("oauth-failed", json!({ "error": err_msg }));
                                return Html("Token verification failed".to_string());
                            }
                        }
                    }
                    Err(e) => {
                        let _ = app.emit("oauth-failed", json!({ "error": e }));
                        return Html("Token exchange failed".to_string());
                    }
                }
            }

            Html("Auth state not found".to_string())
        }

        let router = Router::new().route(
            "/callback",
            get({
                let app = app_handle.clone();
                let expected_state = state_for_route.clone();
                move |q| callback_handler(q, expected_state.clone(), app.clone())
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
        let _ = server.await;
    });

    // Wait until server is ready
    let _ = ready_rx.await.map_err(|_| "server_not_ready".to_string())??;

    // Build authorization URL and open browser
    let redirect_uri = urlencoding::encode("http://127.0.0.1:3000/callback");
    let scopes = "user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private";
    let auth_url = format!(
        "https://accounts.spotify.com/authorize?client_id={}&response_type=code&redirect_uri={}&scope={}&code_challenge_method=S256&code_challenge={}&state={}",
        urlencoding::encode(&client_id),
        redirect_uri,
        urlencoding::encode(scopes),
        code_challenge,
        state_nonce
    );

    // Use system default browser
    webbrowser::open(&auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn refresh_access_token() -> Result<SpotifyTokens, String> {
    let tokens = get_tokens().await?;
    let client_id = get_client_id().await?;
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
    let refresh_token = rr
        .refresh_token
        .unwrap_or(tokens.refresh_token);

    let updated = SpotifyTokens { access_token: rr.access_token, refresh_token, expires_at };
    save_tokens(&updated).await?;
    Ok(updated)
}

pub fn spawn_token_refresh_task(app: AppHandle) {
    let _ = app; // suppress unused in some build paths
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



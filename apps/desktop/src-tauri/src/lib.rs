use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

pub mod ai_keyring;
mod credential_store;
pub mod custom_themes;
pub mod debug;
pub mod discord_rpc;
pub mod music_video;
pub mod resize;
pub mod settings;
pub mod spotify_auth;
pub mod taskbar;
pub mod titlebar;
pub mod youtube_auth;

mod clear_all {
    use super::*;
    use tauri::AppHandle;

    pub async fn execute(app: &AppHandle) -> Result<(), String> {
        let settings_cleared = settings::clear_settings(app.clone());
        let themes_cleared = custom_themes::clear_custom_themes(app);
        let spotify_result = spotify_auth::clear_credentials().await;
        let youtube_result = youtube_auth::clear_youtube_credentials().await;
        let ai_keys_result = ai_keyring::clear_all_ai_keys().await;

        if !settings_cleared {
            return Err("Failed to clear settings".to_string());
        }
        if !themes_cleared {
            return Err("Failed to clear custom themes".to_string());
        }
        spotify_result?;
        youtube_result?;
        ai_keys_result?;

        Ok(())
    }
}

#[tauri::command]
async fn clear_everything(app: tauri::AppHandle) -> Result<(), String> {
    clear_all::execute(&app).await
}

#[tauri::command]
async fn open_mini_player(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("mini") {
        window.show().map_err(|err| err.to_string())?;
        window.set_focus().map_err(|err| err.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app,
        "mini",
        WebviewUrl::App("index.html?window=mini".into()),
    )
    .title("MiniFy Mini Player")
    .inner_size(500.0, 150.0)
    .min_inner_size(400.0, 118.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .build()
    .map_err(|err| err.to_string())?;

    Ok(())
}

pub fn run() {
    let discord_state = discord_rpc::DiscordState::new();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    let app = builder
        .manage(discord_state)
        .invoke_handler({
            // Typed here: outside invoke_handler(..) the generated closure has
            // no other way to learn what it is called with.
            let commands: fn(tauri::ipc::Invoke) -> bool = tauri::generate_handler![
            clear_everything,
            open_mini_player,
            titlebar::set_titlebar_color,
            taskbar::set_taskbar_playing,
            music_video::youtube_web_status,
            music_video::youtube_web_sign_in,
            music_video::youtube_web_sign_out,
            music_video::search_music_videos,
            settings::read_settings,
            settings::write_settings,
            settings::clear_settings,
            spotify_auth::set_music_provider,
            spotify_auth::get_music_provider,
            spotify_auth::has_music_provider,
            spotify_auth::has_spotify_client_id,
            spotify_auth::save_spotify_client_id,
            spotify_auth::needs_spotify_setup,
            spotify_auth::get_spotify_redirect_uri,
            spotify_auth::get_spotify_redirect_uris,
            spotify_auth::get_tokens,
            spotify_auth::has_valid_tokens,
            spotify_auth::start_oauth_flow,
            spotify_auth::cancel_oauth_flow,
            spotify_auth::refresh_access_token,
            spotify_auth::spotify_scopes_up_to_date,
            spotify_auth::spotify_required_scopes,
            spotify_auth::clear_credentials,
            ai_keyring::save_ai_api_key,
            ai_keyring::get_ai_api_key,
            ai_keyring::has_ai_api_key,
            ai_keyring::delete_ai_api_key,
            ai_keyring::get_all_ai_providers,
            ai_keyring::clear_all_ai_keys,
            debug::open_webview_devtools,
            debug::log_diagnostic,
            debug::renderer_heartbeat,
            resize::set_layout,
            custom_themes::save_custom_theme,
            custom_themes::load_custom_themes,
            custom_themes::delete_custom_theme,
            custom_themes::export_custom_theme,
            custom_themes::validate_theme_json,
            discord_rpc::enable_discord_rpc,
            discord_rpc::disable_discord_rpc,
            discord_rpc::update_discord_presence,
            discord_rpc::is_discord_rpc_enabled,
            youtube_auth::has_youtube_credentials,
            youtube_auth::has_youtube_client_id,
            youtube_auth::save_youtube_credentials,
            youtube_auth::needs_youtube_setup,
            youtube_auth::get_youtube_tokens,
            youtube_auth::has_valid_youtube_tokens,
            youtube_auth::start_youtube_oauth_flow,
            youtube_auth::cancel_youtube_oauth_flow,
            youtube_auth::refresh_youtube_access_token,
            youtube_auth::clear_youtube_credentials
            ];
            // Counted for the watchdog, which logs when calls into Rust flood.
            move |invoke: tauri::ipc::Invoke| {
                debug::count_command(invoke.message.command());
                // When a heartbeat reaches this point is the line between a
                // jam in the webview's transport and one in Rust's runtime.
                if invoke.message.command() == "renderer_heartbeat" {
                    if let tauri::ipc::InvokeBody::Json(body) = invoke.message.payload() {
                        debug::note_heartbeat_dispatch(body.get("sentAt").and_then(|v| v.as_f64()));
                    }
                }
                commands(invoke)
            }
        })
        .setup(|app| {
            debug::start_watchdog(app.handle().clone());
            spotify_auth::spawn_token_refresh_task(app.handle().clone());
            youtube_auth::spawn_youtube_token_refresh_task(app.handle().clone());

            // The saved switch, not a default: presence used to start up and
            // show on Discord even with the setting turned off.
            let discord_enabled = settings::read_settings(app.handle().clone()).discord_rpc_enabled;
            discord_rpc::init_discord_rpc(&app.state::<discord_rpc::DiscordState>(), discord_enabled);

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Closing the last window quits. Preventing that left a headless MiniFy
    // behind on every close; one of them kept "MiniFy Paused" on Discord for
    // hours after its window was gone.
    app.run(|_app_handle, _event| {});
}

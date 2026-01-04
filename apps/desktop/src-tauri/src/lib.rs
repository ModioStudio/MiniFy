use tauri::Manager;

pub mod ai_keyring;
pub mod custom_themes;
pub mod debug;
pub mod discord_rpc;
pub mod resize;
pub mod settings;
pub mod spotify_auth;
pub mod youtube_auth;

mod clear_all {
    use super::*;

    pub async fn execute() -> Result<(), String> {
        let settings_cleared = settings::clear_settings();
        let themes_cleared = custom_themes::clear_custom_themes();
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
async fn clear_everything() -> Result<(), String> {
    clear_all::execute().await
}

pub fn run() {
    let discord_state = discord_rpc::DiscordState::new();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(discord_state)
        .invoke_handler(tauri::generate_handler![
            clear_everything,
            settings::read_settings,
            settings::write_settings,
            settings::clear_settings,
            spotify_auth::set_music_provider,
            spotify_auth::get_music_provider,
            spotify_auth::has_music_provider,
            spotify_auth::has_spotify_client_id,
            spotify_auth::save_spotify_client_id,
            spotify_auth::needs_spotify_setup,
            spotify_auth::get_tokens,
            spotify_auth::has_valid_tokens,
            spotify_auth::start_oauth_flow,
            spotify_auth::cancel_oauth_flow,
            spotify_auth::refresh_access_token,
            spotify_auth::clear_credentials,
            ai_keyring::save_ai_api_key,
            ai_keyring::get_ai_api_key,
            ai_keyring::has_ai_api_key,
            ai_keyring::delete_ai_api_key,
            ai_keyring::get_all_ai_providers,
            ai_keyring::clear_all_ai_keys,
            debug::open_webview_devtools,
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
            youtube_auth::save_youtube_credentials,
            youtube_auth::needs_youtube_setup,
            youtube_auth::get_youtube_tokens,
            youtube_auth::has_valid_youtube_tokens,
            youtube_auth::start_youtube_oauth_flow,
            youtube_auth::cancel_youtube_oauth_flow,
            youtube_auth::refresh_youtube_access_token,
            youtube_auth::clear_youtube_credentials
        ])
        .setup(|app| {
            spotify_auth::spawn_token_refresh_task(app.handle().clone());
            youtube_auth::spawn_youtube_token_refresh_task(app.handle().clone());

            let state = app.state::<discord_rpc::DiscordState>();
            discord_rpc::init_discord_rpc(&state);

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            api.prevent_exit();
        }
    });
}


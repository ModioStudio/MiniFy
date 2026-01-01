pub mod settings;
pub mod spotify_auth;
pub mod debug;
pub mod resize;
pub mod custom_themes;

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
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
            debug::open_webview_devtools,
            resize::set_layout,
            custom_themes::save_custom_theme,
            custom_themes::load_custom_themes,
            custom_themes::delete_custom_theme,
            custom_themes::export_custom_theme,
            custom_themes::validate_theme_json
        ])
        .setup(|app| {
            spotify_auth::spawn_token_refresh_task(app.handle().clone());
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


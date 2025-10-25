mod settings;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            settings::read_settings,
            settings::write_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


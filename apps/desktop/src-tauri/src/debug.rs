use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn open_webview_devtools(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.open_devtools();
    }
}



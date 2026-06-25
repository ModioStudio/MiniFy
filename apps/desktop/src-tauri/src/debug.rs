use crate::app_runtime::AppHandle;

#[tauri::command]
pub fn open_webview_devtools(app: AppHandle) {
    let _ = app; // no-op on Tauri v2
}



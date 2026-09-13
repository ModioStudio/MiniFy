use tauri::AppHandle;

#[tauri::command]
pub fn open_webview_devtools(app: AppHandle) {
    let _ = app; // no-op on Tauri v2
}

/// Lets the webview push diagnostics into the process stdout, where `tauri dev`
/// and terminal launches can see them. The webview console is not forwarded on
/// Windows, so this is the only way to get playback/DRM traces out of a
/// release-style run.
#[tauri::command]
pub fn log_diagnostic(scope: String, message: String) {
    println!("[minify::{scope}] {message}");
}

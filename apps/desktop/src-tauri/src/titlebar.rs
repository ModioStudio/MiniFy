//! Paints the native window caption in the active theme colour.
//!
//! Windows 11 exposes the caption, its text and the window border through DWM
//! attributes, so the system title bar can follow a theme without replacing it
//! with a custom HTML one. Older Windows builds simply ignore the call, and the
//! other platforms have no equivalent knob, so this is a no-op there.

/// `#rrggbb` -> `0x00bbggrr`, the byte order `COLORREF` expects.
#[cfg(target_os = "windows")]
fn parse_colorref(hex: &str) -> Option<u32> {
    let hex = hex.trim().trim_start_matches('#');
    if hex.len() != 6 {
        return None;
    }
    let r = u32::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u32::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u32::from_str_radix(&hex[4..6], 16).ok()?;
    Some((b << 16) | (g << 8) | r)
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn set_titlebar_color(
    window: tauri::Window,
    background: String,
    foreground: Option<String>,
) -> Result<(), String> {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
    };

    let hwnd = window.hwnd().map_err(|err| err.to_string())?.0 as HWND;
    let caption = parse_colorref(&background).ok_or("Expected an #rrggbb background")?;

    let set = |attribute: u32, value: u32| unsafe {
        DwmSetWindowAttribute(
            hwnd,
            attribute,
            std::ptr::addr_of!(value).cast(),
            std::mem::size_of::<u32>() as u32,
        )
    };

    set(DWMWA_CAPTION_COLOR as u32, caption);
    set(DWMWA_BORDER_COLOR as u32, caption);

    if let Some(text) = foreground.as_deref().and_then(parse_colorref) {
        set(DWMWA_TEXT_COLOR as u32, text);
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn set_titlebar_color(
    _window: tauri::Window,
    _background: String,
    _foreground: Option<String>,
) -> Result<(), String> {
    Ok(())
}

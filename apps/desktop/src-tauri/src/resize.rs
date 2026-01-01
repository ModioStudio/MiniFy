use tauri::{WebviewWindow, Size, LogicalSize};

#[derive(serde::Deserialize)]
pub enum Layout {
    A,
    B,
    C,
    D,
    Settings,
    SearchSongs,
    AIDJ,
}

#[tauri::command]
pub fn set_layout(window: WebviewWindow, layout: Layout) {
    let size = match layout {
        Layout::A => LogicalSize { width: 500.0, height: 150.0 },
        Layout::B => LogicalSize { width: 400.0, height: 200.0 },
        Layout::C => LogicalSize { width: 400.0, height: 200.0 },
        Layout::D => LogicalSize { width: 400.0, height: 200.0 },
        Layout::Settings => LogicalSize { width: 800.0, height: 800.0 },
        Layout::SearchSongs => LogicalSize { width: 400.0, height: 600.0 },
        Layout::AIDJ => LogicalSize { width: 400.0, height: 600.0 },
    };

    window.set_size(Size::Logical(size)).unwrap();
}

//! Previous / play-pause / next buttons under the taskbar thumbnail, the way
//! Spotify has them.
//!
//! This is `ITaskbarList3`'s thumbnail toolbar, which only exists on Windows.
//! macOS and Linux have no equivalent, so the command is a no-op there.
//! Clicks arrive at the frontend as a `taskbar-control` event carrying
//! `"previous"`, `"toggle"` or `"next"`.

#[tauri::command]
pub fn set_taskbar_playing(window: tauri::WebviewWindow, playing: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    return imp::set_playing(&window, playing);

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, playing);
        Ok(())
    }
}

#[cfg(target_os = "windows")]
mod imp {
    use std::cell::RefCell;
    use std::sync::OnceLock;
    use tauri::{AppHandle, Emitter, Manager};
    use windows::core::{w, Result as WinResult};
    use windows::Win32::Foundation::{ERROR_SUCCESS, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::Graphics::Gdi::{
        CreateBitmap, CreateDIBSection, DeleteObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    use windows::Win32::UI::Shell::{
        DefSubclassProc, ITaskbarList3, RemoveWindowSubclass, SetWindowSubclass, TaskbarList,
        THBF_ENABLED, THBN_CLICKED, THB_FLAGS, THB_ICON, THB_TOOLTIP, THUMBBUTTON, THUMBBUTTONMASK,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateIconIndirect, DestroyIcon, GetSystemMetrics, RegisterWindowMessageW, HICON, ICONINFO,
        SM_CXSMICON, WM_COMMAND, WM_NCDESTROY, WM_SETTINGCHANGE,
    };

    const SUBCLASS_ID: usize = 0x4d46_7462;
    const PREVIOUS: u32 = 0;
    const TOGGLE: u32 = 1;
    const NEXT: u32 = 2;

    static APP: OnceLock<AppHandle> = OnceLock::new();
    static TASKBAR_CREATED: OnceLock<u32> = OnceLock::new();

    thread_local! {
        // COM objects are bound to their apartment, so the toolbar lives on
        // the UI thread and is only touched from there.
        static TOOLBAR: RefCell<Option<Toolbar>> = const { RefCell::new(None) };
    }

    pub fn set_playing(window: &tauri::WebviewWindow, playing: bool) -> Result<(), String> {
        APP.get_or_init(|| window.app_handle().clone());
        // HWND is a raw pointer and not Send; carry it across as an integer.
        let raw = window.hwnd().map_err(|err| err.to_string())?.0 as isize;

        window
            .run_on_main_thread(move || {
                let hwnd = HWND(raw as *mut core::ffi::c_void);
                TOOLBAR.with(|cell| {
                    let Ok(mut slot) = cell.try_borrow_mut() else {
                        return;
                    };
                    if slot.is_none() {
                        match Toolbar::attach(hwnd) {
                            Ok(toolbar) => *slot = Some(toolbar),
                            Err(error) => {
                                eprintln!("taskbar buttons unavailable: {error}");
                                return;
                            }
                        }
                    }
                    if let Some(toolbar) = slot.as_mut() {
                        toolbar.playing = playing;
                        toolbar.sync();
                    }
                });
            })
            .map_err(|err| err.to_string())
    }

    #[derive(Clone, Copy)]
    enum Glyph {
        Previous,
        Play,
        Pause,
        Next,
    }

    struct Icons {
        previous: HICON,
        play: HICON,
        pause: HICON,
        next: HICON,
    }

    impl Icons {
        fn render(light: bool) -> WinResult<Self> {
            // The thumbnail flyout follows the system theme, so the glyphs
            // have to as well or they vanish against it.
            let rgb = if light { 0x1f1f1f } else { 0xffffff };
            let size = unsafe { GetSystemMetrics(SM_CXSMICON) }.max(16);
            Ok(Self {
                previous: glyph_icon(Glyph::Previous, size, rgb)?,
                play: glyph_icon(Glyph::Play, size, rgb)?,
                pause: glyph_icon(Glyph::Pause, size, rgb)?,
                next: glyph_icon(Glyph::Next, size, rgb)?,
            })
        }
    }

    impl Drop for Icons {
        fn drop(&mut self) {
            for icon in [self.previous, self.play, self.pause, self.next] {
                unsafe {
                    let _ = DestroyIcon(icon);
                }
            }
        }
    }

    struct Toolbar {
        list: ITaskbarList3,
        hwnd: HWND,
        icons: Icons,
        light: bool,
        playing: bool,
        /// Buttons can be added once per taskbar button; after that only updated.
        added: bool,
    }

    impl Toolbar {
        fn attach(hwnd: HWND) -> WinResult<Self> {
            let list: ITaskbarList3 = unsafe {
                // The webview has already initialised COM on this thread; this
                // is a no-op then, and a threading-model mismatch is harmless.
                let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
                CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER)?
            };
            unsafe { list.HrInit()? };

            TASKBAR_CREATED
                .get_or_init(|| unsafe { RegisterWindowMessageW(w!("TaskbarButtonCreated")) });
            unsafe {
                let _ = SetWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID, 0);
            }

            let light = system_uses_light_theme();
            Ok(Self {
                list,
                hwnd,
                icons: Icons::render(light)?,
                light,
                playing: false,
                added: false,
            })
        }

        fn buttons(&self) -> [THUMBBUTTON; 3] {
            let (toggle_icon, toggle_tip) = if self.playing {
                (self.icons.pause, "Pause")
            } else {
                (self.icons.play, "Play")
            };
            [
                button(PREVIOUS, self.icons.previous, "Previous"),
                button(TOGGLE, toggle_icon, toggle_tip),
                button(NEXT, self.icons.next, "Next"),
            ]
        }

        fn sync(&mut self) {
            let buttons = self.buttons();
            let result = unsafe {
                if self.added {
                    self.list.ThumbBarUpdateButtons(self.hwnd, &buttons)
                } else {
                    self.list.ThumbBarAddButtons(self.hwnd, &buttons)
                }
            };
            match result {
                Ok(()) => self.added = true,
                Err(error) => eprintln!("taskbar buttons: {error}"),
            }
        }

        fn follow_theme(&mut self) {
            let light = system_uses_light_theme();
            if light == self.light {
                return;
            }
            match Icons::render(light) {
                Ok(icons) => {
                    // Swap first, then free: the old icons stay valid until
                    // the taskbar has been handed the new ones.
                    let old = std::mem::replace(&mut self.icons, icons);
                    self.light = light;
                    self.sync();
                    drop(old);
                }
                Err(error) => eprintln!("taskbar icons: {error}"),
            }
        }
    }

    fn button(id: u32, icon: HICON, tip: &str) -> THUMBBUTTON {
        let mut button = THUMBBUTTON {
            dwMask: THUMBBUTTONMASK(THB_ICON.0 | THB_TOOLTIP.0 | THB_FLAGS.0),
            iId: id,
            hIcon: icon,
            dwFlags: THBF_ENABLED,
            ..Default::default()
        };
        for (slot, unit) in button.szTip.iter_mut().zip(tip.encode_utf16()) {
            *slot = unit;
        }
        button
    }

    /// Runs `f` on the toolbar unless it is already borrowed: taskbar calls can
    /// pump messages back into the subclass proc while the command holds it.
    fn with_toolbar(f: impl FnOnce(&mut Toolbar)) {
        TOOLBAR.with(|cell| {
            if let Ok(mut slot) = cell.try_borrow_mut() {
                if let Some(toolbar) = slot.as_mut() {
                    f(toolbar);
                }
            }
        });
    }

    unsafe extern "system" fn subclass_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        if msg == WM_COMMAND && ((wparam.0 >> 16) & 0xffff) as u32 == THBN_CLICKED {
            let action = match (wparam.0 & 0xffff) as u32 {
                PREVIOUS => Some("previous"),
                TOGGLE => Some("toggle"),
                NEXT => Some("next"),
                _ => None,
            };
            if let Some(action) = action {
                if let Some(app) = APP.get() {
                    let _ = app.emit_to("main", "taskbar-control", action);
                }
                return LRESULT(0);
            }
        }

        if TASKBAR_CREATED.get() == Some(&msg) {
            // Explorer restarted and took the buttons with it.
            with_toolbar(|toolbar| {
                toolbar.added = false;
                toolbar.sync();
            });
        } else if msg == WM_SETTINGCHANGE {
            with_toolbar(Toolbar::follow_theme);
        } else if msg == WM_NCDESTROY {
            unsafe {
                let _ = RemoveWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID);
            }
            TOOLBAR.with(|cell| {
                if let Ok(mut slot) = cell.try_borrow_mut() {
                    slot.take();
                }
            });
        }

        unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
    }

    fn system_uses_light_theme() -> bool {
        let mut value = 0u32;
        let mut size = std::mem::size_of::<u32>() as u32;
        let status = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"),
                w!("SystemUsesLightTheme"),
                RRF_RT_REG_DWORD,
                None,
                Some(std::ptr::addr_of_mut!(value).cast()),
                Some(&mut size as *mut u32),
            )
        };
        status == ERROR_SUCCESS && value == 1
    }

    /// Glyph shapes on a unit square, so they scale to any icon size.
    fn covers(glyph: Glyph, x: f32, y: f32) -> bool {
        let bar = |x0: f32, x1: f32| x >= x0 && x <= x1 && (0.22..=0.78).contains(&y);
        let p = (x, y);
        match glyph {
            Glyph::Play => in_triangle(p, (0.30, 0.22), (0.30, 0.78), (0.78, 0.50)),
            Glyph::Pause => bar(0.26, 0.42) || bar(0.58, 0.74),
            Glyph::Previous => {
                bar(0.22, 0.32) || in_triangle(p, (0.78, 0.22), (0.78, 0.78), (0.34, 0.50))
            }
            Glyph::Next => {
                bar(0.68, 0.78) || in_triangle(p, (0.22, 0.22), (0.22, 0.78), (0.66, 0.50))
            }
        }
    }

    fn in_triangle(p: (f32, f32), a: (f32, f32), b: (f32, f32), c: (f32, f32)) -> bool {
        let edge =
            |u: (f32, f32), v: (f32, f32)| (p.0 - v.0) * (u.1 - v.1) - (u.0 - v.0) * (p.1 - v.1);
        let (d1, d2, d3) = (edge(a, b), edge(b, c), edge(c, a));
        let negative = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
        let positive = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
        !(negative && positive)
    }

    /// Rasterises a glyph into a 32-bit icon, 4x4 supersampled for smooth edges.
    fn glyph_icon(glyph: Glyph, size: i32, rgb: u32) -> WinResult<HICON> {
        const SAMPLES: i32 = 4;

        let info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: size,
                // Negative height: rows run top to bottom.
                biHeight: -size,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        unsafe {
            let mut bits = std::ptr::null_mut();
            let color = CreateDIBSection(None, &info, DIB_RGB_COLORS, &mut bits, None, 0)?;
            let pixels = std::slice::from_raw_parts_mut(bits.cast::<u32>(), (size * size) as usize);

            for py in 0..size {
                for px in 0..size {
                    let mut hits = 0;
                    for sy in 0..SAMPLES {
                        for sx in 0..SAMPLES {
                            let x = (px as f32 + (sx as f32 + 0.5) / SAMPLES as f32) / size as f32;
                            let y = (py as f32 + (sy as f32 + 0.5) / SAMPLES as f32) / size as f32;
                            if covers(glyph, x, y) {
                                hits += 1;
                            }
                        }
                    }
                    let alpha = (hits * 255 / (SAMPLES * SAMPLES)) as u32;
                    pixels[(py * size + px) as usize] = (alpha << 24) | rgb;
                }
            }

            // A 32-bit icon takes its transparency from the alpha channel, but
            // still needs a mask. Monochrome rows are padded to 16 bits.
            let mask_bits = vec![0u8; (((size + 15) / 16) * 2 * size) as usize];
            let mask = CreateBitmap(size, size, 1, 1, Some(mask_bits.as_ptr().cast()));

            let icon = CreateIconIndirect(&ICONINFO {
                fIcon: true.into(),
                xHotspot: 0,
                yHotspot: 0,
                hbmMask: mask,
                hbmColor: color,
            });

            // The icon keeps its own copies of both bitmaps.
            let _ = DeleteObject(HGDIOBJ(color.0));
            let _ = DeleteObject(HGDIOBJ(mask.0));
            icon
        }
    }
}

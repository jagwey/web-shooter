use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWindow {
    pub hwnd: i64,
    pub title: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraHolder {
    pub name: String,
    pub active: bool,
}

#[cfg(windows)]
mod platform {
    use super::{CameraHolder, DesktopWindow};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Duration;
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM, POINT, RECT, TRUE};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows::Win32::System::Threading::GetCurrentProcessId;
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GA_ROOT, GWL_EXSTYLE, GetAncestor, GetClassNameW, GetWindowLongPtrW,
        GetWindowRect, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsIconic,
        IsWindowVisible, SetWindowPos, WindowFromPoint, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER,
        WS_EX_TOOLWINDOW,
    };
    use windows_registry::CURRENT_USER;

    pub fn hwnd_of(raw: i64) -> HWND {
        HWND(raw as *mut core::ffi::c_void)
    }

    fn wide_text(hwnd: HWND, read: impl Fn(HWND, &mut [u16]) -> i32) -> String {
        let mut buf = vec![0u16; 256];
        let count = read(hwnd, &mut buf);
        if count <= 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buf[..count as usize])
    }

    fn window_title(hwnd: HWND) -> String {
        let length = unsafe { GetWindowTextLengthW(hwnd) };
        if length <= 0 {
            return String::new();
        }
        let mut buf = vec![0u16; (length as usize) + 1];
        let count = unsafe { GetWindowTextW(hwnd, &mut buf) };
        if count <= 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buf[..count as usize])
    }

    fn class_name(hwnd: HWND) -> String {
        wide_text(hwnd, |hwnd, buf| unsafe { GetClassNameW(hwnd, buf) })
    }

    fn skipped_class(name: &str) -> bool {
        matches!(
            name,
            "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd"
        )
    }

    fn is_cloaked(hwnd: HWND) -> bool {
        let mut cloaked = 0u32;
        let hr = unsafe {
            DwmGetWindowAttribute(
                hwnd,
                DWMWA_CLOAKED,
                &mut cloaked as *mut u32 as *mut _,
                4,
            )
        };
        hr.is_ok() && cloaked != 0
    }

    fn describe(hwnd: HWND) -> Option<DesktopWindow> {
        if unsafe { !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() } {
            return None;
        }
        if is_cloaked(hwnd) {
            return None;
        }
        let class = class_name(hwnd);
        if skipped_class(&class) {
            return None;
        }
        let style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) } as u32;
        if style & WS_EX_TOOLWINDOW.0 != 0 {
            return None;
        }
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
        if pid == unsafe { GetCurrentProcessId() } {
            return None;
        }
        let title = window_title(hwnd);
        if title.trim().is_empty() {
            return None;
        }
        let mut rect = RECT::default();
        if unsafe { GetWindowRect(hwnd, &mut rect) }.is_err() {
            return None;
        }
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width < 80 || height < 60 {
            return None;
        }
        Some(DesktopWindow {
            hwnd: hwnd.0 as isize as i64,
            title,
            x: rect.left,
            y: rect.top,
            width,
            height,
        })
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let list = &mut *(lparam.0 as *mut Vec<DesktopWindow>);
        if let Some(window) = describe(hwnd) {
            list.push(window);
        }
        TRUE
    }

    pub fn list_windows() -> Result<Vec<DesktopWindow>, String> {
        let mut list = Vec::new();
        unsafe {
            EnumWindows(Some(enum_proc), LPARAM(&mut list as *mut _ as isize))
                .map_err(|err| err.to_string())?;
        }
        Ok(list)
    }

    pub fn window_at(x: i32, y: i32) -> Result<Option<DesktopWindow>, String> {
        let hwnd = unsafe { WindowFromPoint(POINT { x, y }) };
        if hwnd.0.is_null() {
            return Ok(None);
        }
        let root = unsafe { GetAncestor(hwnd, GA_ROOT) };
        let target = if root.0.is_null() { hwnd } else { root };
        Ok(describe(target))
    }

    pub fn move_window(raw: i64, x: i32, y: i32) -> Result<DesktopWindow, String> {
        let hwnd = hwnd_of(raw);
        unsafe {
            SetWindowPos(hwnd, None, x, y, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOZORDER)
                .map_err(|err| err.to_string())?;
        }
        describe(hwnd).ok_or_else(|| "window disappeared".into())
    }

    pub fn nudge_window(raw: i64) -> Result<(), String> {
        let Some(window) = describe(hwnd_of(raw)) else {
            return Ok(());
        };
        let hwnd = raw;
        std::thread::spawn(move || {
            let _ = move_window(hwnd, window.x + 28, window.y + 12);
            std::thread::sleep(Duration::from_millis(90));
            let _ = move_window(hwnd, window.x, window.y);
        });
        Ok(())
    }

    pub fn fling_window(
        raw: i64,
        vx: f32,
        vy: f32,
        generation: std::sync::Arc<AtomicU64>,
        token: u64,
        monitors: Vec<(i32, i32, i32, i32)>,
    ) {
        let Some(start) = describe(hwnd_of(raw)) else {
            return;
        };
        std::thread::spawn(move || {
            let mut x = start.x as f32;
            let mut y = start.y as f32;
            let mut vx = vx;
            let mut vy = vy;
            for _ in 0..28 {
                if generation.load(Ordering::Relaxed) != token {
                    return;
                }
                x += vx;
                y += vy;
                vx *= 0.82;
                vy *= 0.82;
                if let Err(_) = move_window(raw, x.round() as i32, y.round() as i32) {
                    return;
                }
                if vx.abs() < 1.5 && vy.abs() < 1.5 {
                    break;
                }
                std::thread::sleep(Duration::from_millis(16));
            }
            snap_window(raw, x.round() as i32, y.round() as i32, start.width, start.height, &monitors);
        });
    }

    fn snap_window(raw: i64, x: i32, y: i32, width: i32, height: i32, monitors: &[(i32, i32, i32, i32)]) {
        for (mx, my, mw, mh) in monitors {
            let near_left = (x - mx).abs() < 48;
            let near_right = ((x + width) - (mx + mw)).abs() < 48;
            if !near_left && !near_right {
                continue;
            }
            let half = mw / 2;
            let snap_x = if near_left { *mx } else { mx + half };
            unsafe {
                let _ = SetWindowPos(
                    hwnd_of(raw),
                    None,
                    snap_x,
                    *my,
                    half,
                    *mh,
                    SWP_NOACTIVATE | SWP_NOZORDER,
                );
            }
            let _ = height;
            return;
        }
    }

    fn pretty_app(name: &str) -> String {
        let cleaned = name.replace('#', "\\");
        cleaned
            .rsplit(['\\', '/'])
            .next()
            .unwrap_or(name)
            .to_string()
    }

    fn walk_holders(key: &windows_registry::Key, depth: u32, label: &str, out: &mut Vec<CameraHolder>) {
        let start = key.get_u64("LastUsedTimeStart").unwrap_or(0);
        let stop = key.get_u64("LastUsedTimeStop").unwrap_or(0);
        if start > stop && start > 0 && !label.is_empty() && label != "NonPackaged" {
            out.push(CameraHolder {
                name: pretty_app(label),
                active: true,
            });
        }
        if depth == 0 {
            return;
        }
        let Ok(names) = key.keys() else {
            return;
        };
        for name in names {
            if let Ok(child) = key.open(&name) {
                walk_holders(&child, depth - 1, &name, out);
            }
        }
    }

    pub fn camera_holders() -> Result<Vec<CameraHolder>, String> {
        let key = CURRENT_USER
            .open(r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam")
            .map_err(|err| err.to_string())?;
        let mut holders = Vec::new();
        walk_holders(&key, 2, "", &mut holders);
        holders.sort_by(|a, b| a.name.cmp(&b.name));
        holders.dedup_by(|a, b| a.name == b.name);
        Ok(holders)
    }
}

#[cfg(windows)]
pub use platform::{camera_holders, fling_window, list_windows, move_window, nudge_window, window_at};

#[cfg(not(windows))]
pub fn list_windows() -> Result<Vec<DesktopWindow>, String> {
    Ok(Vec::new())
}

#[cfg(not(windows))]
pub fn window_at(_x: i32, _y: i32) -> Result<Option<DesktopWindow>, String> {
    Err("win32-only".into())
}

#[cfg(not(windows))]
pub fn move_window(_raw: i64, _x: i32, _y: i32) -> Result<DesktopWindow, String> {
    Err("win32-only".into())
}

#[cfg(not(windows))]
pub fn nudge_window(_raw: i64) -> Result<(), String> {
    Err("win32-only".into())
}

#[cfg(not(windows))]
pub fn fling_window(
    _raw: i64,
    _vx: f32,
    _vy: f32,
    _generation: std::sync::Arc<std::sync::atomic::AtomicU64>,
    _token: u64,
    _monitors: Vec<(i32, i32, i32, i32)>,
) {
}

#[cfg(not(windows))]
pub fn camera_holders() -> Result<Vec<CameraHolder>, String> {
    Ok(Vec::new())
}

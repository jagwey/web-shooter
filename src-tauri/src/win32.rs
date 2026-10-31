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
    /// Page / client area in screen pixels. Overlay coverage uses this, not the outer frame.
    pub client_x: i32,
    pub client_y: i32,
    pub client_width: i32,
    pub client_height: i32,
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
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT, TRUE, WPARAM};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows::Win32::Graphics::Gdi::ClientToScreen;
    use windows::Win32::System::Threading::GetCurrentProcessId;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT,
        KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, MOUSEINPUT, MOUSEEVENTF_WHEEL, VIRTUAL_KEY,
        VK_CONTROL, VK_D, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_MEDIA_NEXT_TRACK, VK_MEDIA_PLAY_PAUSE,
        VK_OEM_MINUS, VK_OEM_PLUS, VK_RMENU, VK_RSHIFT, VK_RWIN, VK_VOLUME_DOWN, VK_VOLUME_UP,
        VK_W,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GA_ROOT, GWL_EXSTYLE, GetAncestor, GetClassNameW, GetForegroundWindow,
        GetWindowLongPtrW, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
        EnumChildWindows, GetClientRect, GetWindowThreadProcessId, IsIconic,
        IsWindow, IsWindowVisible, IsZoomed, PostMessageW, SetForegroundWindow, SetWindowPos,
        ShowWindow, WindowFromPoint, SW_MAXIMIZE, SW_MINIMIZE, SW_RESTORE, SWP_ASYNCWINDOWPOS,
        SWP_DEFERERASE, SWP_NOACTIVATE, SWP_NOSENDCHANGING, SWP_NOSIZE, SWP_NOZORDER, WM_CLOSE,
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

    /// Browser (and WebView2) page surface. The top-level frame includes the tab strip and toolbar.
    fn is_tab_content(name: &str) -> bool {
        matches!(
            name,
            "Chrome_RenderWidgetHostHWND" | "MozillaCompositorWindowClass" | "Intermediate D3D Window"
        )
    }

    fn client_screen(hwnd: HWND) -> Option<(i32, i32, i32, i32)> {
        let mut rect = RECT::default();
        if unsafe { GetClientRect(hwnd, &mut rect) }.is_err() {
            return None;
        }
        let mut origin = POINT { x: 0, y: 0 };
        if unsafe { !ClientToScreen(hwnd, &mut origin).as_bool() } {
            return None;
        }
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width < 40 || height < 40 {
            return None;
        }
        Some((origin.x, origin.y, width, height))
    }

    struct ContentSearch {
        best: HWND,
        area: i32,
    }

    unsafe extern "system" fn enum_content(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let search = &mut *(lparam.0 as *mut ContentSearch);
        if unsafe { IsWindowVisible(hwnd).as_bool() } && is_tab_content(&class_name(hwnd)) {
            if let Some((_, _, width, height)) = client_screen(hwnd) {
                let area = width.saturating_mul(height);
                if area > search.area {
                    search.area = area;
                    search.best = hwnd;
                }
            }
        }
        TRUE
    }

    /// Largest visible tab surface under `root`, or `root` when the window is not a browser.
    fn content_of(root: HWND) -> HWND {
        let mut search = ContentSearch {
            best: HWND(std::ptr::null_mut()),
            area: 0,
        };
        unsafe {
            let _ = EnumChildWindows(Some(root), Some(enum_content), LPARAM(&mut search as *mut _ as isize));
        }
        if search.best.0.is_null() {
            root
        } else {
            search.best
        }
    }

    fn with_client(mut window: DesktopWindow, content: HWND) -> DesktopWindow {
        if let Some((x, y, width, height)) = client_screen(content) {
            window.client_x = x;
            window.client_y = y;
            window.client_width = width;
            window.client_height = height;
        } else {
            window.client_x = window.x;
            window.client_y = window.y;
            window.client_width = window.width;
            window.client_height = window.height;
        }
        window
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
        Some(with_client(
            DesktopWindow {
                hwnd: hwnd.0 as isize as i64,
                title,
                x: rect.left,
                y: rect.top,
                width,
                height,
                client_x: rect.left,
                client_y: rect.top,
                client_width: width,
                client_height: height,
            },
            content_of(hwnd),
        ))
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

    fn root_of(hwnd: HWND) -> HWND {
        let root = unsafe { GetAncestor(hwnd, GA_ROOT) };
        if root.0.is_null() { hwnd } else { root }
    }

    /// Live, user-facing top-level window that is not ours, the shell, or Task Manager.
    fn checked_target(raw: i64) -> Result<(HWND, DesktopWindow), String> {
        let hwnd = hwnd_of(raw);
        if raw == 0 || unsafe { !IsWindow(Some(hwnd)).as_bool() } {
            return Err("window gone".into());
        }
        if root_of(hwnd) != hwnd || class_name(hwnd) == "TaskManagerWindow" {
            return Err("window protected".into());
        }
        let desc = describe(hwnd).ok_or("window protected")?;
        Ok((hwnd, desc))
    }

    pub fn window_at(x: i32, y: i32) -> Result<Option<DesktopWindow>, String> {
        let hwnd = unsafe { WindowFromPoint(POINT { x, y }) };
        if !hwnd.0.is_null() {
            let target = root_of(hwnd);
            if let Some(desc) = describe(target) {
                // A hit on the page itself beats "largest child" (devtools, side panels).
                let desc = if is_tab_content(&class_name(hwnd)) {
                    with_client(desc, hwnd)
                } else {
                    desc
                };
                return Ok(Some(desc));
            }
            if skipped_class(&class_name(target)) {
                return Ok(None);
            }
        }
        // Fallback: search top-to-bottom z-order windows
        let list = list_windows()?;
        for win in list {
            if x >= win.x && x < win.x + win.width && y >= win.y && y < win.y + win.height {
                return Ok(Some(win));
            }
        }
        Ok(None)
    }

    /// Fresh client rect for a window we already track. No full desktop enum.
    pub fn window_client(raw: i64) -> Result<DesktopWindow, String> {
        let (hwnd, desc) = checked_target(raw)?;
        Ok(with_client(desc, content_of(hwnd)))
    }

    /// Ultra-low-latency window move for live hand dragging and fling loops.
    /// Avoids `describe(hwnd)` / `EnumChildWindows` and uses `SWP_ASYNCWINDOWPOS` so the
    /// caller never blocks on the target application's message loop.
    pub fn move_window_fast(raw: i64, x: i32, y: i32) -> Result<(), String> {
        let hwnd = hwnd_of(raw);
        if raw == 0 || unsafe { !IsWindow(Some(hwnd)).as_bool() } {
            return Err("window gone".into());
        }
        let class = class_name(hwnd);
        if root_of(hwnd) != hwnd || class == "TaskManagerWindow" || skipped_class(&class) {
            return Err("window protected".into());
        }
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
        if pid == unsafe { GetCurrentProcessId() } {
            return Err("window protected".into());
        }
        unsafe {
            if IsZoomed(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            SetWindowPos(
                hwnd,
                None,
                x,
                y,
                0,
                0,
                SWP_ASYNCWINDOWPOS
                    | SWP_NOSIZE
                    | SWP_NOACTIVATE
                    | SWP_NOZORDER
                    | SWP_NOSENDCHANGING
                    | SWP_DEFERERASE,
            )
            .map_err(|err| err.to_string())?;
        }
        Ok(())
    }

    pub fn move_window(raw: i64, x: i32, y: i32) -> Result<DesktopWindow, String> {
        let (hwnd, _) = checked_target(raw)?;
        unsafe {
            if IsZoomed(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            SetWindowPos(
                hwnd,
                None,
                x,
                y,
                0,
                0,
                SWP_ASYNCWINDOWPOS | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOSENDCHANGING,
            )
            .map_err(|err| err.to_string())?;
        }
        describe(hwnd).ok_or_else(|| "window disappeared".into())
    }

    /// Move and size a window in one step. Used to land a thrown window on another monitor.
    pub fn place_window(raw: i64, x: i32, y: i32, width: i32, height: i32) -> Result<DesktopWindow, String> {
        let (hwnd, _) = checked_target(raw)?;
        if width < 80 || height < 60 {
            return Err("window too small".into());
        }
        unsafe {
            if IsZoomed(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            SetWindowPos(hwnd, None, x, y, width, height, SWP_NOACTIVATE | SWP_NOZORDER)
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
            let _ = move_window_fast(hwnd, window.x + 28, window.y + 12);
            std::thread::sleep(Duration::from_millis(50));
            let _ = move_window_fast(hwnd, window.x + 14, window.y + 6);
            std::thread::sleep(Duration::from_millis(50));
            let _ = move_window_fast(hwnd, window.x, window.y);
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
            for _ in 0..36 {
                if generation.load(Ordering::Relaxed) != token {
                    return;
                }
                x += vx;
                y += vy;
                vx *= 0.86;
                vy *= 0.86;
                if move_window_fast(raw, x.round() as i32, y.round() as i32).is_err() {
                    return;
                }
                if vx.abs() < 1.0 && vy.abs() < 1.0 {
                    break;
                }
                std::thread::sleep(Duration::from_millis(16));
            }
            snap_window(raw, x.round() as i32, y.round() as i32, start.width, start.height, &monitors);
        });
    }

    fn snap_window(raw: i64, x: i32, y: i32, width: i32, _height: i32, monitors: &[(i32, i32, i32, i32)]) {
        for (mx, my, mw, mh) in monitors {
            let near_left = (x - mx).abs() < 48;
            let near_right = ((x + width) - (mx + mw)).abs() < 48;
            let near_top = (y - my).abs() < 36;
            if near_top && !near_left && !near_right {
                unsafe {
                    let _ = ShowWindow(hwnd_of(raw), SW_MAXIMIZE);
                }
                return;
            }
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
            return;
        }

        // Safe screen clamp so flung window is not lost off-screen:
        if !monitors.is_empty() {
            let margin = 100;
            let min_x = monitors.iter().map(|(mx, _, _, _)| *mx).min().unwrap_or(0);
            let max_x = monitors.iter().map(|(mx, _, mw, _)| mx + mw).max().unwrap_or(1920);
            let min_y = monitors.iter().map(|(_, my, _, _)| *my).min().unwrap_or(0);
            let max_y = monitors.iter().map(|(_, my, _, mh)| my + mh).max().unwrap_or(1080);

            let clamped_x = x.clamp(min_x - width + margin, max_x - margin);
            let clamped_y = y.clamp(min_y, max_y - margin);
            if clamped_x != x || clamped_y != y {
                let _ = move_window(raw, clamped_x, clamped_y);
            }
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

    pub fn close_window(raw: i64) -> Result<(), String> {
        let (hwnd, _) = checked_target(raw)?;
        unsafe {
            PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0))
                .map_err(|err| err.to_string())?;
        }
        Ok(())
    }

    fn key(vk: VIRTUAL_KEY, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: if up { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    fn mouse_wheel(delta: i32) -> INPUT {
        INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: delta as u32,
                    dwFlags: MOUSEEVENTF_WHEEL,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    /// Ctrl+W only to `raw`, and only if it is (or can become) the foreground window.
    /// Held Shift/Alt/Win are released first so the stroke never becomes Ctrl+Shift+W.
    pub fn close_active_tab(raw: i64) -> Result<(), String> {
        let (hwnd, _) = checked_target(raw)?;
        let is_front = || root_of(unsafe { GetForegroundWindow() }) == hwnd;
        if !is_front() {
            let _ = unsafe { SetForegroundWindow(hwnd) };
            std::thread::sleep(Duration::from_millis(60));
            if !is_front() {
                // If focus cannot be captured in time, fallback to posting WM_CLOSE directly
                let _ = unsafe { PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0)) };
                return Ok(());
            }
        }
        let mut inputs = Vec::with_capacity(10);
        for vk in [VK_LSHIFT, VK_RSHIFT, VK_LMENU, VK_RMENU, VK_LWIN, VK_RWIN] {
            if unsafe { GetAsyncKeyState(vk.0 as i32) } < 0 {
                inputs.push(key(vk, true));
            }
        }
        inputs.extend([
            key(VK_CONTROL, false),
            key(VK_W, false),
            key(VK_W, true),
            key(VK_CONTROL, true),
        ]);
        let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent as usize != inputs.len() {
            return Err("input blocked".into());
        }
        Ok(())
    }

    pub fn minimize_window(raw: i64) -> Result<(), String> {
        let (hwnd, _) = checked_target(raw)?;
        unsafe {
            let _ = ShowWindow(hwnd, SW_MINIMIZE);
        }
        Ok(())
    }

    pub fn get_foreground_window() -> Result<Option<DesktopWindow>, String> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return Ok(None);
            }
            Ok(describe(hwnd))
        }
    }

    pub fn adjust_volume(delta: i32) -> Result<(), String> {
        if delta == 0 {
            return Ok(());
        }
        let vk = if delta > 0 { VK_VOLUME_UP } else { VK_VOLUME_DOWN };
        let count = (delta.unsigned_abs() as usize).min(20);
        let mut inputs = Vec::with_capacity(count * 2);
        for _ in 0..count {
            inputs.push(key(vk, false));
            inputs.push(key(vk, true));
        }
        let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent as usize != inputs.len() {
            return Err("volume input blocked".into());
        }
        Ok(())
    }

    pub fn media_play_pause() -> Result<(), String> {
        let inputs = [
            key(VK_MEDIA_PLAY_PAUSE, false),
            key(VK_MEDIA_PLAY_PAUSE, true),
        ];
        let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent as usize != inputs.len() {
            return Err("media key input blocked".into());
        }
        Ok(())
    }

    pub fn media_next_track() -> Result<(), String> {
        let inputs = [
            key(VK_MEDIA_NEXT_TRACK, false),
            key(VK_MEDIA_NEXT_TRACK, true),
        ];
        let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent as usize != inputs.len() {
            return Err("media key input blocked".into());
        }
        Ok(())
    }

    pub fn show_desktop() -> Result<(), String> {
        let mut inputs = Vec::with_capacity(10);
        for vk in [VK_LSHIFT, VK_RSHIFT, VK_LMENU, VK_RMENU, VK_CONTROL] {
            if unsafe { GetAsyncKeyState(vk.0 as i32) } < 0 {
                inputs.push(key(vk, true));
            }
        }
        inputs.extend([
            key(VK_LWIN, false),
            key(VK_D, false),
            key(VK_D, true),
            key(VK_LWIN, true),
        ]);
        let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent as usize != inputs.len() {
            return Err("show desktop input blocked".into());
        }
        Ok(())
    }

    pub fn zoom_desktop(zoom_in: bool) -> Result<(), String> {
        let vk = if zoom_in { VK_OEM_PLUS } else { VK_OEM_MINUS };
        let mut inputs = Vec::with_capacity(10);
        for mod_vk in [VK_LMENU, VK_RMENU, VK_CONTROL, VK_LSHIFT, VK_RSHIFT] {
            if unsafe { GetAsyncKeyState(mod_vk.0 as i32) } < 0 {
                inputs.push(key(mod_vk, true));
            }
        }
        inputs.extend([
            key(VK_LWIN, false),
            key(vk, false),
            key(vk, true),
            key(VK_LWIN, true),
        ]);
        let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent as usize != inputs.len() {
            return Err("zoom input blocked".into());
        }
        Ok(())
    }

    pub fn scroll_wheel(delta: i32) -> Result<(), String> {
        if delta == 0 {
            return Ok(());
        }
        let inputs = [mouse_wheel(delta)];
        let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent != 1 {
            return Err("scroll wheel input blocked".into());
        }
        Ok(())
    }
}

#[cfg(windows)]
pub use platform::{
    adjust_volume, camera_holders, close_active_tab, close_window, fling_window,
    get_foreground_window, list_windows, media_next_track, media_play_pause, minimize_window,
    move_window, move_window_fast, nudge_window, place_window, scroll_wheel, show_desktop,
    window_at, window_client, zoom_desktop,
};

#[cfg(not(windows))]
pub fn move_window_fast(_raw: i64, _x: i32, _y: i32) -> Result<(), String> {
    Err("win32-only".into())
}

#[cfg(not(windows))]
pub fn list_windows() -> Result<Vec<DesktopWindow>, String> {
    Ok(Vec::new())
}

#[cfg(not(windows))]
pub fn window_at(_x: i32, _y: i32) -> Result<Option<DesktopWindow>, String> {
    Err("win32-only".into())
}

#[cfg(not(windows))]
pub fn window_client(_raw: i64) -> Result<DesktopWindow, String> {
    Err("win32-only".into())
}

#[cfg(not(windows))]
pub fn move_window(_raw: i64, _x: i32, _y: i32) -> Result<DesktopWindow, String> {
    Err("win32-only".into())
}

#[cfg(not(windows))]
pub fn place_window(_raw: i64, _x: i32, _y: i32, _width: i32, _height: i32) -> Result<DesktopWindow, String> {
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

#[cfg(not(windows))]
pub fn close_window(_raw: i64) -> Result<(), String> {
    Err("win32-only".into())
}

#[cfg(not(windows))]
pub fn close_active_tab(_raw: i64) -> Result<(), String> {
    Err("win32-only".into())
}

#[cfg(not(windows))]
pub fn minimize_window(_raw: i64) -> Result<(), String> {
    Err("win32-only".into())
}

#[cfg(not(windows))]
pub fn get_foreground_window() -> Result<Option<DesktopWindow>, String> {
    Ok(None)
}

#[cfg(not(windows))]
pub fn adjust_volume(_delta: i32) -> Result<(), String> {
    Err("win32-only".into())
}

#[cfg(not(windows))]
pub fn media_play_pause() -> Result<(), String> {
    Err("win32-only".into())
}

#[cfg(not(windows))]
pub fn media_next_track() -> Result<(), String> {
    Err("win32-only".into())
}

#[cfg(not(windows))]
pub fn show_desktop() -> Result<(), String> {
    Err("win32-only".into())
}

#[cfg(not(windows))]
pub fn zoom_desktop(_zoom_in: bool) -> Result<(), String> {
    Err("win32-only".into())
}

#[cfg(not(windows))]
pub fn scroll_wheel(_delta: i32) -> Result<(), String> {
    Err("win32-only".into())
}

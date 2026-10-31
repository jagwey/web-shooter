mod settings;
mod win32;

use settings::{load_settings, store_settings, Settings};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewWindow,
    WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

struct Shared {
    hotkeys: Mutex<HashMap<String, String>>,
    fling_gen: Arc<AtomicU64>,
    overlay_on: AtomicBool,
}

impl Default for Shared {
    fn default() -> Self {
        Self {
            hotkeys: Mutex::new(HashMap::new()),
            fling_gen: Arc::new(AtomicU64::new(0)),
            overlay_on: AtomicBool::new(false),
        }
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorInfo {
    id: String,
    name: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    primary: bool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OverlayFrame {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    visible: bool,
    monitor_id: String,
    mode: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    monitors: Vec<MonitorInfo>,
    win32: bool,
    window_count: u32,
    holders: Vec<win32::CameraHolder>,
    frame: OverlayFrame,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveResponse {
    settings: Settings,
    warnings: Vec<String>,
}

fn read_monitors(window: &WebviewWindow) -> Result<Vec<MonitorInfo>, String> {
    let monitors = window.available_monitors().map_err(|err| err.to_string())?;
    let mut listed = Vec::new();
    for monitor in monitors {
        let pos = monitor.position();
        let size = monitor.size();
        let name = monitor.name().cloned().unwrap_or_default();
        let primary = pos.x == 0 && pos.y == 0;
        listed.push(MonitorInfo {
            id: format!("{name}|{},{}", pos.x, pos.y),
            name,
            x: pos.x,
            y: pos.y,
            width: size.width,
            height: size.height,
            primary,
        });
    }
    if !listed.is_empty() && !listed.iter().any(|item| item.primary) {
        listed[0].primary = true;
    }
    Ok(listed)
}

fn frame_for(monitors: &[MonitorInfo], settings: &Settings) -> (OverlayFrame, bool) {
    if monitors.is_empty() {
        return (
            OverlayFrame {
                x: 0,
                y: 0,
                width: 1280,
                height: 720,
                visible: false,
                monitor_id: settings.monitor_id.clone(),
                mode: settings.monitor_mode.clone(),
            },
            false,
        );
    }
    if settings.monitor_mode == "all" {
        let min_x = monitors.iter().map(|item| item.x).min().unwrap_or(0);
        let min_y = monitors.iter().map(|item| item.y).min().unwrap_or(0);
        let max_x = monitors
            .iter()
            .map(|item| item.x + item.width as i32)
            .max()
            .unwrap_or(1280);
        let max_y = monitors
            .iter()
            .map(|item| item.y + item.height as i32)
            .max()
            .unwrap_or(720);
        return (
            OverlayFrame {
                x: min_x,
                y: min_y,
                width: (max_x - min_x).max(1) as u32,
                height: (max_y - min_y).max(1) as u32,
                visible: true,
                monitor_id: settings.monitor_id.clone(),
                mode: "all".into(),
            },
            false,
        );
    }
    let exact = monitors.iter().find(|item| item.id == settings.monitor_id);
    let named = settings
        .monitor_id
        .split('|')
        .next()
        .filter(|name| !name.is_empty())
        .and_then(|name| {
            let matches: Vec<_> = monitors.iter().filter(|item| item.name == name).collect();
            if matches.len() == 1 {
                Some(matches[0])
            } else {
                None
            }
        });
    let fallback = exact.is_none();
    let chosen = exact
        .or(named)
        .or_else(|| monitors.iter().find(|item| item.primary))
        .unwrap_or(&monitors[0]);
    (
        OverlayFrame {
            x: chosen.x,
            y: chosen.y,
            width: chosen.width,
            height: chosen.height,
            visible: true,
            monitor_id: chosen.id.clone(),
            mode: "one".into(),
        },
        fallback && !settings.monitor_id.is_empty(),
    )
}

fn apply_frame(overlay: &WebviewWindow, frame: &OverlayFrame) -> Result<(), String> {
    overlay
        .set_position(Position::Physical(PhysicalPosition::new(frame.x, frame.y)))
        .map_err(|err| err.to_string())?;
    overlay
        .set_size(Size::Physical(PhysicalSize::new(frame.width, frame.height)))
        .map_err(|err| err.to_string())?;
    let _ = overlay.emit("overlay-frame", frame);
    Ok(())
}

fn show_overlay(app: &AppHandle) -> Result<OverlayFrame, String> {
    let window = app.get_webview_window("control").ok_or("control missing")?;
    let overlay = app.get_webview_window("overlay").ok_or("overlay missing")?;
    let monitors = read_monitors(&window)?;
    let mut settings = load_settings(app);
    let (mut frame, fallback) = frame_for(&monitors, &settings);
    if fallback {
        settings.monitor_id = frame.monitor_id.clone();
        settings.monitor_mode = "one".into();
        let _ = store_settings(app, &settings);
    }
    apply_frame(&overlay, &frame)?;
    let _ = overlay.set_ignore_cursor_events(true);
    overlay.show().map_err(|err| err.to_string())?;
    let _ = overlay.set_always_on_top(true);
    frame.visible = true;
    app.state::<Shared>().overlay_on.store(true, Ordering::Relaxed);
    let _ = app.emit("overlay-visibility", serde_json::json!({ "visible": true, "frame": frame }));
    Ok(frame)
}

fn hide_overlay(app: &AppHandle) -> Result<OverlayFrame, String> {
    let settings = load_settings(app);
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.hide();
    }
    app.state::<Shared>().overlay_on.store(false, Ordering::Relaxed);
    let frame = OverlayFrame {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        visible: false,
        monitor_id: settings.monitor_id,
        mode: settings.monitor_mode,
    };
    let _ = app.emit("overlay-visibility", serde_json::json!({ "visible": false, "frame": frame }));
    Ok(frame)
}

fn show_control(app: &AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("control").ok_or("control missing")?;
    window.show().map_err(|err| err.to_string())?;
    let _ = window.unminimize();
    let _ = window.set_focus();
    let _ = window.emit("shell-shown", ());
    Ok(())
}

fn apply_hotkeys(app: &AppHandle, settings: &Settings) -> Vec<String> {
    let mut warnings = Vec::new();
    let mut map = HashMap::new();
    let shortcut = app.global_shortcut();
    if let Err(err) = shortcut.unregister_all() {
        warnings.push(err.to_string());
    }
    for binding in &settings.bindings {
        if binding.input.kind != "hotkey" {
            continue;
        }
        match binding.input.value.parse::<Shortcut>() {
            Ok(parsed) => {
                let key = parsed.to_string();
                if let Err(err) = shortcut.register(parsed) {
                    warnings.push(format!("{}: {err}", binding.input.value));
                    continue;
                }
                map.insert(key, binding.action.clone());
            }
            Err(err) => warnings.push(format!("{}: {err}", binding.input.value)),
        }
    }
    *app.state::<Shared>().hotkeys.lock().expect("hotkeys") = map;
    warnings
}

fn apply_autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    let result = if enabled { manager.enable() } else { manager.disable() };
    result.map_err(|err| err.to_string())
}

fn on_hotkey(app: &AppHandle, shortcut: &Shortcut) {
    let key = shortcut.to_string();
    let action = app
        .state::<Shared>()
        .hotkeys
        .lock()
        .expect("hotkeys")
        .get(&key)
        .cloned();
    let Some(action) = action else {
        return;
    };
    match action.as_str() {
        "overlay_toggle" => {
            let _ = toggle_overlay(app.clone());
        }
        "show_control" => {
            let _ = show_control(app);
        }
        other => {
            let _ = app.emit("binding-fired", other.to_string());
        }
    }
}

fn monitor_rects(app: &AppHandle) -> Vec<(i32, i32, i32, i32)> {
    let Some(window) = app.get_webview_window("control") else {
        return Vec::new();
    };
    read_monitors(&window)
        .unwrap_or_default()
        .into_iter()
        .map(|item| (item.x, item.y, item.width as i32, item.height as i32))
        .collect()
}

fn watch_monitors(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = String::new();
        loop {
            std::thread::sleep(Duration::from_millis(1200));
            let Some(window) = app.get_webview_window("control") else {
                continue;
            };
            let Ok(monitors) = read_monitors(&window) else {
                continue;
            };
            let fingerprint = monitors
                .iter()
                .map(|item| format!("{}:{}x{}", item.id, item.width, item.height))
                .collect::<Vec<_>>()
                .join(";");
            if fingerprint == last {
                continue;
            }
            let startup = last.is_empty();
            last = fingerprint;
            if startup {
                continue;
            }
            let mut settings = load_settings(&app);
            let (frame, fallback) = frame_for(&monitors, &settings);
            if fallback {
                settings.monitor_id = frame.monitor_id.clone();
                settings.monitor_mode = "one".into();
                let _ = store_settings(&app, &settings);
            }
            if app.state::<Shared>().overlay_on.load(Ordering::Relaxed) {
                if let Some(overlay) = app.get_webview_window("overlay") {
                    let _ = apply_frame(&overlay, &frame);
                }
            }
            let _ = app.emit(
                "monitors-changed",
                serde_json::json!({ "monitors": monitors, "fallback": fallback, "frame": frame }),
            );
        }
    });
}

fn tray_label(english: bool, tr: &str, en: &str) -> String {
    if english { en } else { tr }.into()
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let english = load_settings(app.handle()).lang == "en";
    let show = MenuItem::with_id(app, "show", tray_label(english, "Göster", "Show"), true, None::<&str>)?;
    let overlay = MenuItem::with_id(app, "overlay", tray_label(english, "Örtü", "Overlay"), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", tray_label(english, "Çıkış", "Quit"), true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &overlay, &quit])?;
    let mut builder = TrayIconBuilder::with_id("jagwey")
        .menu(&menu)
        .tooltip("Jagwey Web Shooter")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                let _ = show_control(app);
            }
            "overlay" => {
                let _ = toggle_overlay(app.clone());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = show_control(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    if let Err(err) = builder.build(app) {
        eprintln!("[tray] Failed to build tray icon: {err}");
    }
    Ok(())
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Settings {
    load_settings(&app)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Settings) -> Result<SaveResponse, String> {
    let settings = settings.normalize();
    let warnings = apply_hotkeys(&app, &settings);
    apply_autostart(&app, settings.start_with_windows)?;
    store_settings(&app, &settings)?;
    Ok(SaveResponse { settings, warnings })
}

#[tauri::command]
fn desktop_snapshot(app: AppHandle) -> Result<Snapshot, String> {
    let window = app.get_webview_window("control").ok_or("control missing")?;
    let monitors = read_monitors(&window)?;
    let settings = load_settings(&app);
    let (frame, _) = frame_for(&monitors, &settings);
    let windows = win32::list_windows().unwrap_or_default();
    let holders = win32::camera_holders().unwrap_or_default();
    Ok(Snapshot {
        monitors,
        win32: cfg!(windows),
        window_count: windows.len() as u32,
        holders,
        frame,
    })
}

#[tauri::command]
fn toggle_overlay(app: AppHandle) -> Result<OverlayFrame, String> {
    if app.state::<Shared>().overlay_on.load(Ordering::Relaxed) {
        hide_overlay(&app)
    } else {
        show_overlay(&app)
    }
}

#[tauri::command]
fn place_overlay(app: AppHandle) -> Result<OverlayFrame, String> {
    show_overlay(&app)
}

#[tauri::command]
fn hide_overlay_cmd(app: AppHandle) -> Result<OverlayFrame, String> {
    hide_overlay(&app)
}

#[tauri::command]
fn show_control_cmd(app: AppHandle) -> Result<(), String> {
    show_control(&app)
}

#[tauri::command]
fn win32_status() -> serde_json::Value {
    serde_json::json!({
        "available": cfg!(windows),
        "detail": if cfg!(windows) {
            "EnumWindows + SetWindowPos"
        } else {
            "Win32 hooks compile on Windows only"
        }
    })
}

#[tauri::command]
fn list_windows() -> Result<Vec<win32::DesktopWindow>, String> {
    win32::list_windows()
}

#[tauri::command]
fn window_at(x: i32, y: i32) -> Result<Option<win32::DesktopWindow>, String> {
    win32::window_at(x, y)
}

#[tauri::command]
fn window_client(hwnd: i64) -> Result<win32::DesktopWindow, String> {
    win32::window_client(hwnd)
}

#[tauri::command]
fn move_window(app: AppHandle, hwnd: i64, x: i32, y: i32) -> Result<win32::DesktopWindow, String> {
    app.state::<Shared>().fling_gen.fetch_add(1, Ordering::Relaxed);
    win32::move_window(hwnd, x, y)
}

#[tauri::command]
fn place_window(app: AppHandle, hwnd: i64, x: i32, y: i32, width: i32, height: i32) -> Result<win32::DesktopWindow, String> {
    app.state::<Shared>().fling_gen.fetch_add(1, Ordering::Relaxed);
    win32::place_window(hwnd, x, y, width, height)
}

#[tauri::command]
fn nudge_window(hwnd: i64) -> Result<(), String> {
    win32::nudge_window(hwnd)
}

#[tauri::command]
fn fling_window(app: AppHandle, hwnd: i64, vx: f32, vy: f32) {
    let shared = app.state::<Shared>();
    let token = shared.fling_gen.fetch_add(1, Ordering::Relaxed) + 1;
    let generation = Arc::clone(&shared.fling_gen);
    win32::fling_window(hwnd, vx, vy, generation, token, monitor_rects(&app));
}

#[tauri::command]
fn cancel_fling(app: AppHandle) {
    app.state::<Shared>().fling_gen.fetch_add(1, Ordering::Relaxed);
}

#[tauri::command]
fn camera_holders() -> Result<Vec<win32::CameraHolder>, String> {
    win32::camera_holders()
}

#[tauri::command]
fn close_window(hwnd: i64) -> Result<(), String> {
    win32::close_window(hwnd)
}

#[tauri::command]
fn close_active_tab(hwnd: i64) -> Result<(), String> {
    win32::close_active_tab(hwnd)
}

#[tauri::command]
fn minimize_window(hwnd: i64) -> Result<(), String> {
    win32::minimize_window(hwnd)
}

#[tauri::command]
fn get_foreground_window() -> Result<Option<win32::DesktopWindow>, String> {
    win32::get_foreground_window()
}

#[tauri::command]
fn adjust_volume(delta: i32) -> Result<(), String> {
    win32::adjust_volume(delta)
}

#[tauri::command]
fn media_play_pause() -> Result<(), String> {
    win32::media_play_pause()
}

#[tauri::command]
fn media_next_track() -> Result<(), String> {
    win32::media_next_track()
}

#[tauri::command]
fn show_desktop() -> Result<(), String> {
    win32::show_desktop()
}

#[tauri::command]
fn zoom_desktop(zoom_in: bool) -> Result<(), String> {
    win32::zoom_desktop(zoom_in)
}

#[tauri::command]
fn scroll_wheel(delta: i32) -> Result<(), String> {
    win32::scroll_wheel(delta)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be first: a second launch focuses the running window instead of fighting over the WebView2 profile.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("control") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--tray"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        on_hotkey(app, shortcut);
                    }
                })
                .build(),
        )
        .manage(Shared::default())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            desktop_snapshot,
            toggle_overlay,
            place_overlay,
            hide_overlay_cmd,
            show_control_cmd,
            win32_status,
            list_windows,
            window_at,
            window_client,
            move_window,
            place_window,
            nudge_window,
            fling_window,
            cancel_fling,
            camera_holders,
            close_window,
            close_active_tab,
            minimize_window,
            get_foreground_window,
            adjust_volume,
            media_play_pause,
            media_next_track,
            show_desktop,
            zoom_desktop,
            scroll_wheel
        ])
        .setup(|app| {
            build_tray(app)?;
            let settings = load_settings(app.handle());
            let _ = apply_hotkeys(app.handle(), &settings);
            if settings.start_with_windows {
                let _ = apply_autostart(app.handle(), true);
            }
            if let Some(window) = app.get_webview_window("control") {
                let _ = window.maximize();
                let _ = window.show();
                let handle = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = handle.hide();
                        let _ = handle.emit("shell-hidden", ());
                    }
                });
            }
            if std::env::args().any(|arg| arg == "--tray") {
                if let Some(window) = app.get_webview_window("control") {
                    let _ = window.hide();
                }
            }
            watch_monitors(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("jagwey overlay");
}

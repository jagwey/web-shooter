use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BindingInput {
    pub kind: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Binding {
    pub id: String,
    pub action: String,
    pub input: BindingInput,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub onboarded: bool,
    pub lang: String,
    pub start_with_windows: bool,
    pub release_camera_when_idle: bool,
    pub idle_release_secs: u32,
    pub monitor_mode: String,
    pub monitor_id: String,
    pub fx_preset: String,
    pub bindings: Vec<Binding>,
    #[serde(default)]
    pub camera_device_id: String,
    #[serde(default = "default_target_fps")]
    pub target_fps: u32,
    #[serde(default = "default_sound_enabled")]
    pub sound_enabled: bool,
    #[serde(default)]
    pub focus_frame_only: bool,
    #[serde(default)]
    pub show_webs: bool,
    #[serde(default = "default_true")]
    pub show_focus_frame: bool,
    #[serde(default = "default_true")]
    pub dual_hands: bool,
    #[serde(default)]
    pub custom_fx: Option<serde_json::Value>,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub hollow_purple_enabled: bool,
    #[serde(default = "default_close_mode")]
    pub close_mode: String,
    #[serde(default = "default_true")]
    pub safety_guard: bool,
    #[serde(default = "default_ai_provider")]
    pub ai_provider: String,
    #[serde(default)]
    pub ai_api_key: String,
    #[serde(default = "default_ai_endpoint")]
    pub ai_endpoint: String,
    #[serde(default = "default_ai_model")]
    pub ai_model: String,
    #[serde(default, alias = "airVolumeToggle")]
    pub air_volume_enabled: bool,
    #[serde(default, alias = "airMediaToggle")]
    pub air_media_enabled: bool,
    #[serde(default, alias = "ninjaShieldToggle")]
    pub ninja_shield_enabled: bool,
    #[serde(default, alias = "airZoomToggle")]
    pub air_zoom_enabled: bool,
    #[serde(default, alias = "airScrollToggle")]
    pub air_scroll_enabled: bool,
    #[serde(default = "default_true")]
    pub body_tracking: bool,
    #[serde(default = "default_sniper_target")]
    pub sniper_target: String,
    #[serde(default)]
    pub custom_gestures: Option<serde_json::Value>,
    #[serde(default = "default_smoothing")]
    pub smoothing: f32,
    #[serde(default)]
    pub migrated_pause: bool,
    #[serde(default)]
    pub migrated_v060: bool,
}

fn default_smoothing() -> f32 {
    0.75
}

fn default_sniper_target() -> String {
    "gemini_web".into()
}

fn default_target_fps() -> u32 {
    120
}

fn default_sound_enabled() -> bool {
    true
}

fn default_true() -> bool {
    true
}

fn default_close_mode() -> String {
    "window".into()
}

fn default_ai_provider() -> String {
    "none".into()
}

fn default_ai_endpoint() -> String {
    "http://localhost:11434".into()
}

fn default_ai_model() -> String {
    "gemini-2.5-flash".into()
}

fn default_theme() -> String {
    "minimal".into()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            onboarded: false,
            lang: "tr".into(),
            start_with_windows: false,
            release_camera_when_idle: false,
            idle_release_secs: 20,
            monitor_mode: "one".into(),
            monitor_id: String::new(),
            fx_preset: "off".into(),
            bindings: default_bindings(),
            camera_device_id: String::new(),
            target_fps: 120,
            sound_enabled: true,
            focus_frame_only: false,
            show_webs: false,
            show_focus_frame: true,
            dual_hands: true,
            custom_fx: None,
            theme: "minimal".into(),
            hollow_purple_enabled: false,
            close_mode: "window".into(),
            safety_guard: true,
            ai_provider: "none".into(),
            ai_api_key: String::new(),
            ai_endpoint: "http://localhost:11434".into(),
            ai_model: "gemini-2.5-flash".into(),
            air_volume_enabled: false,
            air_media_enabled: false,
            ninja_shield_enabled: false,
            air_zoom_enabled: false,
            air_scroll_enabled: false,
            body_tracking: true,
            sniper_target: "gemini_web".into(),
            custom_gestures: None,
            smoothing: 0.75,
            migrated_pause: false,
            migrated_v060: true,
        }
    }
}

fn default_bindings() -> Vec<Binding> {
    vec![
        binding("b-fist", "grab", "gesture", "fist"),
        binding("b-palm", "cancel", "gesture", "palm"),
        binding("b-peace", "minimize", "gesture", "peace"),
        binding("b-web", "close", "gesture", "web"),
        binding("b-overlay", "overlay_toggle", "hotkey", "CommandOrControl+Alt+J"),
        binding("b-control", "show_control", "hotkey", "CommandOrControl+Alt+K"),
        binding("b-pause", "gestures_pause", "hotkey", "CommandOrControl+Alt+P"),
    ]
}

fn binding(id: &str, action: &str, kind: &str, value: &str) -> Binding {
    Binding {
        id: id.into(),
        action: action.into(),
        input: BindingInput {
            kind: kind.into(),
            value: value.into(),
        },
    }
}

impl Settings {
    pub fn normalize(mut self) -> Self {
        if self.lang != "en" {
            self.lang = "tr".into();
        }
        if !matches!(self.monitor_mode.as_str(), "one" | "all") {
            self.monitor_mode = "one".into();
        }
        if !matches!(self.fx_preset.as_str(), "classic" | "mint" | "neon" | "low" | "light" | "spiderman" | "miles" | "symbiote" | "gojo" | "custom" | "off") {
            self.fx_preset = "off".into();
        }
        if !matches!(self.theme.as_str(), "minimal" | "anime") {
            self.theme = "minimal".into();
        }
        if !matches!(self.close_mode.as_str(), "tab" | "window") {
            self.close_mode = "window".into();
        }
        if !matches!(self.ai_provider.as_str(), "none" | "gemini" | "ollama" | "groq" | "openrouter" | "pollinations" | "lmstudio" | "custom"
        ) {
            self.ai_provider = "none".into();
        }
        if self.target_fps != 60 && self.target_fps != 120 {
            self.target_fps = 120;
        }
        self.idle_release_secs = self.idle_release_secs.clamp(5, 300);
        if !self.smoothing.is_finite() {
            self.smoothing = 0.75;
        }
        self.smoothing = self.smoothing.clamp(0.2, 1.0);
        self.bindings.retain(|item| {
            !item.action.trim().is_empty()
                && matches!(item.input.kind.as_str(), "gesture" | "hotkey")
                && !item.input.value.trim().is_empty()
        });
        if self.bindings.is_empty() {
            self.bindings = default_bindings();
        }
        self
    }

    /// v0.6.0 minimal defaults for existing users; personal fields (lang, camera, monitor, ai, ...) are kept.
    fn migrate_v060(mut self) -> Self {
        self.close_mode = "window".into();
        self.show_webs = false;
        self.fx_preset = "off".into();
        self.hollow_purple_enabled = false;
        self.air_volume_enabled = false;
        self.air_media_enabled = false;
        self.air_zoom_enabled = false;
        self.air_scroll_enabled = false;
        self.ninja_shield_enabled = false;
        self.body_tracking = true;
        self.theme = "minimal".into();
        self.migrated_v060 = true;
        self
    }
}

pub fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir.join("settings.json"))
}

pub fn load_settings(app: &AppHandle) -> Settings {
    let Ok(path) = settings_path(app) else {
        return Settings::default();
    };
    let Ok(text) = fs::read_to_string(path) else {
        return Settings::default();
    };
    let Ok(settings) = serde_json::from_str::<Settings>(&text).map(Settings::normalize) else {
        return Settings::default();
    };
    if settings.migrated_v060 {
        return settings;
    }
    let settings = settings.migrate_v060();
    let _ = store_settings(app, &settings);
    settings
}

pub fn store_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    let text = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    fs::write(path, text).map_err(|err| err.to_string())
}

pub fn profiles_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir.join("profiles.json"))
}

pub fn load_profiles_json(app: &AppHandle) -> Option<String> {
    let path = profiles_path(app).ok()?;
    fs::read_to_string(path).ok()
}

pub fn store_profiles_json(app: &AppHandle, json: &str) -> Result<(), String> {
    let path = profiles_path(app)?;
    fs::write(path, json).map_err(|err| err.to_string())
}

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
            fx_preset: "mint".into(),
            bindings: default_bindings(),
            camera_device_id: String::new(),
        }
    }
}

fn default_bindings() -> Vec<Binding> {
    vec![
        binding("b-web", "shoot", "gesture", "web"),
        binding("b-fist", "grab", "gesture", "fist"),
        binding("b-palm", "cancel", "gesture", "palm"),
        binding("b-overlay", "overlay_toggle", "hotkey", "CommandOrControl+Alt+J"),
        binding("b-control", "show_control", "hotkey", "CommandOrControl+Alt+K"),
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
        if !matches!(self.fx_preset.as_str(), "classic" | "mint" | "neon" | "low" | "light") {
            self.fx_preset = "mint".into();
        }
        self.idle_release_secs = self.idle_release_secs.clamp(5, 300);
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
    serde_json::from_str::<Settings>(&text)
        .map(Settings::normalize)
        .unwrap_or_else(|_| Settings::default())
}

pub fn store_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    let text = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    fs::write(path, text).map_err(|err| err.to_string())
}

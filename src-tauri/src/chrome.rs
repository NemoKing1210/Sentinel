use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;

use crate::logging::{self, LogLevel};

const TRAY_ID: &str = "sentinel-tray";
const MAX_ACTIVE_ITEMS: usize = 5;
const MAX_RECENT_ITEMS: usize = 5;
const MAX_NAME_LENGTH: usize = 35;

const APP_PREFIX: &str = "app:";
const TRAY_PREFIX: &str = "tray:";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrayActiveItem {
    pub id: String,
    pub name: String,
    pub status: String,
    pub progress: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrayRecentItem {
    pub item_id: String,
    pub name: String,
    pub verdict: String,
    pub detections: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrayLabels {
    pub show: String,
    pub dashboard: String,
    pub queue: String,
    pub queue_count: String,
    pub history: String,
    pub settings: String,
    pub scan_file: String,
    pub scan_folder: String,
    pub active_count: String,
    pub recent_count: String,
    pub no_active: String,
    pub no_recent: String,
    pub quit: String,
    pub status_queued: String,
    pub status_uploading: String,
    pub status_scanning: String,
    pub verdict_clean: String,
    pub verdict_suspicious: String,
    pub verdict_malicious: String,
    pub verdict_unknown: String,
}

#[derive(Debug, Default)]
pub struct TrayState {
    pub labels: Option<TrayLabels>,
    pub active: Vec<TrayActiveItem>,
    pub recent: Vec<TrayRecentItem>,
}

pub enum MenuAction {
    Show,
    PickFiles,
    PickFolder,
    ViewDashboard,
    ViewQueue,
    ViewHistory,
    ViewSettings,
    ViewReport(String),
    About,
    OpenLogFolder,
    Quit,
}

impl MenuAction {
    fn parse_name(name: &str) -> Option<Self> {
        match name {
            "show" => Some(Self::Show),
            "pick_files" => Some(Self::PickFiles),
            "pick_folder" => Some(Self::PickFolder),
            "view_dashboard" => Some(Self::ViewDashboard),
            "view_queue" => Some(Self::ViewQueue),
            "view_history" => Some(Self::ViewHistory),
            "view_settings" => Some(Self::ViewSettings),
            "about" => Some(Self::About),
            "open_logs" => Some(Self::OpenLogFolder),
            "quit" => Some(Self::Quit),
            _ => {
                if let Some(report_id) = name.strip_prefix("view_report:") {
                    if !report_id.is_empty() {
                        return Some(Self::ViewReport(report_id.to_string()));
                    }
                }
                None
            }
        }
    }

    fn name(&self) -> &str {
        match self {
            Self::Show => "show",
            Self::PickFiles => "pick_files",
            Self::PickFolder => "pick_folder",
            Self::ViewDashboard => "view_dashboard",
            Self::ViewQueue => "view_queue",
            Self::ViewHistory => "view_history",
            Self::ViewSettings => "view_settings",
            Self::ViewReport(_) => "view_report",
            Self::About => "about",
            Self::OpenLogFolder => "open_logs",
            Self::Quit => "quit",
        }
    }

    fn frontend_id(&self) -> String {
        match self {
            Self::ViewReport(id) => format!("view_report:{id}"),
            _ => self.name().to_string(),
        }
    }

    fn app_id(&self) -> String {
        match self {
            Self::ViewReport(id) => format!("{APP_PREFIX}view_report:{id}"),
            _ => format!("{}{}", APP_PREFIX, self.name()),
        }
    }

    fn tray_id(&self) -> String {
        match self {
            Self::ViewReport(id) => format!("{TRAY_PREFIX}view_report:{id}"),
            _ => format!("{}{}", TRAY_PREFIX, self.name()),
        }
    }
}

fn show_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn emit_to_main<R: Runtime>(app: &AppHandle<R>, action: &MenuAction) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("native:menu", action.frontend_id());
    }
}

fn dispatch_action<R: Runtime>(app: &AppHandle<R>, action: MenuAction) {
    match action {
        MenuAction::Show => show_window(app),
        MenuAction::PickFiles | MenuAction::PickFolder => {
            show_window(app);
            emit_to_main(app, &action);
        }
        MenuAction::ViewDashboard
        | MenuAction::ViewQueue
        | MenuAction::ViewHistory
        | MenuAction::ViewSettings => {
            show_window(app);
            emit_to_main(app, &action);
        }
        MenuAction::ViewReport(_) => {
            show_window(app);
            emit_to_main(app, &action);
        }
        MenuAction::About => {
            show_window(app);
            emit_to_main(app, &action);
        }
        MenuAction::OpenLogFolder => {
            if let Ok(log_dir) = logging::directory(app) {
                let _ = app.opener().open_path(log_dir, None::<&str>);
                logging::write(LogLevel::Info, "tray.open_logs", serde_json::json!({}));
            }
        }
        MenuAction::Quit => {
            logging::write(LogLevel::Info, "tray.quit_requested", serde_json::json!({}));
            app.exit(0);
        }
    }
}

pub fn handle_app_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref();
    if !id.starts_with(APP_PREFIX) {
        return;
    }
    let name = &id[APP_PREFIX.len()..];
    let Some(action) = MenuAction::parse_name(name) else {
        return;
    };
    dispatch_action(app, action);
}

pub fn handle_tray_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref();
    if !id.starts_with(TRAY_PREFIX) {
        return;
    }
    let name = &id[TRAY_PREFIX.len()..];
    let Some(action) = MenuAction::parse_name(name) else {
        return;
    };
    dispatch_action(app, action);
}

pub fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(
                app,
                MenuAction::PickFiles.app_id(),
                "Choose files…",
                true,
                Some("CmdOrCtrl+O"),
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::PickFolder.app_id(),
                "Choose folder…",
                true,
                Some("CmdOrCtrl+Shift+O"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                MenuAction::OpenLogFolder.app_id(),
                "Open log folder",
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some("CmdOrCtrl+H"))?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &MenuItem::with_id(
                app,
                MenuAction::Show.app_id(),
                "Show Sentinel",
                true,
                Some("CmdOrCtrl+Shift+S"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some("CmdOrCtrl+Q"))?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &MenuItem::with_id(
                app,
                MenuAction::ViewDashboard.app_id(),
                "Dashboard",
                true,
                Some("CmdOrCtrl+1"),
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::ViewQueue.app_id(),
                "Queue",
                true,
                Some("CmdOrCtrl+2"),
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::ViewHistory.app_id(),
                "History",
                true,
                Some("CmdOrCtrl+3"),
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::ViewSettings.app_id(),
                "Settings",
                true,
                Some("CmdOrCtrl+4"),
            )?,
        ],
    )?;

    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some("CmdOrCtrl+M"))?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::close_window(app, Some("CmdOrCtrl+W"))?,
        ],
    )?;

    let help_menu = Submenu::with_items(
        app,
        "Help",
        true,
        &[&MenuItem::with_id(
            app,
            MenuAction::About.app_id(),
            "About Sentinel",
            true,
            None::<&str>,
        )?],
    )?;

    Menu::with_items(app, &[&file_menu, &view_menu, &window_menu, &help_menu])
}

fn truncate_name(name: &str) -> String {
    if name.len() <= MAX_NAME_LENGTH {
        return name.to_string();
    }
    let mut truncated: String = name.chars().take(MAX_NAME_LENGTH - 1).collect();
    truncated.push('…');
    truncated
}

fn status_text(status: &str, progress: u8, labels: &TrayLabels) -> String {
    let base = match status {
        "uploading" => &labels.status_uploading,
        "scanning" => &labels.status_scanning,
        _ => &labels.status_queued,
    };
    if status == "scanning" || status == "uploading" {
        format!("{base} {progress}%")
    } else {
        base.clone()
    }
}

fn verdict_icon(verdict: &str, labels: &TrayLabels) -> String {
    match verdict {
        "clean" => labels.verdict_clean.clone(),
        "suspicious" => labels.verdict_suspicious.clone(),
        "malicious" => labels.verdict_malicious.clone(),
        _ => labels.verdict_unknown.clone(),
    }
}

pub fn build_tray_menu<R: Runtime>(
    app: &AppHandle<R>,
    state: &TrayState,
) -> tauri::Result<Menu<R>> {
    let labels = match &state.labels {
        Some(labels) => labels,
        None => return build_tray_menu_fallback(app),
    };

    let active_count = state.active.len();
    let recent_count = state.recent.len();

    let queue_label = if active_count > 0 {
        format!("{} ({})", labels.queue_count, active_count)
    } else {
        labels.queue.clone()
    };

    let active_header = format!("{} ({})", labels.active_count, active_count);
    let recent_header = format!("{} ({})", labels.recent_count, recent_count);

    let active_submenu = Submenu::new(app, &active_header, true)?;
    if state.active.is_empty() {
        active_submenu.append(&MenuItem::with_id(
            app,
            format!("{TRAY_PREFIX}active_empty"),
            &labels.no_active,
            false,
            None::<&str>,
        )?)?;
    } else {
        for item in state.active.iter().take(MAX_ACTIVE_ITEMS) {
            let display = format!(
                "{} — {}",
                truncate_name(&item.name),
                status_text(&item.status, item.progress, labels)
            );
            active_submenu.append(&MenuItem::with_id(
                app,
                format!("{TRAY_PREFIX}active:{}", item.id),
                &display,
                false,
                None::<&str>,
            )?)?;
        }
    }

    let recent_submenu = Submenu::new(app, &recent_header, true)?;
    if state.recent.is_empty() {
        recent_submenu.append(&MenuItem::with_id(
            app,
            format!("{TRAY_PREFIX}recent_empty"),
            &labels.no_recent,
            false,
            None::<&str>,
        )?)?;
    } else {
        for item in state.recent.iter().take(MAX_RECENT_ITEMS) {
            let icon = verdict_icon(&item.verdict, labels);
            let display = format!(
                "{icon} {} ({}/{})",
                truncate_name(&item.name),
                item.detections,
                item.total
            );
            let report_action = MenuAction::ViewReport(item.item_id.clone());
            recent_submenu.append(&MenuItem::with_id(
                app,
                report_action.tray_id(),
                &display,
                true,
                None::<&str>,
            )?)?;
        }
    }

    Menu::with_items(
        app,
        &[
            &MenuItem::with_id(
                app,
                MenuAction::Show.tray_id(),
                &labels.show,
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                MenuAction::ViewDashboard.tray_id(),
                &labels.dashboard,
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::ViewQueue.tray_id(),
                &queue_label,
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::ViewHistory.tray_id(),
                &labels.history,
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::ViewSettings.tray_id(),
                &labels.settings,
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                MenuAction::PickFiles.tray_id(),
                &labels.scan_file,
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::PickFolder.tray_id(),
                &labels.scan_folder,
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &active_submenu,
            &recent_submenu,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some(&labels.quit))?,
        ],
    )
}

fn build_tray_menu_fallback<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    Menu::with_items(
        app,
        &[
            &MenuItem::with_id(
                app,
                MenuAction::Show.tray_id(),
                "Show Sentinel",
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                MenuAction::PickFiles.tray_id(),
                "Scan file…",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::PickFolder.tray_id(),
                "Scan folder…",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::ViewQueue.tray_id(),
                "Open queue",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::ViewHistory.tray_id(),
                "Open history",
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )
}

pub fn install_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let state = app.state::<Mutex<TrayState>>();
    let state_guard = state.lock().unwrap();
    let menu = build_tray_menu(app, &state_guard)?;
    drop(state_guard);

    let icon = app.default_window_icon().cloned().unwrap_or_else(|| {
        tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png")).expect("tray icon")
    });
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(false)
        .tooltip("Sentinel")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_tray_menu_event(app, event))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[tauri::command]
pub fn update_tray_state(
    app: tauri::AppHandle,
    labels: String,
    active: String,
    recent: String,
) -> Result<(), String> {
    let state = app.state::<Mutex<TrayState>>();
    let mut state_guard = state.lock().map_err(|error| error.to_string())?;

    match serde_json::from_str::<TrayLabels>(&labels) {
        Ok(parsed) => state_guard.labels = Some(parsed),
        Err(error) => {
            logging::write(
                LogLevel::Warn,
                "tray.labels_parse_failed",
                serde_json::json!({ "error": error.to_string() }),
            );
        }
    }

    match serde_json::from_str::<Vec<TrayActiveItem>>(&active) {
        Ok(parsed) => state_guard.active = parsed,
        Err(error) => {
            logging::write(
                LogLevel::Warn,
                "tray.active_parse_failed",
                serde_json::json!({ "error": error.to_string() }),
            );
        }
    }

    match serde_json::from_str::<Vec<TrayRecentItem>>(&recent) {
        Ok(parsed) => state_guard.recent = parsed,
        Err(error) => {
            logging::write(
                LogLevel::Warn,
                "tray.recent_parse_failed",
                serde_json::json!({ "error": error.to_string() }),
            );
        }
    }

    drop(state_guard);
    rebuild_tray_menu(&app);
    Ok(())
}

pub fn rebuild_tray_menu<R: Runtime>(app: &AppHandle<R>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let state = app.state::<Mutex<TrayState>>();
    let state_guard = state.lock().unwrap();
    match build_tray_menu(app, &state_guard) {
        Ok(menu) => {
            if let Err(error) = tray.set_menu(Some(menu)) {
                logging::write(
                    LogLevel::Warn,
                    "tray.menu_rebuild_failed",
                    serde_json::json!({ "error": error.to_string() }),
                );
            }
        }
        Err(error) => {
            logging::write(
                LogLevel::Warn,
                "tray.menu_rebuild_failed",
                serde_json::json!({ "error": error.to_string() }),
            );
        }
    }
}

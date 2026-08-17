use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;

use crate::logging::{self, LogLevel};

const TRAY_ID: &str = "sentinel-tray";

pub enum MenuAction {
    Show,
    PickFiles,
    PickFolder,
    ViewDashboard,
    ViewQueue,
    ViewHistory,
    ViewSettings,
    About,
    OpenLogFolder,
    Quit,
}

impl MenuAction {
    fn from_id(id: &str) -> Option<Self> {
        match id {
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
            _ => None,
        }
    }

    fn as_id(&self) -> &'static str {
        match self {
            Self::Show => "show",
            Self::PickFiles => "pick_files",
            Self::PickFolder => "pick_folder",
            Self::ViewDashboard => "view_dashboard",
            Self::ViewQueue => "view_queue",
            Self::ViewHistory => "view_history",
            Self::ViewSettings => "view_settings",
            Self::About => "about",
            Self::OpenLogFolder => "open_logs",
            Self::Quit => "quit",
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

fn emit_to_main<R: Runtime>(app: &AppHandle<R>, action: MenuAction) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("native:menu", action.as_id());
    }
}

pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let Some(action) = MenuAction::from_id(event.id().as_ref()) else {
        return;
    };
    match action {
        MenuAction::Show => show_window(app),
        MenuAction::PickFiles | MenuAction::PickFolder => {
            show_window(app);
            emit_to_main(app, action);
        }
        MenuAction::ViewDashboard
        | MenuAction::ViewQueue
        | MenuAction::ViewHistory
        | MenuAction::ViewSettings => {
            show_window(app);
            emit_to_main(app, action);
        }
        MenuAction::About => {
            show_window(app);
            emit_to_main(app, action);
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

pub fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(
                app,
                MenuAction::PickFiles.as_id(),
                "Choose files…",
                true,
                Some("CmdOrCtrl+O"),
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::PickFolder.as_id(),
                "Choose folder…",
                true,
                Some("CmdOrCtrl+Shift+O"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                MenuAction::OpenLogFolder.as_id(),
                "Open log folder",
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some("CmdOrCtrl+H"))?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &MenuItem::with_id(
                app,
                MenuAction::Show.as_id(),
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
                MenuAction::ViewDashboard.as_id(),
                "Dashboard",
                true,
                Some("CmdOrCtrl+1"),
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::ViewQueue.as_id(),
                "Queue",
                true,
                Some("CmdOrCtrl+2"),
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::ViewHistory.as_id(),
                "History",
                true,
                Some("CmdOrCtrl+3"),
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::ViewSettings.as_id(),
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
            MenuAction::About.as_id(),
            "About Sentinel",
            true,
            None::<&str>,
        )?],
    )?;

    Menu::with_items(app, &[&file_menu, &view_menu, &window_menu, &help_menu])
}

pub fn build_tray_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    Menu::with_items(
        app,
        &[
            &MenuItem::with_id(
                app,
                MenuAction::Show.as_id(),
                "Show Sentinel",
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                MenuAction::PickFiles.as_id(),
                "Scan file…",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::PickFolder.as_id(),
                "Scan folder…",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::ViewQueue.as_id(),
                "Open queue",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                app,
                MenuAction::ViewHistory.as_id(),
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
    let menu = build_tray_menu(app)?;
    let icon = app.default_window_icon().cloned().unwrap_or_else(|| {
        tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png")).expect("tray icon")
    });
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(false)
        .tooltip("Sentinel")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_menu_event(app, event))
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

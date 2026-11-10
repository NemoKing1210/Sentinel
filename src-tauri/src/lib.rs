mod autostart;
mod browser;
mod chrome;
mod commands;
mod logging;
mod notifications;
mod persistence;
mod shell;
mod watcher;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager, WindowEvent};

static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

#[tauri::command]
fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::Release);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    shell::stash_launch_paths(std::env::args().collect());
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            let paths = shell::collect_scan_args(argv.clone());
            if !paths.is_empty() {
                // Queue the paths as well as notifying the UI: the webview may still be
                // loading, in which case the event is lost but the queue survives.
                shell::stash_launch_paths(argv);
                let _ = app.emit("native:context-scan", serde_json::json!({}));
                logging::write(
                    logging::LogLevel::Info,
                    "shell.second_instance_paths_forwarded",
                    serde_json::json!({}),
                );
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());

    builder = builder
        .manage(Mutex::new(chrome::TrayState::default()))
        .invoke_handler(tauri::generate_handler![
            commands::has_saved_api_key,
            commands::get_api_key,
            commands::save_api_key,
            commands::validate_api_key,
            commands::submit_file,
            commands::submit_archive,
            commands::get_analysis_status,
            commands::open_external_url,
            browser::open_internal_browser,
            browser::set_internal_browser_bounds,
            browser::internal_browser_action,
            browser::close_internal_browser,
            commands::get_log_level,
            commands::set_log_level,
            commands::get_log_directory,
            commands::open_log_directory,
            commands::log_event,
            commands::get_path_metadata,
            commands::file_exists,
            commands::open_folder_containing,
            commands::get_file_icon,
            commands::get_window_backdrop,
            commands::get_system_accent,
            notifications::notify_scan_result,
            persistence::load_persisted_state,
            persistence::save_persisted_state,
            persistence::clear_persisted_state,
            shell::register_context_menu,
            shell::unregister_context_menu,
            shell::is_context_menu_registered,
            shell::get_pending_scan_paths,
            shell::platform_name,
            autostart::get_autostart,
            autostart::set_autostart,
            set_close_to_tray,
            chrome::update_tray_state
        ])
        .setup(|app| {
            logging::init(app.handle()).map_err(std::io::Error::other)?;
            if let Err(error) = chrome::install_tray(app.handle()) {
                logging::write(
                    logging::LogLevel::Warn,
                    "tray.install_failed",
                    serde_json::json!({ "error": error.to_string() }),
                );
            }
            let stored_settings = persistence::read_settings(app.handle());
            if let Some(stored) = stored_settings
                .as_ref()
                .and_then(|settings| persistence::setting_bool(settings, "closeToTray"))
            {
                CLOSE_TO_TRAY.store(stored, Ordering::Release);
            }
            let autostart_wanted = stored_settings
                .as_ref()
                .and_then(|settings| persistence::setting_bool(settings, "autostart"))
                .unwrap_or(false);
            autostart::sync_from_settings(app.handle(), autostart_wanted);
            if stored_settings
                .as_ref()
                .and_then(|settings| persistence::setting_bool(settings, "contextMenuEnabled"))
                .unwrap_or(false)
            {
                if let Err(error) = shell::register_context_menu() {
                    logging::write(
                        logging::LogLevel::Warn,
                        "shell.register_on_start_failed",
                        serde_json::json!({ "error": error }),
                    );
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if CLOSE_TO_TRAY.load(Ordering::Acquire) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        });

    builder
        .run(tauri::generate_context!())
        .expect("error while running Sentinel");
}

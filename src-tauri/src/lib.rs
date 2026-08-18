mod chrome;
mod commands;
mod logging;
mod notifications;
mod persistence;
mod shell;

use std::sync::atomic::{AtomicBool, Ordering};
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
            let paths = shell::collect_scan_args(argv);
            if !paths.is_empty() {
                let _ = app.emit("native:context-scan", serde_json::json!({ "paths": paths }));
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
        .invoke_handler(tauri::generate_handler![
            commands::has_saved_api_key,
            commands::get_api_key,
            commands::save_api_key,
            commands::validate_api_key,
            commands::submit_file,
            commands::submit_archive,
            commands::get_analysis_status,
            commands::open_external_url,
            commands::get_log_level,
            commands::set_log_level,
            commands::get_log_directory,
            commands::open_log_directory,
            commands::log_event,
            commands::get_path_metadata,
            notifications::notify_scan_result,
            persistence::load_persisted_state,
            persistence::save_persisted_state,
            persistence::clear_persisted_state,
            shell::register_context_menu,
            shell::unregister_context_menu,
            shell::is_context_menu_registered,
            shell::get_pending_scan_paths,
            shell::platform_name,
            set_close_to_tray
        ])
        .setup(|app| {
            logging::init(app.handle()).map_err(std::io::Error::other)?;
            let menu = chrome::build_app_menu(app.handle())?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| {
                chrome::handle_menu_event(app, event);
            });
            if let Err(error) = chrome::install_tray(app.handle()) {
                logging::write(
                    logging::LogLevel::Warn,
                    "tray.install_failed",
                    serde_json::json!({ "error": error.to_string() }),
                );
            }
            if let Some(stored) = persistence::read_close_to_tray_setting(app.handle()) {
                CLOSE_TO_TRAY.store(stored, Ordering::Release);
            }
            if persistence::read_setting_bool(app.handle(), "contextMenuEnabled").unwrap_or(false) {
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

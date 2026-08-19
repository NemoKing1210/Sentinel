use tauri::{AppHandle, Emitter, Manager};

const NOTIFICATION_EVENT: &str = "native:notification";
const MAX_TITLE_CHARS: usize = 200;
const MAX_BODY_CHARS: usize = 1000;
const MAX_ID_CHARS: usize = 128;
const MAX_LABEL_CHARS: usize = 64;

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn emit_report_request(app: &AppHandle, item_id: &str) {
    let _ = app.emit(NOTIFICATION_EVENT, serde_json::json!({ "itemId": item_id }));
}

fn validate(title: &str, body: &str, item_id: &str, action_label: &str) -> Result<(), String> {
    if title.is_empty() || body.is_empty() || item_id.is_empty() {
        return Err("notifications.invalid_payload: title, body and item_id are required".into());
    }
    if title.chars().count() > MAX_TITLE_CHARS
        || body.chars().count() > MAX_BODY_CHARS
        || item_id.chars().count() > MAX_ID_CHARS
        || action_label.chars().count() > MAX_LABEL_CHARS
    {
        return Err("notifications.payload_too_large".into());
    }
    Ok(())
}

#[tauri::command]
pub fn notify_scan_result(
    app: AppHandle,
    title: String,
    body: String,
    item_id: String,
    action_label: Option<String>,
) -> Result<(), String> {
    let title = title.trim();
    let body = body.trim();
    let item_id = item_id.trim();
    let action_label = action_label.unwrap_or_default();
    let action_label = action_label.trim();
    validate(title, body, item_id, action_label)?;
    show(&app, title, body, item_id, action_label)
}

#[cfg(target_os = "windows")]
fn show(
    app: &AppHandle,
    title: &str,
    body: &str,
    item_id: &str,
    action_label: &str,
) -> Result<(), String> {
    use std::path::MAIN_SEPARATOR as SEP;
    use tauri_winrt_notification::{Duration, Sound, Toast};

    fn running_from_dev_dir() -> bool {
        let Ok(exe) = std::env::current_exe() else {
            return false;
        };
        let Some(dir) = exe.parent() else {
            return false;
        };
        let dir = dir.display().to_string();
        dir.ends_with(&format!("{SEP}target{SEP}debug"))
            || dir.ends_with(&format!("{SEP}target{SEP}release"))
    }

    let app_id = if running_from_dev_dir() {
        Toast::POWERSHELL_APP_ID.to_string()
    } else {
        "dev.sentinel.scanner".to_string()
    };
    let app_handle = app.clone();
    let item_id_owned = item_id.to_string();
    let toast = Toast::new(&app_id)
        .title(title)
        .text1(body)
        .duration(Duration::Short)
        .sound(Some(Sound::Default));
    let toast = if action_label.is_empty() {
        toast
    } else {
        toast.add_button(action_label, "open")
    };
    toast
        .on_activated(move |_arg| {
            focus_main_window(&app_handle);
            emit_report_request(&app_handle, &item_id_owned);
            Ok(())
        })
        .show()
        .map_err(|error| format!("notifications.show_failed: {error}"))
}

#[cfg(target_os = "linux")]
fn show(
    app: &AppHandle,
    title: &str,
    body: &str,
    item_id: &str,
    action_label: &str,
) -> Result<(), String> {
    use notify_rust::Notification;

    let mut notification = Notification::new();
    notification
        .summary(title)
        .body(body)
        .appname("Sentinel")
        .auto_icon();
    if !action_label.is_empty() {
        notification.action("open", action_label);
    }
    let handle = notification
        .show()
        .map_err(|error| format!("notifications.show_failed: {error}"))?;
    let app_handle = app.clone();
    let item_id_owned = item_id.to_string();
    std::thread::spawn(move || {
        handle.wait_for_action(|action| {
            if action == "open" {
                focus_main_window(&app_handle);
                emit_report_request(&app_handle, &item_id_owned);
            }
        });
    });
    Ok(())
}

#[cfg(target_os = "macos")]
fn show(
    _app: &AppHandle,
    title: &str,
    body: &str,
    _item_id: &str,
    _action_label: &str,
) -> Result<(), String> {
    use notify_rust::Notification;

    let mut notification = Notification::new();
    notification.summary(title).body(body);
    notification
        .show()
        .map(|_| ())
        .map_err(|error| format!("notifications.show_failed: {error}"))
}

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
fn show(
    _app: &AppHandle,
    _title: &str,
    _body: &str,
    _item_id: &str,
    _action_label: &str,
) -> Result<(), String> {
    Ok(())
}

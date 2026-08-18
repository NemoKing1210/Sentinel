use serde_json::Value;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use tauri::Manager;

use crate::logging::{self, LogLevel};

const STATE_FILE: &str = "state.json";
const STATE_VERSION: u32 = 1;

fn state_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(state_dir(app)?.join(STATE_FILE))
}

fn backup_state_file(path: &Path) {
    let backup = path.with_extension("json.bak");
    match fs::copy(path, &backup) {
        Ok(_) => logging::write(
            LogLevel::Warn,
            "persistence.backed_up",
            serde_json::json!({ "path": backup.to_string_lossy() }),
        ),
        Err(error) => logging::write(
            LogLevel::Warn,
            "persistence.backup_failed",
            serde_json::json!({ "error": error.to_string() }),
        ),
    }
}

fn replace_state_file(tmp: &Path, path: &Path) -> Result<(), String> {
    match fs::rename(tmp, path) {
        Ok(()) => Ok(()),
        Err(rename_error) => {
            fs::copy(tmp, path).map_err(|copy_error| {
                format!("persistence.replace_failed: rename {rename_error}; copy {copy_error}")
            })?;
            let _ = fs::remove_file(tmp);
            Ok(())
        }
    }
}

#[tauri::command]
pub fn load_persisted_state(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    let path = state_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|error| {
        fail_load(
            "persistence.read_failed",
            &path,
            format!("{error} (path: {})", path.to_string_lossy()),
        )
    })?;
    let mut value: Value = serde_json::from_str(&raw).map_err(|error| {
        backup_state_file(&path);
        fail_load(
            "persistence.parse_failed",
            &path,
            format!("{error} (path: {})", path.to_string_lossy()),
        )
    })?;
    let version = value.get("version").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    if version != STATE_VERSION {
        logging::write(
            LogLevel::Warn,
            "persistence.version_mismatch",
            serde_json::json!({
                "stored_version": version,
                "current_version": STATE_VERSION,
                "action": "load_anyway"
            }),
        );
    }
    if let Some(obj) = value.as_object_mut() {
        obj.remove("version");
    }
    Ok(Some(value))
}

fn fail_load(event: &str, path: &Path, message: String) -> String {
    logging::write(
        LogLevel::Error,
        event,
        serde_json::json!({ "error": message, "path": path.to_string_lossy() }),
    );
    message
}

#[tauri::command]
pub fn save_persisted_state(app: tauri::AppHandle, state: Value) -> Result<(), String> {
    let path = state_path(&app)?;
    let mut payload = match state {
        Value::Object(map) => map,
        other => {
            return Err(format!(
                "persistence.invalid_payload: expected object, got {}",
                other
            ))
        }
    };
    payload.insert("version".into(), Value::from(STATE_VERSION));
    let serialized = serde_json::to_vec_pretty(&Value::Object(payload))
        .map_err(|e| format!("persistence.serialize_failed: {e}"))?;

    let tmp = path.with_extension("json.tmp");
    {
        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&tmp)
            .map_err(|e| format!("persistence.open_tmp_failed: {e}"))?;
        file.write_all(&serialized)
            .map_err(|e| format!("persistence.write_failed: {e}"))?;
        file.sync_all()
            .map_err(|e| format!("persistence.sync_failed: {e}"))?;
    }
    replace_state_file(&tmp, &path)?;
    logging::write(
        LogLevel::Info,
        "persistence.saved",
        serde_json::json!({ "path": path.to_string_lossy(), "bytes": serialized.len() }),
    );
    Ok(())
}

#[tauri::command]
pub fn clear_persisted_state(app: tauri::AppHandle) -> Result<(), String> {
    let path = state_path(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("persistence.delete_failed: {e}"))?;
        logging::write(
            LogLevel::Info,
            "persistence.cleared",
            serde_json::json!({ "path": path.to_string_lossy() }),
        );
    }
    Ok(())
}

pub fn read_setting_bool(app: &tauri::AppHandle, key: &str) -> Option<bool> {
    let path = state_path(app).ok()?;
    let raw = fs::read_to_string(&path).ok()?;
    let value: Value = serde_json::from_str(&raw).ok()?;
    value
        .get("settings")
        .and_then(|settings| settings.get(key))
        .and_then(|v| v.as_bool())
}

pub fn read_close_to_tray_setting(app: &tauri::AppHandle) -> Option<bool> {
    read_setting_bool(app, "closeToTray")
}

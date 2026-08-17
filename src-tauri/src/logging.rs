use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::{Mutex, OnceLock},
};
use tauri::{AppHandle, Manager, Runtime};

const CONFIG_FILE: &str = "logging.json";
const LOG_FILE_PREFIX: &str = "sentinel-";
const MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;
const RETENTION_DAYS: i64 = 30;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Off,
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

impl Default for LogLevel {
    fn default() -> Self {
        Self::Info
    }
}

impl LogLevel {
    pub fn allows(self, event: LogLevel) -> bool {
        self != Self::Off && event <= self
    }
}

struct Logger {
    directory: PathBuf,
    level: LogLevel,
}
static LOGGER: OnceLock<Mutex<Logger>> = OnceLock::new();

pub fn init(app: &AppHandle) -> Result<(), String> {
    let directory = app.path().app_log_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let level = fs::read_to_string(config_dir.join(CONFIG_FILE))
        .ok()
        .and_then(|raw| serde_json::from_str::<LogConfig>(&raw).ok())
        .map(|config| config.level)
        .unwrap_or_default();
    let _ = LOGGER.set(Mutex::new(Logger { directory, level }));
    write(LogLevel::Info, "app.started", json!({ "log_level": level }));
    Ok(())
}

#[derive(Deserialize, Serialize)]
struct LogConfig {
    level: LogLevel,
}

pub fn level() -> LogLevel {
    LOGGER
        .get()
        .and_then(|logger| logger.lock().ok().map(|x| x.level))
        .unwrap_or_default()
}

pub fn set_level<R: Runtime>(app: &AppHandle<R>, level: LogLevel) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    fs::write(
        config_dir.join(CONFIG_FILE),
        serde_json::to_vec_pretty(&LogConfig { level }).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    if let Some(logger) = LOGGER.get() {
        logger
            .lock()
            .map_err(|_| "Logger lock poisoned".to_string())?
            .level = level;
    }
    write(
        LogLevel::Info,
        "logging.level_changed",
        json!({ "level": level }),
    );
    Ok(())
}

pub fn directory<R: Runtime>(app: &AppHandle<R>) -> Result<String, String> {
    Ok(app
        .path()
        .app_log_dir()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned())
}

pub fn write(level: LogLevel, event: &str, fields: serde_json::Value) {
    let record = json!({
        "timestamp": Local::now().to_rfc3339(),
        "level": format!("{level:?}").to_lowercase(),
        "event": event,
        "pid": std::process::id(),
        "fields": fields
    });
    let line = record.to_string();
    let Some(state) = LOGGER.get() else {
        eprintln!("[sentinel] {line}");
        return;
    };
    let Ok(logger) = state.lock() else {
        eprintln!("[sentinel] {line}");
        return;
    };
    if !logger.level.allows(level) {
        return;
    }
    let date = Local::now().format("%Y-%m-%d").to_string();
    let path = logger
        .directory
        .join(format!("{LOG_FILE_PREFIX}{date}.log"));
    if let Ok(metadata) = fs::metadata(&path) {
        if metadata.len() >= MAX_FILE_BYTES {
            let rotated = logger.directory.join(format!(
                "{LOG_FILE_PREFIX}{date}-{}.log",
                Local::now().format("%H%M%S")
            ));
            let _ = fs::rename(&path, rotated);
        }
    }
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "{line}");
    }
    prune(&logger.directory);
}

fn prune(directory: &PathBuf) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with(LOG_FILE_PREFIX) || !name.ends_with(".log") {
            continue;
        }
        if let Ok(metadata) = entry.metadata() {
            if let Ok(modified) = metadata.modified() {
                if let Ok(age) = modified.elapsed() {
                    if age.as_secs() > (RETENTION_DAYS as u64 * 86_400) {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
        }
    }
}

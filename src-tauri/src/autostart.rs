//! Start-with-Windows through the per-user `Run` registry key (no admin rights, no extra plugin).

use std::path::Path;

pub const VALUE_NAME: &str = "Sentinel";

#[cfg(target_os = "windows")]
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

/// The command written to the registry: the executable path, quoted so a path
/// containing spaces stays one argument.
pub fn run_command(exe: &Path) -> String {
    format!("\"{}\"", exe.display())
}

/// Enabling is blocked in debug builds and when `SENTINEL_NO_AUTOSTART` is set;
/// disabling is always allowed so a stale entry can be cleaned up.
fn registration_allowed(enabled: bool) -> bool {
    !enabled || (!cfg!(debug_assertions) && std::env::var_os("SENTINEL_NO_AUTOSTART").is_none())
}

/// True when any value with our name exists. It may point at an old path.
#[cfg(target_os = "windows")]
pub fn is_enabled() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(RUN_KEY)
        .and_then(|key| key.get_value::<String, _>(VALUE_NAME))
        .is_ok()
}

#[cfg(not(target_os = "windows"))]
pub fn is_enabled() -> bool {
    false
}

/// True when the registered command points at the running executable. A stale
/// path (moved, reinstalled, or registered by a dev build) counts as out of sync.
#[cfg(target_os = "windows")]
pub fn is_current() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let registered = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(RUN_KEY)
        .and_then(|key| key.get_value::<String, _>(VALUE_NAME))
        .ok();
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    registered.as_deref() == Some(run_command(&exe).as_str())
}

#[cfg(not(target_os = "windows"))]
pub fn is_current() -> bool {
    false
}

#[cfg(target_os = "windows")]
pub fn set(enabled: bool) -> Result<(), String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let key = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey(RUN_KEY)
        .map_err(|error| format!("autostart.open_key_failed: {error}"))?
        .0;
    if enabled {
        let exe = std::env::current_exe()
            .map_err(|error| format!("autostart.current_exe_failed: {error}"))?;
        key.set_value(VALUE_NAME, &run_command(&exe))
            .map_err(|error| format!("autostart.write_failed: {error}"))
    } else {
        match key.delete_value(VALUE_NAME) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("autostart.delete_failed: {error}")),
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn set(_enabled: bool) -> Result<(), String> {
    Err("autostart.unsupported_platform".to_string())
}

#[tauri::command]
pub fn get_autostart() -> bool {
    // Report a usable entry, not just any leftover value with our name.
    is_current()
}

#[tauri::command]
pub fn set_autostart(enabled: bool) -> Result<(), String> {
    if !registration_allowed(enabled) {
        return Err("autostart.disabled_in_debug".to_string());
    }
    set(enabled)
}

/// Keep the registry in line with the persisted setting. A stale path is
/// repaired, not just a missing value. Debug builds never register themselves,
/// and `SENTINEL_NO_AUTOSTART` lets release test runs leave the registry alone.
#[cfg(target_os = "windows")]
pub fn sync_from_settings(_app: &tauri::AppHandle, want: bool) {
    use crate::logging::{self, LogLevel};

    if !registration_allowed(want) {
        return;
    }
    let in_sync = if want { is_current() } else { !is_enabled() };
    if in_sync {
        return;
    }
    match set(want) {
        Ok(()) => logging::write(
            LogLevel::Info,
            "autostart.synced",
            serde_json::json!({ "enabled": want }),
        ),
        Err(error) => logging::write(
            LogLevel::Warn,
            "autostart.sync_failed",
            serde_json::json!({ "enabled": want, "error": error }),
        ),
    }
}

#[cfg(not(target_os = "windows"))]
pub fn sync_from_settings(_app: &tauri::AppHandle, _want: bool) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_the_executable_path() {
        assert_eq!(
            run_command(Path::new(r"C:\Program Files\Sentinel\sentinel.exe")),
            r#""C:\Program Files\Sentinel\sentinel.exe""#
        );
    }

    #[test]
    fn registry_value_is_named_sentinel() {
        assert_eq!(VALUE_NAME, "Sentinel");
    }

    #[cfg(debug_assertions)]
    #[test]
    fn debug_builds_cannot_enable_autostart() {
        assert!(!registration_allowed(true));
        assert!(registration_allowed(false));
    }
}

use std::{path::Path, sync::Mutex};

use crate::logging::{self, LogLevel};

const SCAN_FLAG: &str = "--scan";

static PENDING_PATHS: Mutex<Option<Vec<String>>> = Mutex::new(None);

pub fn collect_scan_args(args: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut capture = false;
    let mut paths = Vec::new();
    for arg in args {
        if arg == SCAN_FLAG {
            capture = true;
            continue;
        }
        if capture {
            paths.push(arg);
        }
    }
    paths
}

pub fn stash_launch_paths(args: Vec<String>) {
    let paths = collect_scan_args(args);
    if paths.is_empty() {
        return;
    }
    let count = paths.len();
    if let Ok(mut guard) = PENDING_PATHS.lock() {
        *guard = Some(paths);
    }
    logging::write(
        LogLevel::Info,
        "shell.launch_paths_stashed",
        serde_json::json!({ "count": count }),
    );
}

#[tauri::command]
pub fn platform_name() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
pub fn get_pending_scan_paths() -> Vec<String> {
    let paths = PENDING_PATHS
        .lock()
        .ok()
        .and_then(|mut guard| guard.take())
        .unwrap_or_default();
    if paths.is_empty() {
        return Vec::new();
    }
    let existing: Vec<String> = paths
        .into_iter()
        .filter(|path| !path.trim().is_empty() && Path::new(path).exists())
        .collect();
    logging::write(
        LogLevel::Info,
        "shell.pending_paths_consumed",
        serde_json::json!({ "count": existing.len() }),
    );
    existing
}

#[cfg(target_os = "windows")]
mod windows {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
    use winreg::RegKey;

    const VERB: &str = "SentinelScan";
    const CLASSES: &str = r"Software\Classes";

    const ENTRIES: &[(&str, &str, &str)] = &[
        ("*", "Scan with Sentinel", "%1"),
        ("Directory", "Scan with Sentinel", "%1"),
        ("Directory\\Background", "Scan folder with Sentinel", "%V"),
    ];

    fn shell_key(class: &str) -> String {
        format!(r"{class}\shell\{VERB}")
    }

    fn legacy_shell_key(class: &str) -> String {
        format!(r"{CLASSES}\{class}\shell\{VERB}")
    }

    fn delete_legacy_key(classes: &RegKey, class: &str) -> Result<(), std::io::Error> {
        match classes.delete_subkey_all(legacy_shell_key(class)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error),
        }
    }

    pub fn register() -> Result<(), String> {
        let exe = std::env::current_exe()
            .map_err(|error| format!("shell.current_exe_failed: {error}"))?;
        let exe_path = exe.to_string_lossy().to_string();
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let classes = hkcu
            .open_subkey_with_flags(CLASSES, KEY_READ | KEY_WRITE)
            .map_err(|error| format!("shell.open_classes_failed: {error}"))?;
        for (class, label, argument) in ENTRIES {
            let (key, _) = classes
                .create_subkey(shell_key(class))
                .map_err(|error| format!("shell.create_key_failed ({class}): {error}"))?;
            key.set_value("", label)
                .map_err(|error| format!("shell.set_label_failed ({class}): {error}"))?;
            key.set_value("Icon", &format!("\"{exe_path}\",0"))
                .map_err(|error| format!("shell.set_icon_failed ({class}): {error}"))?;
            key.set_value("MultiSelectModel", &"Player")
                .map_err(|error| format!("shell.set_multiselect_failed ({class}): {error}"))?;
            let (command, _) = key
                .create_subkey("command")
                .map_err(|error| format!("shell.create_command_failed ({class}): {error}"))?;
            command
                .set_value("", &format!("\"{exe_path}\" --scan \"{argument}\""))
                .map_err(|error| format!("shell.set_command_failed ({class}): {error}"))?;
        }
        for (class, _, _) in ENTRIES {
            delete_legacy_key(&classes, class)
                .map_err(|error| format!("shell.delete_legacy_key_failed ({class}): {error}"))?;
        }
        Ok(())
    }

    pub fn unregister() -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let classes = hkcu
            .open_subkey_with_flags(CLASSES, KEY_READ | KEY_WRITE)
            .map_err(|error| format!("shell.open_classes_failed: {error}"))?;
        for (class, _, _) in ENTRIES {
            match classes.delete_subkey_all(shell_key(class)) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(format!("shell.delete_key_failed ({class}): {error}")),
            }
            delete_legacy_key(&classes, class)
                .map_err(|error| format!("shell.delete_legacy_key_failed ({class}): {error}"))?;
        }
        Ok(())
    }

    pub fn is_registered() -> Result<bool, String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let classes = hkcu
            .open_subkey_with_flags(CLASSES, KEY_READ)
            .map_err(|error| format!("shell.open_classes_failed: {error}"))?;
        Ok(classes.open_subkey(shell_key(ENTRIES[0].0)).is_ok())
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn shell_key_is_relative_to_classes() {
            assert_eq!(shell_key("*"), r"*\shell\SentinelScan");
            assert_eq!(shell_key("Directory"), r"Directory\shell\SentinelScan");
            assert_eq!(
                shell_key(r"Directory\Background"),
                r"Directory\Background\shell\SentinelScan"
            );
        }

        #[test]
        fn legacy_shell_key_keeps_full_classes_path() {
            assert_eq!(
                legacy_shell_key("*"),
                r"Software\Classes\*\shell\SentinelScan"
            );
        }
    }
}

#[tauri::command]
pub fn register_context_menu() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let result = windows::register();
        match &result {
            Ok(()) => logging::write(
                LogLevel::Info,
                "shell.registered",
                serde_json::json!({ "success": true }),
            ),
            Err(error) => logging::write(
                LogLevel::Warn,
                "shell.register_failed",
                serde_json::json!({ "error": error }),
            ),
        }
        result
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("shell.unsupported_platform".to_string())
    }
}

#[tauri::command]
pub fn unregister_context_menu() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let result = windows::unregister();
        match &result {
            Ok(()) => logging::write(
                LogLevel::Info,
                "shell.unregistered",
                serde_json::json!({ "success": true }),
            ),
            Err(error) => logging::write(
                LogLevel::Warn,
                "shell.unregister_failed",
                serde_json::json!({ "error": error }),
            ),
        }
        result
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("shell.unsupported_platform".to_string())
    }
}

#[tauri::command]
pub fn is_context_menu_registered() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        windows::is_registered()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_only_args_after_scan_flag() {
        let args = vec![
            "sentinel.exe".to_string(),
            "--scan".to_string(),
            r"C:\temp\file one.exe".to_string(),
            r"C:\temp\file two.txt".to_string(),
        ];
        assert_eq!(
            collect_scan_args(args),
            vec![r"C:\temp\file one.exe", r"C:\temp\file two.txt"]
        );
    }

    #[test]
    fn ignores_args_without_scan_flag() {
        let args = vec![
            "sentinel.exe".to_string(),
            "--systray".to_string(),
            r"C:\temp\file.exe".to_string(),
        ];
        assert!(collect_scan_args(args).is_empty());
    }

    #[test]
    fn pending_paths_are_consumed_once() {
        stash_launch_paths(vec![
            "sentinel.exe".to_string(),
            "--scan".to_string(),
            ".".to_string(),
        ]);
        assert_eq!(get_pending_scan_paths(), vec![".".to_string()]);
        assert!(get_pending_scan_paths().is_empty());
    }
}

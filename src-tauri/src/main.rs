// Hide the extra console window on Windows release builds (installer / `tauri build`).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sentinel_lib::run();
}

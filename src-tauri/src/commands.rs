use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{Read, Write},
    path::Path,
    time::UNIX_EPOCH,
};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use walkdir::WalkDir;
use zip::{write::SimpleFileOptions, ZipWriter};

use crate::logging::{self, LogLevel};

const SERVICE: &str = "sentinel-virustotal";
const BASE: &str = "https://www.virustotal.com/api/v3";
const MAX_FILE_BYTES: u64 = 650 * 1024 * 1024;
const SMALL_FILE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_RESPONSE_SNIPPET: usize = 500;

#[derive(Serialize)]
pub struct ApiResponse {
    pub analysis_id: String,
    pub sha256: String,
}

#[derive(Serialize)]
pub struct PathMetadata {
    pub size: u64,
    pub file_count: u64,
    pub modified_at: u64,
    pub is_dir: bool,
}

fn epoch_seconds(time: std::io::Result<std::time::SystemTime>) -> u64 {
    time.ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

#[tauri::command]
pub fn get_path_metadata(path: String) -> Result<PathMetadata, String> {
    let file_path = Path::new(&path);
    let metadata = match std::fs::metadata(file_path) {
        Ok(metadata) => metadata,
        Err(error) => {
            return Err(fail(
                "fs.metadata_failed",
                format!("{error} (path: {path})"),
            ))
        }
    };
    let is_dir = metadata.is_dir();
    let modified_at = epoch_seconds(metadata.modified());
    if is_dir {
        let mut file_count: u64 = 0;
        let mut byte_count: u64 = 0;
        for entry in WalkDir::new(file_path)
            .into_iter()
            .filter_map(|result| match result {
                Ok(entry) => Some(entry),
                Err(error) => {
                    logging::write(
                        LogLevel::Warn,
                        "fs.walk_skipped",
                        serde_json::json!({ "error": error.to_string() }),
                    );
                    None
                }
            })
        {
            if entry.path().is_file() {
                if let Ok(meta) = entry.path().metadata() {
                    byte_count += meta.len();
                    file_count += 1;
                }
            }
        }
        Ok(PathMetadata {
            size: byte_count,
            file_count,
            modified_at,
            is_dir: true,
        })
    } else {
        Ok(PathMetadata {
            size: metadata.len(),
            file_count: 1,
            modified_at,
            is_dir: false,
        })
    }
}

fn fail(event: &str, error: impl Into<String>) -> String {
    let message = error.into();
    logging::write(
        LogLevel::Error,
        event,
        serde_json::json!({ "error": message }),
    );
    message
}

fn api_key() -> Result<String, String> {
    keyring::Entry::new(SERVICE, "api-key")
        .map_err(|e| e.to_string())?
        .get_password()
        .map_err(|e| e.to_string())
}

fn response_snippet(body: &str) -> String {
    body.chars().take(MAX_RESPONSE_SNIPPET).collect()
}

#[tauri::command]
pub fn has_saved_api_key() -> bool {
    match api_key() {
        Ok(key) => {
            let present = !key.trim().is_empty();
            logging::write(
                LogLevel::Info,
                "credentials.key_present",
                serde_json::json!({ "present": present }),
            );
            present
        }
        Err(error) => {
            let missing = error.to_ascii_lowercase().contains("no entry")
                || error.to_ascii_lowercase().contains("not found");
            logging::write(
                if missing {
                    LogLevel::Info
                } else {
                    LogLevel::Warn
                },
                if missing {
                    "credentials.key_present"
                } else {
                    "credentials.key_lookup_failed"
                },
                serde_json::json!({ "present": false, "error": error }),
            );
            false
        }
    }
}

#[tauri::command]
pub fn get_api_key() -> Result<String, String> {
    match api_key() {
        Ok(key) => {
            logging::write(
                LogLevel::Info,
                "credentials.key_retrieved",
                serde_json::json!({ "success": true }),
            );
            Ok(key)
        }
        Err(error) => Err(fail("credentials.key_retrieve_failed", error)),
    }
}

#[tauri::command]
pub fn save_api_key(key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err(fail(
            "credentials.api_key_rejected",
            "API key cannot be empty",
        ));
    }
    match keyring::Entry::new(SERVICE, "api-key").and_then(|entry| entry.set_password(key)) {
        Ok(()) => {
            logging::write(
                LogLevel::Info,
                "credentials.api_key_saved",
                serde_json::json!({ "success": true }),
            );
            Ok(())
        }
        Err(error) => Err(fail("credentials.api_key_save_failed", error.to_string())),
    }
}

#[tauri::command]
pub fn get_log_level() -> LogLevel {
    logging::level()
}

#[tauri::command]
pub fn set_log_level(level: LogLevel, app: tauri::AppHandle) -> Result<(), String> {
    match logging::set_level(&app, level) {
        Ok(()) => Ok(()),
        Err(error) => Err(fail("logging.level_change_failed", error)),
    }
}

#[tauri::command]
pub fn get_log_directory(app: tauri::AppHandle) -> Result<String, String> {
    match logging::directory(&app) {
        Ok(path) => {
            logging::write(
                LogLevel::Info,
                "logging.directory_resolved",
                serde_json::json!({ "path": path }),
            );
            Ok(path)
        }
        Err(error) => Err(fail("logging.directory_failed", error)),
    }
}

#[tauri::command]
pub fn open_log_directory(app: tauri::AppHandle) -> Result<(), String> {
    let path = match app.path().app_log_dir() {
        Ok(path) => path,
        Err(error) => return Err(fail("logging.directory_failed", error.to_string())),
    };
    match app
        .opener()
        .open_path(path.to_string_lossy().as_ref(), None::<&str>)
    {
        Ok(()) => {
            logging::write(
                LogLevel::Info,
                "logging.directory_opened",
                serde_json::json!({ "path": path.to_string_lossy() }),
            );
            Ok(())
        }
        Err(error) => Err(fail("logging.directory_open_failed", error.to_string())),
    }
}

#[tauri::command]
pub fn log_event(
    level: LogLevel,
    event: String,
    fields: Option<serde_json::Value>,
) -> Result<(), String> {
    logging::write(
        level,
        &event,
        fields.unwrap_or_else(|| serde_json::json!({})),
    );
    Ok(())
}

#[tauri::command]
pub async fn validate_api_key() -> Result<bool, String> {
    let key = match api_key() {
        Ok(key) => key,
        Err(error) => return Err(fail("connection.key_missing", error)),
    };
    logging::write(
        LogLevel::Info,
        "connection.request_started",
        serde_json::json!({ "endpoint": "/domains/google.com" }),
    );
    let response = match reqwest::Client::new()
        .get(format!("{BASE}/domains/google.com"))
        .header("x-apikey", &key)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => return Err(fail("connection.request_failed", error.to_string())),
    };
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    match status.as_u16() {
        200 => {
            logging::write(
                LogLevel::Info,
                "connection.verified",
                serde_json::json!({ "status": status.as_u16() }),
            );
            Ok(true)
        }
        401 | 403 => {
            logging::write(
                LogLevel::Warn,
                "connection.invalid_key",
                serde_json::json!({ "status": status.as_u16(), "response": response_snippet(&body) }),
            );
            Ok(false)
        }
        other => {
            logging::write(
                LogLevel::Warn,
                "connection.rejected",
                serde_json::json!({ "status": other, "response": response_snippet(&body) }),
            );
            Ok(false)
        }
    }
}

#[tauri::command]
pub async fn submit_file(path: String) -> Result<ApiResponse, String> {
    let file_name = Path::new(&path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown")
        .to_string();
    logging::write(
        LogLevel::Info,
        "scan.file_started",
        serde_json::json!({ "file_name": file_name, "path": path }),
    );

    let key = match api_key() {
        Ok(key) => key,
        Err(error) => return Err(fail("scan.api_key_failed", error)),
    };
    let file_path = Path::new(&path);
    let metadata = match std::fs::metadata(file_path) {
        Ok(metadata) => metadata,
        Err(error) => {
            return Err(fail(
                "scan.metadata_failed",
                format!("{error} (path: {path})"),
            ))
        }
    };
    let size = metadata.len();
    if size > MAX_FILE_BYTES {
        return Err(fail(
            "scan.file_too_large",
            format!("File exceeds the 650 MB VirusTotal limit: {size} bytes"),
        ));
    }

    let mut file = match File::open(file_path) {
        Ok(file) => file,
        Err(error) => return Err(fail("scan.file_open_failed", error.to_string())),
    };
    let mut contents = Vec::new();
    if let Err(error) = file.read_to_end(&mut contents) {
        return Err(fail("scan.file_read_failed", error.to_string()));
    }
    let sha256 = format!("{:x}", Sha256::digest(&contents));
    logging::write(
        LogLevel::Info,
        "scan.file_hashed",
        serde_json::json!({ "file_name": file_name, "size": size, "sha256": sha256 }),
    );

    let client = reqwest::Client::new();
    let endpoint = if size <= SMALL_FILE_BYTES {
        format!("{BASE}/files")
    } else {
        logging::write(
            LogLevel::Info,
            "scan.upload_url_requested",
            serde_json::json!({ "file_name": file_name }),
        );
        let response = match client
            .get(format!("{BASE}/files/upload_url"))
            .header("x-apikey", &key)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => return Err(fail("scan.upload_url_failed", error.to_string())),
        };
        if !response.status().is_success() {
            return Err(fail(
                "scan.upload_url_rejected",
                format!("VirusTotal returned {}", response.status()),
            ));
        }
        let json: serde_json::Value = match response.json().await {
            Ok(json) => json,
            Err(error) => return Err(fail("scan.upload_url_parse_failed", error.to_string())),
        };
        match json["data"].as_str() {
            Some(url) => url.to_string(),
            None => return Err(fail("scan.upload_url_invalid", "Invalid upload URL")),
        }
    };

    let part = reqwest::multipart::Part::bytes(contents).file_name(
        file_path
            .file_name()
            .and_then(|x| x.to_str())
            .unwrap_or("upload")
            .to_string(),
    );
    let form = reqwest::multipart::Form::new().part("file", part);
    let response = match client
        .post(endpoint)
        .header("x-apikey", key)
        .multipart(form)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => return Err(fail("scan.upload_failed", error.to_string())),
    };
    if !response.status().is_success() {
        return Err(fail(
            "scan.upload_rejected",
            format!("VirusTotal returned {}", response.status()),
        ));
    }
    let json: serde_json::Value = match response.json().await {
        Ok(json) => json,
        Err(error) => return Err(fail("scan.response_parse_failed", error.to_string())),
    };
    let analysis_id = json["data"]["id"].as_str().unwrap_or_default().to_string();
    logging::write(
        LogLevel::Info,
        "scan.uploaded",
        serde_json::json!({ "file_name": file_name, "analysis_id": analysis_id, "sha256": sha256 }),
    );
    Ok(ApiResponse {
        analysis_id,
        sha256,
    })
}

#[tauri::command]
pub async fn submit_archive(paths: Vec<String>) -> Result<ApiResponse, String> {
    let source = match paths.first() {
        Some(source) => source.clone(),
        None => return Err(fail("scan.archive_no_folder", "No folder selected")),
    };
    logging::write(
        LogLevel::Info,
        "scan.folder_started",
        serde_json::json!({ "source": source }),
    );
    let root = Path::new(&source);
    if !root.is_dir() {
        return Err(fail(
            "scan.archive_not_folder",
            format!("Selected path is not a folder: {source}"),
        ));
    }

    let temp = match tempfile::NamedTempFile::new() {
        Ok(temp) => temp,
        Err(error) => return Err(fail("scan.archive_temp_failed", error.to_string())),
    };
    let output = match temp.reopen() {
        Ok(output) => output,
        Err(error) => return Err(fail("scan.archive_temp_failed", error.to_string())),
    };
    let mut archive = ZipWriter::new(output);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut file_count: usize = 0;
    let mut byte_count: u64 = 0;
    for entry in WalkDir::new(root)
        .into_iter()
        .filter_map(|result| match result {
            Ok(entry) => Some(entry),
            Err(error) => {
                logging::write(
                    LogLevel::Warn,
                    "scan.archive_walk_skipped",
                    serde_json::json!({ "error": error.to_string() }),
                );
                None
            }
        })
    {
        let entry_path = entry.path();
        if !entry_path.is_file() {
            continue;
        }
        let relative = match entry_path.strip_prefix(root) {
            Ok(relative) => relative,
            Err(error) => return Err(fail("scan.archive_walk_failed", error.to_string())),
        };
        if let Err(error) =
            archive.start_file(relative.to_string_lossy().replace('\\', "/"), options)
        {
            return Err(fail("scan.archive_write_failed", error.to_string()));
        }
        let mut input = match File::open(entry_path) {
            Ok(input) => input,
            Err(error) => {
                return Err(fail(
                    "scan.archive_read_failed",
                    format!("{error} (path: {})", entry_path.display()),
                ))
            }
        };
        let mut contents = Vec::new();
        if let Err(error) = input.read_to_end(&mut contents) {
            return Err(fail("scan.archive_read_failed", error.to_string()));
        }
        if let Err(error) = archive.write_all(&contents) {
            return Err(fail("scan.archive_write_failed", error.to_string()));
        }
        file_count += 1;
        byte_count += contents.len() as u64;
    }
    if let Err(error) = archive.finish() {
        return Err(fail("scan.archive_finish_failed", error.to_string()));
    }
    logging::write(
        LogLevel::Info,
        "scan.archive_created",
        serde_json::json!({ "source": source, "file_count": file_count, "bytes": byte_count }),
    );
    submit_file(temp.path().to_string_lossy().to_string()).await
}

#[tauri::command]
pub async fn get_analysis_status(analysis_id: String) -> Result<serde_json::Value, String> {
    let key = match api_key() {
        Ok(key) => key,
        Err(error) => return Err(fail("scan.poll_api_key_failed", error)),
    };
    let response = match reqwest::Client::new()
        .get(format!("{BASE}/analyses/{analysis_id}"))
        .header("x-apikey", key)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return Err(fail(
                "scan.poll_failed",
                format!("{error} (analysis_id: {analysis_id})"),
            ))
        }
    };
    if !response.status().is_success() {
        let status = response.status();
        return Err(fail(
            "scan.poll_rejected",
            format!("VirusTotal returned {status} (analysis_id: {analysis_id})"),
        ));
    }
    let json: serde_json::Value = match response.json().await {
        Ok(json) => json,
        Err(error) => return Err(fail("scan.poll_parse_failed", error.to_string())),
    };
    let status = json["data"]["attributes"]["status"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();
    logging::write(
        LogLevel::Debug,
        "scan.poll_result",
        serde_json::json!({ "analysis_id": analysis_id, "status": status }),
    );
    if status == "failed" {
        logging::write(
            LogLevel::Error,
            "scan.analysis_failed",
            serde_json::json!({ "analysis_id": analysis_id }),
        );
    }
    Ok(json)
}

#[tauri::command]
pub async fn open_external_url(url: String, app: tauri::AppHandle) -> Result<(), String> {
    logging::write(
        LogLevel::Info,
        "ui.external_url_open_requested",
        serde_json::json!({ "url": url }),
    );
    match app.opener().open_url(url, None::<&str>) {
        Ok(()) => Ok(()),
        Err(error) => Err(fail("ui.external_url_open_failed", error.to_string())),
    }
}

#[tauri::command]
pub fn file_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
pub fn open_folder_containing(
    path: String,
    #[allow(unused_variables)] app: tauri::AppHandle,
) -> Result<(), String> {
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(fail(
            "ui.file_not_found",
            format!("File does not exist: {path}"),
        ));
    }
    #[cfg(target_os = "windows")]
    {
        let result = std::process::Command::new("explorer.exe")
            .arg("/select,")
            .arg(file_path.as_os_str())
            .spawn();
        match result {
            Ok(_) => {
                logging::write(
                    LogLevel::Info,
                    "ui.folder_opened",
                    serde_json::json!({ "path": path }),
                );
                Ok(())
            }
            Err(error) => Err(fail("ui.open_folder_failed", error.to_string())),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let parent = file_path
            .parent()
            .ok_or_else(|| fail("ui.no_parent_directory", "No parent directory"))?;
        match app
            .opener()
            .open_path(parent.to_string_lossy().as_ref(), None::<&str>)
        {
            Ok(()) => {
                logging::write(
                    LogLevel::Info,
                    "ui.folder_opened",
                    serde_json::json!({ "path": parent.to_string_lossy() }),
                );
                Ok(())
            }
            Err(error) => Err(fail("ui.open_folder_failed", error.to_string())),
        }
    }
}

#[tauri::command]
pub fn get_file_icon(path: String) -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        extract_file_icon_windows(&path)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Ok(None)
    }
}

#[cfg(target_os = "windows")]
fn extract_file_icon_windows(path: &str) -> Result<Option<String>, String> {
    use base64::Engine;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::FILE_ATTRIBUTE_NORMAL;
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
    use windows::Win32::UI::WindowsAndMessaging::DestroyIcon;

    let wide_path: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();

    let mut info = SHFILEINFOW::default();
    let result = unsafe {
        SHGetFileInfoW(
            PCWSTR(wide_path.as_ptr()),
            FILE_ATTRIBUTE_NORMAL,
            Some(&mut info),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        )
    };

    if result == 0 || info.hIcon.is_invalid() {
        return Ok(None);
    }

    let icon = info.hIcon;
    let png_data = match hicon_to_png(icon) {
        Ok(data) => data,
        Err(_) => {
            unsafe {
                let _ = DestroyIcon(icon);
            }
            return Ok(None);
        }
    };
    unsafe {
        let _ = DestroyIcon(icon);
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_data);
    Ok(Some(format!("data:image/png;base64,{}", b64)))
}

#[cfg(target_os = "windows")]
fn free_icon_bitmaps(info: &windows::Win32::UI::WindowsAndMessaging::ICONINFO) {
    use windows::Win32::Graphics::Gdi::DeleteObject;
    unsafe {
        if !info.hbmColor.is_invalid() {
            let _ = DeleteObject(info.hbmColor.into());
        }
        if !info.hbmMask.is_invalid() {
            let _ = DeleteObject(info.hbmMask.into());
        }
    }
}

#[cfg(target_os = "windows")]
fn bitmap_size(handle: windows::Win32::Graphics::Gdi::HBITMAP) -> Result<(i32, i32), String> {
    use windows::Win32::Graphics::Gdi::{GetObjectW, BITMAP};
    let mut bitmap = BITMAP::default();
    let written = unsafe {
        GetObjectW(
            handle.into(),
            std::mem::size_of::<BITMAP>() as i32,
            Some((&mut bitmap as *mut BITMAP).cast()),
        )
    };
    if written == 0 || bitmap.bmWidth <= 0 || bitmap.bmHeight <= 0 {
        return Err("GetObjectW failed".to_string());
    }
    Ok((bitmap.bmWidth, bitmap.bmHeight.abs()))
}

#[cfg(target_os = "windows")]
fn hicon_to_png(icon: windows::Win32::UI::WindowsAndMessaging::HICON) -> Result<Vec<u8>, String> {
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, GetDIBits, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DIB_RGB_COLORS,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetIconInfo, ICONINFO};

    let mut icon_info = ICONINFO::default();
    unsafe {
        if GetIconInfo(icon, &mut icon_info).is_err() {
            return Err("GetIconInfo failed".to_string());
        }
    }

    if icon_info.hbmColor.is_invalid() {
        free_icon_bitmaps(&icon_info);
        return Err("Icon has no color bitmap".to_string());
    }

    let (width, height) = match bitmap_size(icon_info.hbmColor) {
        Ok(size) if size.0 <= 256 && size.1 <= 256 => size,
        Ok(_) => {
            free_icon_bitmaps(&icon_info);
            return Err("Invalid icon dimensions".to_string());
        }
        Err(error) => {
            free_icon_bitmaps(&icon_info);
            return Err(error);
        }
    };

    let hdc = unsafe { CreateCompatibleDC(None) };
    if hdc.is_invalid() {
        free_icon_bitmaps(&icon_info);
        return Err("CreateCompatibleDC failed".to_string());
    }

    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0 as u32,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: [Default::default()],
    };

    let mut pixels = vec![0u8; (width * height * 4) as usize];
    let result = unsafe {
        GetDIBits(
            hdc,
            icon_info.hbmColor,
            0,
            height as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        )
    };

    unsafe {
        let _ = DeleteDC(hdc);
    }
    free_icon_bitmaps(&icon_info);

    if result == 0 {
        return Err("GetDIBits failed".to_string());
    }

    let mut img = image::RgbaImage::new(width as u32, height as u32);
    for y in 0..height as u32 {
        for x in 0..width as u32 {
            let idx = ((y * width as u32 + x) * 4) as usize;
            let b = pixels[idx];
            let g = pixels[idx + 1];
            let r = pixels[idx + 2];
            let a = pixels[idx + 3];
            img.put_pixel(x, y, image::Rgba([r, g, b, a]));
        }
    }

    let mut png_data = Vec::new();
    image::DynamicImage::ImageRgba8(img)
        .write_to(
            &mut std::io::Cursor::new(&mut png_data),
            image::ImageFormat::Png,
        )
        .map_err(|e| e.to_string())?;

    Ok(png_data)
}

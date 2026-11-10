use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    path::Path,
    pin::Pin,
    sync::{Arc, Mutex, OnceLock},
    task::{Context, Poll},
    time::{Duration, UNIX_EPOCH},
};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncRead, ReadBuf};
use walkdir::WalkDir;
use zip::{write::SimpleFileOptions, ZipWriter};

use crate::logging::{self, LogLevel};

const SERVICE: &str = "sentinel-virustotal";
const BASE: &str = "https://www.virustotal.com/api/v3";
const MAX_FILE_BYTES: u64 = 650 * 1024 * 1024;
const SMALL_FILE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_RESPONSE_SNIPPET: usize = 500;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(45);
/// A 650 MB upload on a slow link needs far longer than a metadata call.
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const RETRY_AFTER_DEFAULT_SECS: u64 = 5;
const RETRY_AFTER_MAX_SECS: u64 = 60;

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

/// One pooled client for every request: keeps TLS sessions alive across polls.
fn http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .pool_idle_timeout(Duration::from_secs(90))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

/// Streams a file into the request body while hashing the exact bytes sent, so
/// the reported SHA-256 always matches what VirusTotal received.
struct HashingReader<R> {
    inner: R,
    hasher: Arc<Mutex<Sha256>>,
}

impl<R> HashingReader<R> {
    fn new(inner: R, hasher: Arc<Mutex<Sha256>>) -> Self {
        Self { inner, hasher }
    }
}

impl<R: AsyncRead + Unpin> AsyncRead for HashingReader<R> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        let before = buf.filled().len();
        let result = Pin::new(&mut self.inner).poll_read(cx, buf);
        if matches!(result, Poll::Ready(Ok(()))) {
            let filled = buf.filled();
            if filled.len() > before {
                let mut hasher = self
                    .hasher
                    .lock()
                    .unwrap_or_else(|error| error.into_inner());
                hasher.update(&filled[before..]);
            }
        }
        result
    }
}

/// Finalize a copy so a retry can keep the shared hasher handle.
fn hex_digest(hasher: &Mutex<Sha256>) -> String {
    let digest = hasher
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .clone()
        .finalize();
    format!("{digest:x}")
}

fn retry_after_seconds(value: Option<&str>) -> u64 {
    value
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map(|seconds| seconds.clamp(1, RETRY_AFTER_MAX_SECS))
        .unwrap_or(RETRY_AFTER_DEFAULT_SECS)
}

/// Only a rate limit is worth a second attempt; every other status is final.
fn retry_plan(status: reqwest::StatusCode, retry_after: Option<&str>) -> Option<Duration> {
    (status == reqwest::StatusCode::TOO_MANY_REQUESTS)
        .then(|| Duration::from_secs(retry_after_seconds(retry_after)))
}

/// Sends the request, and repeats it once after `Retry-After` when VirusTotal
/// answers 429. The closure builds a fresh request, so the retry is not tainted
/// by a consumed body.
async fn send_with_429_retry<F>(
    build: F,
    rate_limit_event: &str,
) -> Result<reqwest::Response, reqwest::Error>
where
    F: Fn() -> reqwest::RequestBuilder,
{
    let response = build().send().await?;
    let retry_after = response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok());
    let Some(delay) = retry_plan(response.status(), retry_after) else {
        return Ok(response);
    };
    logging::write(
        LogLevel::Warn,
        rate_limit_event,
        serde_json::json!({ "delay": delay.as_secs(), "retrying": true }),
    );
    tokio::time::sleep(delay).await;
    build().send().await
}

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
pub async fn get_path_metadata(path: String) -> Result<PathMetadata, String> {
    tauri::async_runtime::spawn_blocking(move || path_metadata(&path))
        .await
        .map_err(|error| format!("fs.metadata_task_failed: {error}"))?
}

fn path_metadata(path: &str) -> Result<PathMetadata, String> {
    let file_path = Path::new(path);
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
    let response = match send_with_429_retry(
        || {
            http_client()
                .get(format!("{BASE}/domains/google.com"))
                .header("x-apikey", &key)
                .timeout(REQUEST_TIMEOUT)
        },
        "connection.rate_limited",
    )
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

    let client = http_client();
    let endpoint = if size <= SMALL_FILE_BYTES {
        format!("{BASE}/files")
    } else {
        logging::write(
            LogLevel::Info,
            "scan.upload_url_requested",
            serde_json::json!({ "file_name": file_name }),
        );
        let response = match send_with_429_retry(
            || {
                client
                    .get(format!("{BASE}/files/upload_url"))
                    .header("x-apikey", &key)
                    .timeout(REQUEST_TIMEOUT)
            },
            "scan.upload_url_rate_limited",
        )
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

    let mut retried = false;
    let (response, hasher) = loop {
        let hasher = Arc::new(Mutex::new(Sha256::new()));
        let upload_file = match tokio::fs::File::open(file_path).await {
            Ok(file) => file,
            Err(error) => return Err(fail("scan.file_open_failed", error.to_string())),
        };
        let stream =
            tokio_util::io::ReaderStream::new(HashingReader::new(upload_file, Arc::clone(&hasher)));
        let part =
            reqwest::multipart::Part::stream_with_length(reqwest::Body::wrap_stream(stream), size)
                .file_name(file_name.clone());
        let form = reqwest::multipart::Form::new().part("file", part);
        let response = match client
            .post(&endpoint)
            .header("x-apikey", &key)
            .multipart(form)
            .timeout(UPLOAD_TIMEOUT)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => return Err(fail("scan.upload_failed", error.to_string())),
        };
        let retry_after = response
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|value| value.to_str().ok());
        match retry_plan(response.status(), retry_after) {
            Some(delay) if !retried => {
                retried = true;
                logging::write(
                    LogLevel::Warn,
                    "scan.upload_rate_limited",
                    serde_json::json!({
                        "file_name": file_name,
                        "delay": delay.as_secs(),
                        "retrying": true,
                    }),
                );
                tokio::time::sleep(delay).await;
            }
            Some(delay) => {
                return Err(fail(
                    "scan.upload_rate_limited",
                    format!("VirusTotal rate limit; retry in {} s", delay.as_secs()),
                ));
            }
            None => break (response, hasher),
        }
    };
    if !response.status().is_success() {
        return Err(fail(
            "scan.upload_rejected",
            format!("VirusTotal returned {}", response.status()),
        ));
    }
    let sha256 = hex_digest(&hasher);
    logging::write(
        LogLevel::Info,
        "scan.file_hashed",
        serde_json::json!({ "file_name": file_name, "size": size, "sha256": sha256 }),
    );
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
        match std::io::copy(&mut input, &mut archive) {
            Ok(bytes) => byte_count += bytes,
            Err(error) => return Err(fail("scan.archive_write_failed", error.to_string())),
        }
        file_count += 1;
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
    let client = http_client();
    let url = format!("{BASE}/analyses/{analysis_id}");
    let mut response = match client
        .get(&url)
        .header("x-apikey", &key)
        .timeout(REQUEST_TIMEOUT)
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
    let retry_after = response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok());
    if let Some(delay) = retry_plan(response.status(), retry_after) {
        logging::write(
            LogLevel::Warn,
            "scan.poll_rate_limited",
            serde_json::json!({
                "analysis_id": analysis_id,
                "delay": delay.as_secs(),
                "retrying": true,
            }),
        );
        tokio::time::sleep(delay).await;
        response = match client
            .get(&url)
            .header("x-apikey", &key)
            .timeout(REQUEST_TIMEOUT)
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
    }
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

fn is_allowed_external_url(raw: &str) -> bool {
    reqwest::Url::parse(raw)
        .map(|url| matches!(url.scheme(), "http" | "https"))
        .unwrap_or(false)
}

#[tauri::command]
pub async fn open_external_url(url: String, app: tauri::AppHandle) -> Result<(), String> {
    logging::write(
        LogLevel::Info,
        "ui.external_url_open_requested",
        serde_json::json!({ "url": url }),
    );
    if !is_allowed_external_url(&url) {
        return Err(fail(
            "ui.external_url_rejected",
            format!("unsupported URL: {url}"),
        ));
    }
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
            biCompression: BI_RGB.0,
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

#[derive(Serialize)]
pub struct WindowBackdrop {
    pub mica: bool,
    pub build: u32,
}

fn backdrop_for_build(build: u32) -> bool {
    build >= 22000
}

fn backdrop_for(build: u32, remote_session: bool) -> bool {
    !remote_session && backdrop_for_build(build)
}

#[cfg(target_os = "windows")]
fn is_remote_session() -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_REMOTESESSION};
    unsafe { GetSystemMetrics(SM_REMOTESESSION) != 0 }
}

#[cfg(not(target_os = "windows"))]
fn is_remote_session() -> bool {
    false
}

#[cfg(target_os = "windows")]
fn windows_build_number() -> u32 {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")
        .and_then(|key| key.get_value::<String, _>("CurrentBuildNumber"))
        .ok()
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(0)
}

#[cfg(not(target_os = "windows"))]
fn windows_build_number() -> u32 {
    0
}

#[tauri::command]
pub fn get_window_backdrop() -> WindowBackdrop {
    let build = windows_build_number();
    WindowBackdrop {
        mica: cfg!(target_os = "windows") && backdrop_for(build, is_remote_session()),
        build,
    }
}

#[cfg(test)]
mod window_backdrop_tests {
    use super::*;

    #[test]
    fn mica_requires_windows_11() {
        assert!(!backdrop_for_build(19045));
        assert!(!backdrop_for_build(21999));
        assert!(backdrop_for_build(22000));
        assert!(backdrop_for_build(22621));
    }

    #[test]
    fn remote_sessions_do_not_use_mica() {
        assert!(!backdrop_for(22621, true));
        assert!(backdrop_for(22621, false));
        assert!(!backdrop_for(19045, false));
    }
}

#[tauri::command]
pub fn get_system_accent() -> Result<String, String> {
    system_accent().ok_or_else(|| "system accent unavailable".to_string())
}

fn hex_from_rgb(r: u8, g: u8, b: u8) -> String {
    format!("#{r:02x}{g:02x}{b:02x}")
}

fn accent_from_registry_value(value: u32) -> String {
    hex_from_rgb(
        ((value >> 16) & 0xff) as u8,
        ((value >> 8) & 0xff) as u8,
        (value & 0xff) as u8,
    )
}

#[cfg(target_os = "windows")]
fn accent_from_ui_settings() -> Option<String> {
    use windows::UI::ViewManagement::{UIColorType, UISettings};

    let settings = UISettings::new().ok()?;
    let color = settings.GetColorValue(UIColorType::Accent).ok()?;
    Some(hex_from_rgb(color.R, color.G, color.B))
}

#[cfg(target_os = "windows")]
fn accent_from_registry() -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\DWM")
        .ok()?;
    let value: u32 = key.get_value("ColorizationColor").ok()?;
    Some(accent_from_registry_value(value))
}

#[cfg(target_os = "windows")]
fn system_accent() -> Option<String> {
    accent_from_ui_settings().or_else(accent_from_registry)
}

#[cfg(not(target_os = "windows"))]
fn system_accent() -> Option<String> {
    None
}

#[cfg(test)]
mod system_accent_tests {
    use super::*;

    #[test]
    fn reads_rgb_from_dwm_argb() {
        assert_eq!(accent_from_registry_value(0xC40078D4), "#0078d4");
        assert_eq!(accent_from_registry_value(0xFFC42B1C), "#c42b1c");
    }
}

#[cfg(test)]
mod upload_tests {
    use super::*;

    #[test]
    fn parses_retry_after_with_bounds() {
        assert_eq!(retry_after_seconds(Some("12")), 12);
        assert_eq!(retry_after_seconds(Some("0")), 1);
        assert_eq!(retry_after_seconds(Some("120")), 60);
        assert_eq!(retry_after_seconds(Some("soon")), 5);
        assert_eq!(retry_after_seconds(None), 5);
    }

    #[test]
    fn retry_plan_only_for_rate_limits() {
        assert_eq!(
            retry_plan(reqwest::StatusCode::TOO_MANY_REQUESTS, Some("7")),
            Some(Duration::from_secs(7))
        );
        assert_eq!(
            retry_plan(reqwest::StatusCode::TOO_MANY_REQUESTS, None),
            Some(Duration::from_secs(RETRY_AFTER_DEFAULT_SECS))
        );
        assert_eq!(retry_plan(reqwest::StatusCode::OK, Some("7")), None);
        assert_eq!(retry_plan(reqwest::StatusCode::BAD_REQUEST, None), None);
    }

    #[tokio::test]
    async fn hashing_reader_covers_exactly_the_bytes_streamed() {
        use std::sync::{Arc, Mutex};
        use tokio::io::AsyncReadExt;

        let hasher = Arc::new(Mutex::new(Sha256::new()));
        let mut reader = HashingReader::new(&b"hello"[..], Arc::clone(&hasher));
        let mut chunk = [0_u8; 2];
        let mut streamed = Vec::new();
        loop {
            let read = reader.read(&mut chunk).await.expect("read");
            if read == 0 {
                break;
            }
            streamed.extend_from_slice(&chunk[..read]);
        }
        assert_eq!(streamed, b"hello");
        assert_eq!(
            hex_digest(&hasher),
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[tokio::test]
    async fn retries_once_after_a_rate_limit() {
        use std::io::{BufRead, BufReader, Write};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("address");
        let server = std::thread::spawn(move || {
            for attempt in 0..2 {
                let (mut stream, _) = listener.accept().expect("accept");
                let mut reader = BufReader::new(stream.try_clone().expect("clone"));
                let mut line = String::new();
                loop {
                    line.clear();
                    let read = reader.read_line(&mut line).expect("read");
                    if read == 0 || line == "\r\n" {
                        break;
                    }
                }
                let response = if attempt == 0 {
                    "HTTP/1.1 429 Too Many Requests\r\nRetry-After: 1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                } else {
                    "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok"
                };
                stream.write_all(response.as_bytes()).expect("write");
            }
        });

        let url = format!("http://{address}/status");
        let response = send_with_429_retry(
            || http_client().get(&url).timeout(Duration::from_secs(5)),
            "test.rate_limited",
        )
        .await
        .expect("response");

        assert_eq!(response.status(), reqwest::StatusCode::OK);
        assert_eq!(response.text().await.expect("body"), "ok");
        server.join().expect("server");
    }
}

#[cfg(test)]
mod external_url_tests {
    use super::*;

    #[test]
    fn accepts_http_and_https_urls() {
        assert!(is_allowed_external_url(
            "https://www.virustotal.com/gui/file/abc"
        ));
        assert!(is_allowed_external_url("http://example.com"));
    }

    #[test]
    fn rejects_other_schemes_and_garbage() {
        assert!(!is_allowed_external_url("file:///C:/Windows/System32"));
        assert!(!is_allowed_external_url("javascript:alert(1)"));
        assert!(!is_allowed_external_url("not a url"));
    }
}

use serde::{Deserialize, Serialize};
use tauri::{
    webview::{NewWindowResponse, PageLoadEvent},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, WebviewUrl,
};

use crate::logging::{self, LogLevel};

const WEBVIEW_LABEL: &str = "internal-browser";
const MAIN_LABEL: &str = "main";
const PAGE_LOAD_EVENT: &str = "internal-browser:page-load";

/// Logical-pixel rectangle of the React placeholder that hosts the webview.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl BrowserBounds {
    fn position(self) -> LogicalPosition<f64> {
        LogicalPosition::new(self.x, self.y)
    }

    fn size(self) -> LogicalSize<f64> {
        LogicalSize::new(self.width.max(1.0), self.height.max(1.0))
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PageLoadInfo<'a> {
    url: &'a str,
    phase: &'a str,
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

/// Only VirusTotal report URLs may seed the embedded browser. Navigation that
/// happens inside it (links, redirects) is limited to http(s) by the handler.
fn parse_report_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|error| fail("browser.invalid_url", error.to_string()))?;
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    let trusted = host == "virustotal.com" || host.ends_with(".virustotal.com");
    if url.scheme() != "https" || !trusted {
        return Err(fail(
            "browser.untrusted_url",
            format!("refusing to open {raw}"),
        ));
    }
    Ok(url)
}

fn apply_bounds(webview: &tauri::Webview, bounds: BrowserBounds) {
    let _ = webview.set_position(bounds.position());
    let _ = webview.set_size(bounds.size());
}

#[tauri::command]
pub async fn open_internal_browser(
    app: AppHandle,
    url: String,
    bounds: BrowserBounds,
) -> Result<(), String> {
    let parsed = parse_report_url(&url)?;

    if let Some(webview) = app.get_webview(WEBVIEW_LABEL) {
        webview
            .navigate(parsed)
            .map_err(|error| fail("browser.navigate_failed", error.to_string()))?;
        apply_bounds(&webview, bounds);
        let _ = webview.show();
        logging::write(
            LogLevel::Info,
            "browser.opened",
            serde_json::json!({ "url": url, "reused": true }),
        );
        return Ok(());
    }

    let window = app
        .get_window(MAIN_LABEL)
        .ok_or_else(|| fail("browser.main_window_missing", "main window unavailable"))?;
    let events = app.clone();
    let navigator = app.clone();
    let builder = tauri::webview::WebviewBuilder::new(WEBVIEW_LABEL, WebviewUrl::External(parsed))
        .auto_resize()
        .on_navigation(|url| matches!(url.scheme(), "http" | "https"))
        .on_new_window(move |url, _features| {
            // Keep target="_blank" links inside the embedded view instead of
            // spawning an unmanaged window.
            if matches!(url.scheme(), "http" | "https") {
                if let Some(webview) = navigator.get_webview(WEBVIEW_LABEL) {
                    let _ = webview.navigate(url);
                }
            }
            NewWindowResponse::Deny
        })
        .on_page_load(move |_webview, payload| {
            let phase = match payload.event() {
                PageLoadEvent::Started => "started",
                PageLoadEvent::Finished => "finished",
            };
            let _ = events.emit(
                PAGE_LOAD_EVENT,
                PageLoadInfo {
                    url: payload.url().as_str(),
                    phase,
                },
            );
        });

    window
        .add_child(builder, bounds.position(), bounds.size())
        .map_err(|error| fail("browser.create_failed", error.to_string()))?;
    logging::write(
        LogLevel::Info,
        "browser.opened",
        serde_json::json!({ "url": url, "reused": false }),
    );
    Ok(())
}

#[tauri::command]
pub async fn set_internal_browser_bounds(
    app: AppHandle,
    bounds: BrowserBounds,
) -> Result<(), String> {
    let Some(webview) = app.get_webview(WEBVIEW_LABEL) else {
        return Ok(());
    };
    apply_bounds(&webview, bounds);
    Ok(())
}

#[tauri::command]
pub async fn internal_browser_action(action: String, app: AppHandle) -> Result<(), String> {
    let Some(webview) = app.get_webview(WEBVIEW_LABEL) else {
        return Err(fail("browser.missing", "internal browser is not open"));
    };
    let script = match action.as_str() {
        "back" => "history.back()",
        "forward" => "history.forward()",
        "reload" => "location.reload()",
        other => return Err(fail("browser.unknown_action", other.to_string())),
    };
    webview
        .eval(script)
        .map_err(|error| fail("browser.action_failed", error.to_string()))
}

#[tauri::command]
pub async fn close_internal_browser(app: AppHandle) -> Result<(), String> {
    let Some(webview) = app.get_webview(WEBVIEW_LABEL) else {
        return Ok(());
    };
    webview
        .close()
        .map_err(|error| fail("browser.close_failed", error.to_string()))?;
    logging::write(LogLevel::Info, "browser.closed", serde_json::json!({}));
    Ok(())
}

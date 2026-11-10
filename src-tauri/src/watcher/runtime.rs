use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs::Metadata;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

use super::rules::{file_allowed, file_depth, validate_rules, WatchRule};
use super::store::{scan_tree, IndexEntry, PendingFile, Spool, WatchIndex};
use crate::logging::{self, LogLevel};

const SETTLE_RECHECK_MS: u64 = 250;
const SETTLE_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchStatus {
    pub watch_id: String,
    pub state: String,
    pub error: Option<String>,
}

pub struct WatcherState {
    inner: Mutex<Inner>,
}

struct Inner {
    rules: Vec<WatchRule>,
    statuses: HashMap<String, WatchStatus>,
    watcher: Option<RecommendedWatcher>,
    watched: HashMap<String, PathBuf>,
    spool: Spool,
    index: WatchIndex,
    generation: u64,
}

impl WatcherState {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let spool = Spool::load(app_data_dir.join("watch-pending.json"));
        let index = WatchIndex::load(app_data_dir.join("watch-index.json"));
        Self {
            inner: Mutex::new(Inner {
                rules: Vec::new(),
                statuses: HashMap::new(),
                watcher: None,
                watched: HashMap::new(),
                spool,
                index,
                generation: 0,
            }),
        }
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|error| error.into_inner())
    }

    fn sync(&self, app: &AppHandle, incoming: Vec<WatchRule>) -> Result<Vec<WatchStatus>, String> {
        let rules = validate_rules(incoming)?;
        let mut inner = self.lock();
        inner.generation += 1;
        let generation = inner.generation;

        let next: HashMap<String, String> = rules
            .iter()
            .map(|rule| (rule.id.clone(), normalize_root(&rule.path)))
            .collect();
        let previous: HashMap<String, String> = inner
            .rules
            .iter()
            .map(|rule| (rule.id.clone(), normalize_root(&rule.path)))
            .collect();

        let mut pruned = 0usize;
        for id in previous.keys() {
            if !next.contains_key(id) {
                pruned += inner.spool.drop_rule(id);
                inner.index.remove(id);
                inner.statuses.remove(id);
            }
        }
        for (id, root) in next.iter() {
            let changed_root = previous.get(id).is_some_and(|old| old != root);
            if changed_root {
                pruned += inner.spool.drop_rule(id);
                inner.index.remove(id);
            }
        }
        let keep: HashSet<String> = next.keys().cloned().collect();
        pruned += inner.spool.retain(&keep);
        if pruned > 0 {
            logging::write(
                LogLevel::Info,
                "watch.spool_pruned",
                serde_json::json!({ "count": pruned }),
            );
        }

        if inner.watcher.is_none() {
            let callback_app = app.clone();
            let watcher = RecommendedWatcher::new(
                move |result: notify::Result<Event>| {
                    let Ok(event) = result else { return };
                    if !is_candidate_kind(&event.kind) {
                        return;
                    }
                    for path in event.paths {
                        let app = callback_app.clone();
                        thread::spawn(move || settle_and_record(app, path));
                    }
                },
                Config::default(),
            )
            .map_err(|error| format!("watch.watcher_init_failed: {error}"))?;
            inner.watcher = Some(watcher);
        }

        let desired: HashSet<String> = rules
            .iter()
            .filter(|rule| rule.enabled)
            .map(|rule| normalize_root(&rule.path))
            .collect();
        let stale: Vec<String> = inner
            .watched
            .keys()
            .filter(|root| !desired.contains(*root))
            .cloned()
            .collect();
        for root in stale {
            if let Some(path) = inner.watched.remove(&root) {
                if let Some(watcher) = inner.watcher.as_mut() {
                    let _ = watcher.unwatch(&path);
                }
            }
        }

        let mut watch_errors: HashMap<String, String> = HashMap::new();
        for rule in rules.iter().filter(|rule| rule.enabled) {
            let root = PathBuf::from(rule.path.trim());
            if !root.is_dir() {
                continue;
            }
            let key = normalize_root(&rule.path);
            if inner.watched.contains_key(&key) {
                continue;
            }
            let Some(watcher) = inner.watcher.as_mut() else {
                continue;
            };
            match watcher.watch(&root, RecursiveMode::Recursive) {
                Ok(()) => {
                    inner.watched.insert(key, root);
                }
                Err(error) => {
                    watch_errors.insert(rule.id.clone(), error.to_string());
                }
            }
        }

        let mut statuses: HashMap<String, WatchStatus> = HashMap::new();
        for rule in &rules {
            let (state, error) = if !rule.enabled {
                (initial_status(rule, true).to_string(), None)
            } else if !Path::new(&rule.path).is_dir() {
                ("missing".to_string(), Some("Folder not found".to_string()))
            } else if let Some(message) = watch_errors.get(&rule.id) {
                ("error".to_string(), Some(message.clone()))
            } else {
                (
                    initial_status(rule, inner.index.has_folder(&rule.id, &rule.path)).to_string(),
                    None,
                )
            };
            let status = WatchStatus {
                watch_id: rule.id.clone(),
                state,
                error,
            };
            let changed = inner
                .statuses
                .get(&rule.id)
                .map(|old| old.state != status.state || old.error != status.error)
                .unwrap_or(true);
            if changed {
                logging::write(
                    LogLevel::Info,
                    "watch.status_changed",
                    serde_json::json!({
                        "watchId": rule.id,
                        "state": status.state,
                        "error": status.error,
                    }),
                );
            }
            statuses.insert(rule.id.clone(), status);
        }

        inner.rules = rules.clone();
        inner.statuses = statuses;
        let _ = inner.spool.save();
        let _ = inner.index.save();
        let ordered = ordered_statuses(&inner);
        drop(inner);

        logging::write(
            LogLevel::Info,
            "watch.rules_synced",
            serde_json::json!({ "count": rules.len(), "generation": generation }),
        );
        let _ = app.emit("watch:status", &ordered);

        for rule in rules {
            if rule.enabled
                && Path::new(&rule.path).is_dir()
                && !ordered
                    .iter()
                    .any(|status| status.watch_id == rule.id && status.state == "error")
            {
                let app = app.clone();
                thread::spawn(move || initial_scan(app, generation, rule));
            }
        }

        Ok(ordered)
    }
}

pub fn initial_status(rule: &WatchRule, index_has_folder: bool) -> &'static str {
    if !rule.enabled {
        "disabled"
    } else if index_has_folder {
        "watching"
    } else {
        "indexing"
    }
}

pub fn is_candidate_kind(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_) | EventKind::Modify(notify::event::ModifyKind::Name(_))
    )
}

pub fn is_settled(first: (u64, i64), second: (u64, i64)) -> bool {
    first == second
}

fn normalize_root(path: &str) -> String {
    let replaced = path.trim().replace('/', "\\");
    let trimmed = replaced.trim_end_matches('\\');
    let trimmed = if trimmed.is_empty() {
        replaced.as_str()
    } else {
        trimmed
    };
    if cfg!(windows) {
        trimmed.to_lowercase()
    } else {
        trimmed.to_string()
    }
}

fn modified_seconds(meta: &Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

fn ordered_statuses(inner: &Inner) -> Vec<WatchStatus> {
    inner
        .rules
        .iter()
        .filter_map(|rule| inner.statuses.get(&rule.id).cloned())
        .collect()
}

fn match_rule<'a>(rules: &'a [WatchRule], path: &Path) -> Option<(&'a WatchRule, PathBuf)> {
    let mut best: Option<(&WatchRule, PathBuf)> = None;
    for rule in rules.iter().filter(|rule| rule.enabled) {
        let root = PathBuf::from(rule.path.trim());
        if file_depth(&root, path).is_none() {
            continue;
        }
        let longer = best
            .as_ref()
            .map(|(current, _)| rule.path.len() > current.path.len())
            .unwrap_or(true);
        if longer {
            best = Some((rule, root));
        }
    }
    best
}

fn enqueue_locked(
    inner: &mut Inner,
    rule: &WatchRule,
    path: &Path,
    meta: &Metadata,
) -> Option<PendingFile> {
    let pending = PendingFile {
        id: uuid::Uuid::new_v4().to_string(),
        watch_id: rule.id.clone(),
        path: path.to_string_lossy().to_string(),
        size: meta.len(),
        modified_at: modified_seconds(meta),
        detected_at: chrono::Utc::now().timestamp(),
    };
    if !inner.spool.add(pending.clone()) {
        return None;
    }
    inner.index.insert_file(
        &rule.id,
        pending.path.clone(),
        IndexEntry {
            size: pending.size,
            modified_at: pending.modified_at,
        },
    );
    logging::write(
        LogLevel::Info,
        "watch.spool_enqueued",
        serde_json::json!({ "watchId": rule.id, "path": pending.path }),
    );
    Some(pending)
}

fn settle_and_record(app: AppHandle, path: PathBuf) {
    let state = app.state::<WatcherState>();
    let (rule, root, generation) = {
        let inner = state.lock();
        match match_rule(&inner.rules, &path) {
            Some((rule, root)) => (rule.clone(), root, inner.generation),
            None => return,
        }
    };

    let Ok(meta) = std::fs::metadata(&path) else {
        return;
    };
    if !meta.is_file() {
        return;
    }
    let mut previous = (meta.len(), modified_seconds(&meta));
    let started = Instant::now();
    loop {
        thread::sleep(Duration::from_millis(rule.settle_ms));
        let Ok(next) = std::fs::metadata(&path) else {
            return;
        };
        let current = (next.len(), modified_seconds(&next));
        if is_settled(previous, current) {
            break;
        }
        previous = current;
        if started.elapsed() > SETTLE_TIMEOUT {
            logging::write(
                LogLevel::Warn,
                "watch.settle_discarded",
                serde_json::json!({ "path": path.to_string_lossy() }),
            );
            return;
        }
        thread::sleep(Duration::from_millis(SETTLE_RECHECK_MS));
    }

    let Ok(meta) = std::fs::metadata(&path) else {
        return;
    };
    if let Err(reason) = file_allowed(&rule, &root, &path, &meta) {
        logging::write(
            LogLevel::Debug,
            "watch.file_skipped",
            serde_json::json!({
                "path": path.to_string_lossy(),
                "reason": reason.as_str(),
            }),
        );
        return;
    }

    let mut inner = state.lock();
    if inner.generation != generation {
        return;
    }
    let Some(pending) = enqueue_locked(&mut inner, &rule, &path, &meta) else {
        return;
    };
    let _ = inner.spool.save();
    let _ = inner.index.save();
    drop(inner);

    logging::write(
        LogLevel::Info,
        "watch.detected",
        serde_json::json!({ "watchId": rule.id, "path": pending.path }),
    );
    let _ = app.emit("watch:file-detected", &pending);
}

fn initial_scan(app: AppHandle, generation: u64, rule: WatchRule) {
    let state = app.state::<WatcherState>();
    {
        let inner = state.lock();
        if inner.generation != generation {
            return;
        }
    }

    if !Path::new(&rule.path).is_dir() {
        set_status(
            &app,
            generation,
            &rule.id,
            "missing",
            Some("Folder not found".into()),
        );
        return;
    }

    let snapshot = scan_tree(&rule);
    let mut detected: Vec<PendingFile> = Vec::new();
    let mut index_error: Option<String> = None;
    {
        let mut inner = state.lock();
        if inner.generation != generation {
            return;
        }
        let has_folder = inner.index.has_folder(&rule.id, &rule.path);
        if !has_folder {
            let _ = inner
                .index
                .replace_folder(&rule.id, &rule.path, snapshot.files);
            logging::write(
                LogLevel::Info,
                "watch.index_written",
                serde_json::json!({ "watchId": rule.id, "baseline": true }),
            );
        } else if rule.scan_missed_while_closed {
            match inner
                .index
                .diff_and_replace(&rule.id, &rule.path, snapshot.files)
            {
                Ok(changed) => {
                    for path in changed {
                        let file_path = Path::new(&path);
                        let Ok(meta) = std::fs::metadata(file_path) else {
                            continue;
                        };
                        if file_allowed(&rule, Path::new(&rule.path), file_path, &meta).is_err() {
                            continue;
                        }
                        if let Some(pending) = enqueue_locked(&mut inner, &rule, file_path, &meta) {
                            detected.push(pending);
                        }
                    }
                    logging::write(
                        LogLevel::Info,
                        "watch.index_written",
                        serde_json::json!({ "watchId": rule.id, "baseline": false }),
                    );
                }
                Err(error) => {
                    logging::write(
                        LogLevel::Error,
                        "watch.index_limit",
                        serde_json::json!({ "watchId": rule.id, "error": error }),
                    );
                    index_error = Some(error);
                }
            }
        } else {
            let _ = inner
                .index
                .replace_folder(&rule.id, &rule.path, snapshot.files);
            logging::write(
                LogLevel::Info,
                "watch.index_written",
                serde_json::json!({ "watchId": rule.id, "baseline": false }),
            );
        }
        let _ = inner.index.save();
        let _ = inner.spool.save();
        if index_error.is_none() {
            let changed = inner
                .statuses
                .get(&rule.id)
                .map(|status| status.state != "watching" || status.error.is_some())
                .unwrap_or(true);
            inner.statuses.insert(
                rule.id.clone(),
                WatchStatus {
                    watch_id: rule.id.clone(),
                    state: "watching".to_string(),
                    error: None,
                },
            );
            if changed {
                logging::write(
                    LogLevel::Info,
                    "watch.status_changed",
                    serde_json::json!({ "watchId": rule.id, "state": "watching" }),
                );
            }
        }
    }

    if let Some(error) = index_error {
        set_status(&app, generation, &rule.id, "error", Some(error));
        return;
    }

    for pending in &detected {
        logging::write(
            LogLevel::Info,
            "watch.detected",
            serde_json::json!({ "watchId": rule.id, "path": pending.path }),
        );
        let _ = app.emit("watch:file-detected", pending);
    }
    emit_statuses(&app);
}

fn set_status(
    app: &AppHandle,
    generation: u64,
    watch_id: &str,
    state: &str,
    error: Option<String>,
) {
    let handle = app.state::<WatcherState>();
    let mut inner = handle.lock();
    if inner.generation != generation {
        return;
    }
    let changed = inner
        .statuses
        .get(watch_id)
        .map(|old| old.state != state || old.error != error)
        .unwrap_or(true);
    if !changed {
        return;
    }
    inner.statuses.insert(
        watch_id.to_string(),
        WatchStatus {
            watch_id: watch_id.to_string(),
            state: state.to_string(),
            error,
        },
    );
    let ordered = ordered_statuses(&inner);
    drop(inner);
    logging::write(
        LogLevel::Info,
        "watch.status_changed",
        serde_json::json!({ "watchId": watch_id, "state": state }),
    );
    let _ = app.emit("watch:status", &ordered);
}

fn emit_statuses(app: &AppHandle) {
    let handle = app.state::<WatcherState>();
    let ordered = {
        let inner = handle.lock();
        ordered_statuses(&inner)
    };
    let _ = app.emit("watch:status", &ordered);
}

#[tauri::command]
pub fn sync_watch_rules(
    app: AppHandle,
    state: State<'_, WatcherState>,
    rules: Vec<WatchRule>,
) -> Result<Vec<WatchStatus>, String> {
    state.sync(&app, rules)
}

#[tauri::command]
pub fn get_watch_statuses(state: State<'_, WatcherState>) -> Vec<WatchStatus> {
    let inner = state.lock();
    ordered_statuses(&inner)
}

#[tauri::command]
pub fn drain_watch_spool(state: State<'_, WatcherState>) -> Result<Vec<PendingFile>, String> {
    Ok(state.lock().spool.entries().to_vec())
}

#[tauri::command]
pub fn ack_watch_spool(state: State<'_, WatcherState>, ids: Vec<String>) -> Result<(), String> {
    let mut inner = state.lock();
    let removed = inner.spool.ack(&ids);
    if removed > 0 {
        inner.spool.save()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_create_and_rename_events() {
        use notify::event::{CreateKind, ModifyKind, RenameMode};
        use notify::EventKind;
        assert!(is_candidate_kind(&EventKind::Create(CreateKind::Any)));
        assert!(is_candidate_kind(&EventKind::Modify(ModifyKind::Name(
            RenameMode::Any
        ))));
        assert!(!is_candidate_kind(&EventKind::Modify(
            notify::event::ModifyKind::Data(notify::event::DataChange::Any)
        )));
    }

    #[test]
    fn settles_only_when_size_and_mtime_are_stable() {
        assert!(is_settled((10, 100), (10, 100)));
        assert!(!is_settled((10, 100), (11, 100)));
        assert!(!is_settled((10, 100), (10, 101)));
    }

    #[test]
    fn first_sync_indexes_and_disabled_rules_stay_disabled() {
        let rule = WatchRule {
            id: "w".into(),
            path: "C:\\Root".into(),
            enabled: true,
            ..Default::default()
        };
        assert_eq!(initial_status(&rule, false), "indexing");
        assert_eq!(initial_status(&rule, true), "watching");
        assert_eq!(
            initial_status(
                &WatchRule {
                    enabled: false,
                    ..rule
                },
                true
            ),
            "disabled"
        );
    }
}

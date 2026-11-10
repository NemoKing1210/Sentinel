use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::{self, Metadata};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

use super::rules::{file_allowed, WatchRule};
use crate::logging::{self, LogLevel};

pub const MAX_SPOOL_ENTRIES: usize = 5000;
pub const MAX_INDEX_ENTRIES: usize = 200_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PendingFile {
    pub id: String,
    pub watch_id: String,
    pub path: String,
    pub size: u64,
    pub modified_at: i64,
    pub detected_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct IndexEntry {
    pub size: u64,
    pub modified_at: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct IndexFolder {
    pub root: String,
    pub files: BTreeMap<String, IndexEntry>,
}

#[derive(Debug, Default)]
pub struct TreeSnapshot {
    pub files: BTreeMap<String, IndexEntry>,
    pub errors: usize,
}

/// Windows paths are case-insensitive; the index compares them in one canonical form.
fn normalize_key(path: &str) -> String {
    let replaced = path.replace('/', "\\");
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

fn detection_key(file: &PendingFile) -> (&str, String, u64, i64) {
    (
        file.watch_id.as_str(),
        normalize_key(&file.path),
        file.size,
        file.modified_at,
    )
}

#[derive(Debug)]
pub struct Spool {
    path: PathBuf,
    entries: Vec<PendingFile>,
}

impl Spool {
    pub fn load(path: PathBuf) -> Self {
        let entries = fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<Vec<PendingFile>>(&text).ok())
            .unwrap_or_default();
        Self { path, entries }
    }

    /// Adds a detection unless the same file/size/mtime is already queued. Returns false for a duplicate.
    pub fn add(&mut self, file: PendingFile) -> bool {
        let key = detection_key(&file);
        if self
            .entries
            .iter()
            .any(|existing| detection_key(existing) == key)
        {
            return false;
        }
        self.entries.push(file);
        if self.entries.len() > MAX_SPOOL_ENTRIES {
            let dropped = self.entries.remove(0);
            logging::write(
                LogLevel::Warn,
                "watch.spool_capped",
                serde_json::json!({ "id": dropped.id, "max": MAX_SPOOL_ENTRIES }),
            );
        }
        true
    }

    pub fn ack(&mut self, ids: &[String]) -> usize {
        let before = self.entries.len();
        self.entries.retain(|entry| !ids.contains(&entry.id));
        before - self.entries.len()
    }

    pub fn retain(&mut self, watch_ids: &HashSet<String>) -> usize {
        let before = self.entries.len();
        self.entries
            .retain(|entry| watch_ids.contains(&entry.watch_id));
        before - self.entries.len()
    }

    pub fn drop_rule(&mut self, watch_id: &str) -> usize {
        let before = self.entries.len();
        self.entries.retain(|entry| entry.watch_id != watch_id);
        before - self.entries.len()
    }

    pub fn entries(&self) -> &[PendingFile] {
        &self.entries
    }

    pub fn save(&self) -> Result<(), String> {
        atomic_write_json(&self.path, &self.entries)
    }
}

#[derive(Debug)]
pub struct WatchIndex {
    path: PathBuf,
    folders: HashMap<String, IndexFolder>,
}

impl WatchIndex {
    pub fn load(path: PathBuf) -> Self {
        let folders = fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<HashMap<String, IndexFolder>>(&text).ok())
            .unwrap_or_default();
        Self { path, folders }
    }

    /// True only when the folder has a baseline for exactly this root.
    pub fn has_folder(&self, watch_id: &str, root: &str) -> bool {
        self.folders
            .get(watch_id)
            .map(|folder| normalize_key(&folder.root) == normalize_key(root))
            .unwrap_or(false)
    }

    pub fn entry(&self, watch_id: &str, path: &str) -> Option<&IndexEntry> {
        self.folders.get(watch_id)?.files.get(&normalize_key(path))
    }

    pub fn replace_folder(
        &mut self,
        watch_id: &str,
        root: &str,
        files: BTreeMap<String, IndexEntry>,
    ) -> Result<(), String> {
        self.store_folder(watch_id, root, files)
    }

    /// Returns paths that are new or changed since the stored baseline, then replaces the baseline.
    /// A folder without a baseline for this root reports every current file.
    pub fn diff_and_replace(
        &mut self,
        watch_id: &str,
        root: &str,
        files: BTreeMap<String, IndexEntry>,
    ) -> Result<Vec<String>, String> {
        if files.len() > MAX_INDEX_ENTRIES {
            return Err(format!(
                "watch.index_limit: {} files exceed the {MAX_INDEX_ENTRIES} entry limit",
                files.len()
            ));
        }
        let changed: Vec<String> = if self.has_folder(watch_id, root) {
            let previous = &self.folders[watch_id].files;
            files
                .iter()
                .filter_map(|(raw, entry)| {
                    let key = normalize_key(raw);
                    match previous.get(&key) {
                        Some(old) if old == entry => None,
                        _ => Some(raw.clone()),
                    }
                })
                .collect()
        } else {
            files.keys().cloned().collect()
        };
        self.store_folder(watch_id, root, files)?;
        Ok(changed)
    }

    pub fn insert_file(&mut self, watch_id: &str, path: String, entry: IndexEntry) {
        self.folders
            .entry(watch_id.to_string())
            .or_default()
            .files
            .insert(normalize_key(&path), entry);
    }

    pub fn remove(&mut self, watch_id: &str) {
        self.folders.remove(watch_id);
    }

    pub fn save(&self) -> Result<(), String> {
        atomic_write_json(&self.path, &self.folders)
    }

    fn store_folder(
        &mut self,
        watch_id: &str,
        root: &str,
        files: BTreeMap<String, IndexEntry>,
    ) -> Result<(), String> {
        if files.len() > MAX_INDEX_ENTRIES {
            return Err(format!(
                "watch.index_limit: {} files exceed the {MAX_INDEX_ENTRIES} entry limit",
                files.len()
            ));
        }
        let normalized = files
            .into_iter()
            .map(|(path, entry)| (normalize_key(&path), entry))
            .collect();
        self.folders.insert(
            watch_id.to_string(),
            IndexFolder {
                root: normalize_key(root),
                files: normalized,
            },
        );
        Ok(())
    }
}

fn modified_seconds(meta: &Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

/// Walks the rule's current observation area and snapshots the files it admits.
pub fn scan_tree(rule: &WatchRule) -> TreeSnapshot {
    let root = Path::new(&rule.path);
    let mut snapshot = TreeSnapshot::default();
    let mut walker = WalkDir::new(root).follow_links(false);
    if let Some(max_depth) = rule.max_depth {
        walker = walker.max_depth(max_depth as usize);
    }
    for entry in walker {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => {
                snapshot.errors += 1;
                continue;
            }
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(meta) => meta,
            Err(_) => {
                snapshot.errors += 1;
                continue;
            }
        };
        let path = entry.path();
        if file_allowed(rule, root, path, &meta).is_err() {
            continue;
        }
        snapshot.files.insert(
            path.to_string_lossy().to_string(),
            IndexEntry {
                size: meta.len(),
                modified_at: modified_seconds(&meta),
            },
        );
    }
    snapshot
}

/// Writes JSON through a sibling temp file and rename so a crash never leaves a partial file.
pub fn atomic_write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let serialized = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("watch.serialize_failed: {error}"))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("watch.create_dir_failed: {error}"))?;
    }
    let tmp = path.with_extension("json.tmp");
    {
        let mut file = fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&tmp)
            .map_err(|error| format!("watch.open_tmp_failed: {error}"))?;
        file.write_all(&serialized)
            .map_err(|error| format!("watch.write_failed: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("watch.sync_failed: {error}"))?;
    }
    match fs::rename(&tmp, path) {
        Ok(()) => Ok(()),
        Err(rename_error) => {
            fs::copy(&tmp, path).map_err(|copy_error| {
                format!("watch.replace_failed: rename {rename_error}; copy {copy_error}")
            })?;
            let _ = fs::remove_file(&tmp);
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use std::fs;

    fn pending(id: &str) -> PendingFile {
        PendingFile {
            id: id.into(),
            watch_id: "w".into(),
            path: format!("C:\\{id}.txt"),
            size: 1,
            modified_at: 1,
            detected_at: 1,
        }
    }

    #[test]
    fn spool_deduplicates_and_acks() {
        let dir = tempfile::tempdir().unwrap();
        let mut spool = Spool::load(dir.path().join("pending.json"));
        let file = PendingFile {
            id: "1".into(),
            watch_id: "w".into(),
            path: "C:\\a.txt".into(),
            size: 1,
            modified_at: 1,
            detected_at: 1,
        };
        assert!(spool.add(file.clone()));
        assert!(!spool.add(file.clone()));
        assert_eq!(spool.ack(&["1".into()]), 1);
        assert!(spool.entries().is_empty());
    }

    #[test]
    fn spool_dedupes_on_the_canonical_detection_key() {
        let dir = tempfile::tempdir().unwrap();
        let mut spool = Spool::load(dir.path().join("pending.json"));
        let mut first = pending("a");
        first.path = "C:\\Root\\File.TXT".into();
        let mut same = pending("b");
        same.path = "c:/root/file.txt".into();
        assert!(spool.add(first));
        assert!(!spool.add(same));

        let mut changed = pending("c");
        changed.path = "C:\\Root\\File.TXT".into();
        changed.size = 2;
        assert!(spool.add(changed));
    }

    #[test]
    fn spool_is_capped() {
        let dir = tempfile::tempdir().unwrap();
        let mut spool = Spool::load(dir.path().join("pending.json"));
        for n in 0..=MAX_SPOOL_ENTRIES {
            spool.add(PendingFile {
                id: format!("id-{n}"),
                watch_id: "w".into(),
                path: format!("C:\\f{n}.txt"),
                size: 1,
                modified_at: n as i64,
                detected_at: n as i64,
            });
        }
        assert_eq!(spool.entries().len(), MAX_SPOOL_ENTRIES);
        assert!(!spool.entries().iter().any(|entry| entry.id == "id-0"));
    }

    #[test]
    fn spool_survives_a_reload() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("pending.json");
        let mut spool = Spool::load(path.clone());
        assert!(spool.add(pending("x")));
        spool.save().unwrap();
        let reloaded = Spool::load(path);
        assert_eq!(reloaded.entries().len(), 1);
        assert_eq!(reloaded.entries()[0].path, "C:\\x.txt");
    }

    #[test]
    fn spool_retains_and_drops_rules() {
        let dir = tempfile::tempdir().unwrap();
        let mut spool = Spool::load(dir.path().join("pending.json"));
        let mut other = pending("other");
        other.watch_id = "other".into();
        spool.add(pending("a"));
        spool.add(other);

        let keep: HashSet<String> = ["w".to_string()].into_iter().collect();
        assert_eq!(spool.retain(&keep), 1);
        assert_eq!(spool.entries().len(), 1);
        assert_eq!(spool.drop_rule("w"), 1);
        assert!(spool.entries().is_empty());
    }

    #[test]
    fn index_reports_only_new_files() {
        let dir = tempfile::tempdir().unwrap();
        let mut index = WatchIndex::load(dir.path().join("index.json"));
        index
            .replace_folder(
                "w",
                "C:\\Root",
                BTreeMap::from([(
                    "C:\\Root\\old.txt".into(),
                    IndexEntry {
                        size: 1,
                        modified_at: 1,
                    },
                )]),
            )
            .unwrap();
        let current = BTreeMap::from([
            (
                "C:\\Root\\old.txt".into(),
                IndexEntry {
                    size: 1,
                    modified_at: 1,
                },
            ),
            (
                "C:\\Root\\new.txt".into(),
                IndexEntry {
                    size: 2,
                    modified_at: 2,
                },
            ),
        ]);
        assert_eq!(
            index.diff_and_replace("w", "C:\\Root", current).unwrap(),
            vec!["C:\\Root\\new.txt"]
        );
        // A changed root is a new baseline, not a comparison against the old index.
        assert!(!index.has_folder("w", "C:\\Other"));
    }

    #[test]
    fn index_treats_a_changed_file_as_new() {
        let dir = tempfile::tempdir().unwrap();
        let mut index = WatchIndex::load(dir.path().join("index.json"));
        index
            .replace_folder(
                "w",
                "C:\\Root",
                BTreeMap::from([(
                    "C:\\Root\\a.txt".into(),
                    IndexEntry {
                        size: 1,
                        modified_at: 1,
                    },
                )]),
            )
            .unwrap();
        let current = BTreeMap::from([(
            "C:\\Root\\a.txt".into(),
            IndexEntry {
                size: 5,
                modified_at: 9,
            },
        )]);
        assert_eq!(
            index.diff_and_replace("w", "C:\\Root", current).unwrap(),
            vec!["C:\\Root\\a.txt"]
        );
    }

    #[test]
    fn index_normalizes_paths_and_holds_a_new_baseline() {
        let dir = tempfile::tempdir().unwrap();
        let mut index = WatchIndex::load(dir.path().join("index.json"));
        let files = BTreeMap::from([(
            "C:\\Root\\A.txt".into(),
            IndexEntry {
                size: 3,
                modified_at: 4,
            },
        )]);
        assert_eq!(
            index.diff_and_replace("w", "C:\\Root", files).unwrap(),
            vec!["C:\\Root\\A.txt"]
        );
        assert!(index.has_folder("w", "c:/root"));
        assert!(index.entry("w", "c:/root/a.TXT").is_some());

        index.remove("w");
        assert!(!index.has_folder("w", "C:\\Root"));
    }

    #[test]
    fn scan_tree_applies_rule_filters() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir_all(root.join("sub")).unwrap();
        fs::write(root.join("a.txt"), b"a").unwrap();
        fs::write(root.join("b.exe"), b"b").unwrap();
        fs::write(root.join("c.tmp"), b"c").unwrap();
        fs::write(root.join("sub").join("deep.txt"), b"d").unwrap();

        let rule = WatchRule {
            id: "w".into(),
            path: root.to_string_lossy().to_string(),
            include_extensions: vec!["txt".into()],
            max_depth: Some(1),
            ..Default::default()
        };
        let snapshot = scan_tree(&rule);
        assert_eq!(snapshot.errors, 0);
        let paths: Vec<String> = snapshot.files.keys().cloned().collect();
        assert_eq!(
            paths,
            vec![root.join("a.txt").to_string_lossy().to_string()]
        );
    }

    #[test]
    fn writes_json_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("index.json");
        atomic_write_json(&path, &BTreeMap::from([("a", 1)])).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(serde_json::from_str::<serde_json::Value>(&text).is_ok());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
}

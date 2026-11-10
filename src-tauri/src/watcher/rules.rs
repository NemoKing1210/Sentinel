use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::Metadata;
use std::path::{Component, Path};

pub const MAX_WATCH_FOLDERS: usize = 32;
pub const MAX_WATCH_DEPTH: u32 = 64;
pub const MIN_SETTLE_MS: u64 = 500;
pub const MAX_SETTLE_MS: u64 = 10_000;
pub const MAX_FILE_BYTES: u64 = 650 * 1024 * 1024;

const NOTIFY_MODES: [&str; 3] = ["all", "threats", "none"];
const TEMP_SUFFIXES: [&str; 8] = [
    ".tmp",
    ".temp",
    ".part",
    ".partial",
    ".crdownload",
    ".download",
    ".opdownload",
    ".swp",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WatchRule {
    pub id: String,
    pub path: String,
    pub enabled: bool,
    pub max_depth: Option<u32>,
    pub include_extensions: Vec<String>,
    pub exclude_extensions: Vec<String>,
    pub ignore_hidden: bool,
    pub ignore_temp: bool,
    pub min_size_bytes: u64,
    pub max_size_bytes: u64,
    pub settle_ms: u64,
    pub scan_missed_while_closed: bool,
    pub notify: String,
}

impl Default for WatchRule {
    fn default() -> Self {
        Self {
            id: String::new(),
            path: String::new(),
            enabled: true,
            max_depth: None,
            include_extensions: Vec::new(),
            exclude_extensions: Vec::new(),
            ignore_hidden: true,
            ignore_temp: true,
            min_size_bytes: 0,
            max_size_bytes: MAX_FILE_BYTES,
            settle_ms: 1500,
            scan_missed_while_closed: false,
            notify: "threats".to_string(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SkipReason {
    OutsideRoot,
    NotAFile,
    Symlink,
    TooDeep,
    Hidden,
    Temp,
    NotIncluded,
    Excluded,
    TooSmall,
    TooLarge,
}

impl SkipReason {
    pub fn as_str(self) -> &'static str {
        match self {
            SkipReason::OutsideRoot => "outside_root",
            SkipReason::NotAFile => "not_a_file",
            SkipReason::Symlink => "symlink",
            SkipReason::TooDeep => "too_deep",
            SkipReason::Hidden => "hidden",
            SkipReason::Temp => "temp",
            SkipReason::NotIncluded => "not_included",
            SkipReason::Excluded => "excluded",
            SkipReason::TooSmall => "too_small",
            SkipReason::TooLarge => "too_large",
        }
    }
}

/// Lowercase extension without the leading dot, or None when it is not a plain extension.
pub fn normalize_extension(raw: &str) -> Option<String> {
    let normalized = raw.trim().trim_start_matches('.').to_ascii_lowercase();
    let valid = !normalized.is_empty()
        && normalized
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '+' | '_' | '-'));
    valid.then_some(normalized)
}

fn normalize_extensions(values: &[String]) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    for value in values {
        if let Some(extension) = normalize_extension(value) {
            if !result.contains(&extension) {
                result.push(extension);
            }
        }
    }
    result
}

fn path_parts(path: &Path) -> Vec<String> {
    path.components()
        .filter_map(|component| match component {
            Component::Prefix(prefix) => Some(prefix.as_os_str().to_string_lossy().to_string()),
            Component::RootDir => Some("\\".to_string()),
            Component::CurDir => None,
            Component::ParentDir => Some("..".to_string()),
            Component::Normal(part) => Some(part.to_string_lossy().to_string()),
        })
        .map(|part| {
            if cfg!(windows) {
                part.to_lowercase()
            } else {
                part
            }
        })
        .collect()
}

fn is_prefix(prefix: &[String], path: &[String]) -> bool {
    path.len() >= prefix.len() && path[..prefix.len()] == *prefix
}

/// True when either path is the same as or nested inside the other. Case-insensitive on Windows.
pub fn paths_overlap(a: &str, b: &str) -> bool {
    let left = path_parts(Path::new(a));
    let right = path_parts(Path::new(b));
    let shared = left.len().min(right.len());
    shared > 0 && left[..shared] == right[..shared]
}

/// Depth of a file below the watch root; 1 means directly inside it.
pub fn file_depth(root: &Path, file: &Path) -> Option<u32> {
    let root_parts = path_parts(root);
    let file_parts = path_parts(file);
    if !is_prefix(&root_parts, &file_parts) || file_parts.len() <= root_parts.len() {
        return None;
    }
    Some((file_parts.len() - root_parts.len()) as u32)
}

pub fn is_temp_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.starts_with(".~")
        || lower.starts_with("~$")
        || TEMP_SUFFIXES.iter().any(|suffix| lower.ends_with(suffix))
}

#[cfg(windows)]
pub fn is_hidden(_path: &Path, meta: &Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
    meta.file_attributes() & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM) != 0
}

#[cfg(not(windows))]
pub fn is_hidden(path: &Path, _meta: &Metadata) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with('.'))
        .unwrap_or(false)
}

fn extension_of(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
}

pub fn file_allowed(
    rule: &WatchRule,
    root: &Path,
    path: &Path,
    meta: &Metadata,
) -> Result<(), SkipReason> {
    if !is_prefix(&path_parts(root), &path_parts(path)) {
        return Err(SkipReason::OutsideRoot);
    }
    let is_symlink = std::fs::symlink_metadata(path)
        .map(|entry| entry.file_type().is_symlink())
        .unwrap_or(false);
    if is_symlink {
        return Err(SkipReason::Symlink);
    }
    if !meta.is_file() {
        return Err(SkipReason::NotAFile);
    }
    if let Some(max_depth) = rule.max_depth {
        match file_depth(root, path) {
            Some(depth) if depth <= max_depth => {}
            _ => return Err(SkipReason::TooDeep),
        }
    }
    if rule.ignore_hidden && is_hidden(path, meta) {
        return Err(SkipReason::Hidden);
    }
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    if rule.ignore_temp && is_temp_name(name) {
        return Err(SkipReason::Temp);
    }
    let extension = extension_of(path);
    if !rule.include_extensions.is_empty()
        && !extension
            .as_ref()
            .map(|value| rule.include_extensions.contains(value))
            .unwrap_or(false)
    {
        return Err(SkipReason::NotIncluded);
    }
    if extension
        .as_ref()
        .map(|value| rule.exclude_extensions.contains(value))
        .unwrap_or(false)
    {
        return Err(SkipReason::Excluded);
    }
    if meta.len() < rule.min_size_bytes {
        return Err(SkipReason::TooSmall);
    }
    if meta.len() > rule.max_size_bytes {
        return Err(SkipReason::TooLarge);
    }
    Ok(())
}

/// Normalizes rules from the UI and rejects unusable or overlapping folders.
pub fn validate_rules(rules: Vec<WatchRule>) -> Result<Vec<WatchRule>, String> {
    if rules.len() > MAX_WATCH_FOLDERS {
        return Err(format!(
            "At most {MAX_WATCH_FOLDERS} watched folders are supported"
        ));
    }
    let mut ids: HashSet<String> = HashSet::new();
    let mut result: Vec<WatchRule> = Vec::with_capacity(rules.len());
    for mut rule in rules {
        rule.id = rule.id.trim().to_string();
        rule.path = rule.path.trim().to_string();
        if rule.id.is_empty() {
            return Err("Watched folder id cannot be empty".to_string());
        }
        if rule.path.is_empty() || !Path::new(&rule.path).is_absolute() {
            return Err(format!(
                "Watched folder path must be absolute: {}",
                rule.path
            ));
        }
        if !ids.insert(rule.id.clone()) {
            return Err(format!("Duplicate watched folder id: {}", rule.id));
        }
        if result
            .iter()
            .any(|existing| paths_overlap(&existing.path, &rule.path))
        {
            return Err(format!("Watched folders cannot overlap: {}", rule.path));
        }
        rule.include_extensions = normalize_extensions(&rule.include_extensions);
        rule.exclude_extensions = normalize_extensions(&rule.exclude_extensions);
        rule.max_depth = rule
            .max_depth
            .filter(|depth| (1..=MAX_WATCH_DEPTH).contains(depth));
        rule.settle_ms = rule.settle_ms.clamp(MIN_SETTLE_MS, MAX_SETTLE_MS);
        rule.max_size_bytes = rule.max_size_bytes.clamp(1, MAX_FILE_BYTES);
        rule.min_size_bytes = rule.min_size_bytes.min(rule.max_size_bytes);
        if !NOTIFY_MODES.contains(&rule.notify.as_str()) {
            rule.notify = "threats".to_string();
        }
        result.push(rule);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    #[test]
    fn normalizes_extensions() {
        assert_eq!(normalize_extension(".TXT"), Some("txt".into()));
        assert_eq!(normalize_extension(" mp4 "), Some("mp4".into()));
        assert_eq!(normalize_extension("bad/path"), None);
    }

    #[test]
    fn rejects_nested_roots_and_duplicates() {
        let base = WatchRule {
            id: "a".into(),
            path: "C:\\Root".into(),
            ..Default::default()
        };
        let nested = WatchRule {
            id: "b".into(),
            path: "C:\\Root\\Sub".into(),
            ..base.clone()
        };
        let parent = WatchRule {
            id: "c".into(),
            path: "C:\\Root".into(),
            ..base.clone()
        };
        assert!(validate_rules(vec![base.clone(), nested]).is_err());
        assert!(validate_rules(vec![base.clone(), parent]).is_err());
        assert!(paths_overlap("C:\\Root", "c:\\root\\sub"));
        assert!(!paths_overlap("C:\\Root", "C:\\Root2"));
    }

    #[test]
    fn normalizes_rule_fields_and_rejects_invalid_values() {
        let rule = WatchRule {
            id: " a ".into(),
            path: "C:\\Root".into(),
            include_extensions: vec![".TXT".into(), "bad/x".into()],
            max_depth: Some(0),
            settle_ms: 0,
            max_size_bytes: 0,
            notify: "nope".into(),
            ..Default::default()
        };
        let validated = validate_rules(vec![rule]).expect("defaults repair the rule");
        assert_eq!(validated[0].id, "a");
        assert_eq!(validated[0].include_extensions, vec!["txt".to_string()]);
        assert_eq!(validated[0].max_depth, None);
        assert_eq!(validated[0].settle_ms, MIN_SETTLE_MS);
        assert_eq!(validated[0].notify, "threats");

        let blank = WatchRule {
            id: "x".into(),
            path: "  ".into(),
            ..Default::default()
        };
        assert!(validate_rules(vec![blank]).is_err());

        let relative = WatchRule {
            id: "y".into(),
            path: "root".into(),
            ..Default::default()
        };
        assert!(validate_rules(vec![relative]).is_err());
    }

    #[test]
    fn computes_depth_and_matches_filters() {
        let root = std::path::Path::new("C:\\Root");
        assert_eq!(file_depth(root, &root.join("a.txt")), Some(1));
        assert_eq!(file_depth(root, &root.join("sub").join("a.txt")), Some(2));
        assert_eq!(file_depth(root, root), None);
        assert!(is_temp_name("a.tmp"));
        assert!(is_temp_name("~$doc.docx"));
        assert!(is_temp_name(".~lock"));
        assert!(!is_temp_name("report.pdf"));
    }

    fn allowed(rule: &WatchRule, root: &Path, path: &Path) -> Result<(), SkipReason> {
        let meta = fs::metadata(path).unwrap();
        file_allowed(rule, root, path, &meta)
    }

    #[test]
    fn file_allowed_applies_filters() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir_all(root.join("sub")).unwrap();
        let ok = root.join("a.txt");
        fs::write(&ok, b"hello").unwrap();
        let exe = root.join("a.exe");
        fs::write(&exe, b"hello").unwrap();
        let big = root.join("big.txt");
        fs::write(&big, vec![0u8; 2048]).unwrap();
        let deep = root.join("sub").join("deep.txt");
        fs::write(&deep, b"hello").unwrap();
        let temp = root.join("a.tmp");
        fs::write(&temp, b"hello").unwrap();

        let mut rule = WatchRule {
            id: "r".into(),
            path: root.to_string_lossy().to_string(),
            include_extensions: vec!["txt".into()],
            exclude_extensions: vec!["exe".into()],
            max_depth: Some(1),
            min_size_bytes: 1,
            max_size_bytes: 1024,
            ..Default::default()
        };

        assert_eq!(allowed(&rule, root, &ok), Ok(()));
        assert_eq!(allowed(&rule, root, &exe), Err(SkipReason::NotIncluded));
        assert_eq!(allowed(&rule, root, &big), Err(SkipReason::TooLarge));
        assert_eq!(allowed(&rule, root, &deep), Err(SkipReason::TooDeep));
        assert_eq!(allowed(&rule, root, &temp), Err(SkipReason::Temp));

        rule.include_extensions.clear();
        rule.exclude_extensions = vec!["txt".into()];
        assert_eq!(allowed(&rule, root, &ok), Err(SkipReason::Excluded));

        rule.exclude_extensions.clear();
        rule.min_size_bytes = 1024;
        assert_eq!(allowed(&rule, root, &ok), Err(SkipReason::TooSmall));

        rule.min_size_bytes = 0;
        let outside = root.parent().unwrap().join("escape.txt");
        let meta = fs::metadata(&ok).unwrap();
        assert_eq!(
            file_allowed(&rule, root, &outside, &meta),
            Err(SkipReason::OutsideRoot)
        );
    }

    #[test]
    fn temp_names_cover_common_partial_downloads() {
        for name in [
            "setup.exe.part",
            "movie.mp4.crdownload",
            "file.opdownload",
            "doc.docx.tmp",
            "x.swp",
        ] {
            assert!(is_temp_name(name), "{name} should be temp");
        }
        assert!(!is_temp_name("archive.zip"));
    }
}

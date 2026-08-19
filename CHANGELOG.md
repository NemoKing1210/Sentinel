# Changelog

All notable changes to Sentinel are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.5] - 2026-08-19

### Changed

- Scan cards on Overview and Queue now match History: file-type icon, engine summary, and the same compact row layout

## [0.3.4] - 2026-08-19

### Changed

- Default theme is System and follows the OS light or dark appearance

### Fixed

- Choosing System in Settings no longer stays dark when the OS is in light mode

## [0.3.3] - 2026-08-19

### Added

- First launch picks the interface language from the OS locale and falls back to English when that language is not available

## [0.3.2] - 2026-08-19

### Fixed

- Windows release builds no longer open an extra console window next to the app

## [0.3.1] - 2026-08-19

### Fixed

- Explorer context menu registration wrote verbs to a doubled `Software\Classes\Software\Classes\...` path, so "Scan with Sentinel" never appeared in Explorer; verbs now register under the correct keys and misplaced legacy keys are cleaned up automatically

## [0.3.0] - 2026-08-18

### Added

- Windows Explorer integration: "Scan with Sentinel" context menu entry for files, folders, and folder backgrounds
- Context menu scans land in the queue and start immediately, respecting the existing API-key gate
- Integration section in Settings with a toggle that registers or removes the Explorer entry (off by default, Windows only)
- Multi-selection support via the Explorer verb; second launches are routed through the single-instance handler
- Shell integration commands (`register_context_menu`, `unregister_context_menu`, `is_context_menu_registered`, `get_pending_scan_paths`)

## [0.2.0] - 2026-08-18

### Added

- Notification settings: master switch plus separate toggles for completed and failed scans
- Scan results appear as in-app toasts when Sentinel is focused and as OS notifications when it is minimized
- Clicking a completion notification (or its "Open report" button) focuses Sentinel and opens the report page
- Native `notify_scan_result` command with per-platform backends (Windows toast activation, Linux D-Bus actions, macOS display)

## [0.1.3] - 2026-08-18

### Changed

- App icon, window title mark, and README logo use the new geometric S mark

## [0.1.2] - 2026-08-18

### Added

- npm scripts to bump SemVer in every version file and to tag a GitHub release
- Release tag and GitHub Release notes are taken from the latest CHANGELOG.md section

## [0.1.1] - 2026-08-18

### Added

- GitHub Actions CI on pull requests: lint, format, TypeScript build, Rust clippy, and version sync
- Tagged releases build Windows, macOS, and Linux installers and attach them to a draft GitHub Release

### Fixed

- Clippy and React hook lint rules that would have failed the new CI gate

## [0.1.0] - 2026-08-18

Initial release of the VirusTotal desktop client.

### Added

- Dashboard: pick or drop files and folders for VirusTotal analysis
- Queue: upload, poll analysis status, and retry failed items
- History: local reports with engine results and a VirusTotal link
- Settings: theme, accent, language, poll interval, logs, close-to-tray
- OS keychain storage for the VirusTotal API key
- Native menu, system tray, and single-instance focus
- UI languages: English, Russian, Spanish, German, French, Portuguese, Chinese

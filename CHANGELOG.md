# Changelog

All notable changes to Sentinel are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.1] - 2026-11-10

### Changed

- Settings dropdowns now stretch to the card's right edge, matching the other row controls
- The selected tab keeps its regular weight instead of switching to semibold

## [0.7.0] - 2026-11-05

### Changed

- The dashboard drop area and the empty queue use a solid Fluent outline instead of a dashed one

### Added

- "Open VirusTotal report" can now open the report in a built-in browser instead of leaving Sentinel
- The built-in browser has back, forward, reload, an address bar, and an “Open in browser” action for the system default browser
- Settings → Reports chooses between the built-in browser and the default browser; the choice is persisted
- Engine results in a report are color-coded: clean engines are green, suspicious amber, malicious red, and engines that returned no verdict stay neutral

### Fixed

- The built-in browser no longer shows a bright white edge around the embedded page; the frame keeps a subtle Fluent stroke on the app backdrop

## [0.6.7] - 2026-11-05

### Changed

- The navigation pane's accent indicator now slides between items with the Fluent 167 ms motion, and the icon color eases into its selected state
- Queue, History, and engine tabs share a single sliding underline instead of each redrawing its own marker
- Tabs are rendered by a reusable `SegmentedTabs` component, so selection motion and markup stay consistent across screens

### Fixed

- The tab underline had zero width because the text-layer rule overrode its absolute positioning, so the selection looked like it jumped instead of sliding

## [0.6.6] - 2026-11-05

### Changed

- Opening a scan report is now a real subpage transition: the History list fades out and the report enters with the Fluent 167 ms / 8 px motion instead of switching instantly
- Navigation is URL-based (`#/dashboard`, `#/queue`, `#/history/:reportId`, `#/settings`), so reports can be opened from notifications and tray actions without hidden state
- History search and verdict filters live in the URL and are restored when you return from a report, including the list scroll position
- Removing the report you are viewing returns to the History list without a spurious “report missing” toast

### Removed

- `view` and `selectedReportId` navigation state from Zustand; route paths are the single source of truth

## [0.6.5] - 2026-11-05

### Changed

- The report back action moved from the title bar into the report's page header; the title bar now shows only the app identity and the window controls

## [0.6.4] - 2026-11-05

### Removed

- The navigation pane can no longer be collapsed: the title-bar toggle, compact rail, and overlay modes are gone, and the pane is always shown (320 px, narrowing on small windows)

## [0.6.3] - 2026-11-05

### Changed

- The “Scan files immediately” option moved from the dashboard drop zone to Settings → Scan, where it sits above the polling interval
- Window caption icons now use Segoe Fluent Icons at the native 10×10 px size and full-strength color

## [0.6.2] - 2026-11-05

### Changed

- Settings now matches the Windows 11 Settings app: every option is its own card with a leading Fluent icon, 8 px between cards, and 64 px rows
- Section headers sit directly above their cards and no longer carry a description paragraph
- The content column is centered at 1000 px, matching the native Settings page width
- Navigation icons use the native 16 px variant and the selected item is no longer bold
- Scrollbars are thinner and closer to the Windows overlay scrollbar

## [0.6.1] - 2026-11-05

### Fixed

- The window could be restored off-screen after a restart because minimized windows were saved at the Windows sentinel position (`-32000, -32000`); minimized geometry is no longer persisted
- Restored window positions are now checked against the connected monitors and the window is recentered when the saved position is unreachable (for example after disconnecting a display)

## [0.6.0] - 2026-11-05

### Changed

- Theme and accent color now always follow Windows; the accent picker and light/dark selector were removed from Settings
- The Appearance section keeps only the interface language choice and explains that Windows controls the rest
- Previously saved `theme` and `accent` values are ignored and stripped on the next save

### Removed

- Accent palette options (`vt`, teal, blue, violet, rose, amber) and the `themeChanged` / `accentChanged` toasts

## [0.5.1] - 2026-11-05

### Changed

- Removed the native File/View/Window/Help menu bar; the window now shows only the custom WinUI title bar
- Moved the menu shortcuts into the app: Ctrl+O (files), Ctrl+Shift+O (folder), Ctrl+1–4 (views), Ctrl+M (minimize), Ctrl+W (close)

## [0.5.0] - 2026-11-05

### Added

- Real Windows 11 Mica backdrop with an opaque fallback for Windows 10
- Windows system accent color, used by default, with a System swatch in Settings
- Native title bar states: restore icon when maximized, inactive-window dimming, tooltips, and a back button on reports
- NavigationView layout modes: 320 px expanded, 48 px compact rail, and an overlay pane on narrow windows
- Keyboard navigation in the navigation pane (arrows, Home, End)

### Changed

- Scan and history lists now render as one surface with divider-separated rows
- Settings uses section headers above cards, 64 px rows, and no language flags
- Statuses are plain colored text instead of filled pills
- Reports lead with the verdict and detection count
- Fluent System Icons use their 16/20/24 px variants
- Two-tone focus visuals, quieter row motion, selectable hashes, and a forced-colors theme

### Fixed

- The dashboard used a missing `clock` icon and silently fell back to the home icon
- Unknown file verdicts use the info icon instead of the success check

## [0.4.0] - 2026-11-05

### Changed

- Rebuilt the interface on WinUI / Fluent Design: Segoe UI Variable, 4 px controls, 8 px surfaces, Windows 11 type scale and density
- New window shell: a WinUI title bar with native-style caption buttons and a left NavigationView pane, with Settings pinned to the bottom and a compact icon-only mode on narrow windows
- Reworked every control to Fluent: accent/standard/subtle buttons, text fields with an accent focus underline, toggle switches, ComboBox, SelectorBar filters, ProgressBar and InfoBar
- Replaced Heroicons with the official Fluent System Icons set
- API-key banners now use WinUI InfoBar styling; toasts use a Fluent flyout with an Acrylic-style backdrop
- Added Fluent hover/pressed/focus states, rounded flyouts and neutral light/dark window backdrops; the Mica look is emulated so Windows 10 stays supported
- Restyled the overview, queue, history report and settings screens around WinUI cards and list rows
- The Tauri window API is now skipped outside the desktop shell, so `npm run dev` renders again in a browser

### Added

- `@fluentui/react-icons` dependency for native Windows 11 icons

## [0.3.10] - 2026-11-05

### Changed

- Unified the design system around semantic accent tokens, so navigation, controls, focus rings, scrollbars, selections, and surfaces follow the selected accent color
- Selected filters and window controls now use the accent color; semantic verdict colors remain unchanged
- File-type icon colors are now theme-aware and readable in both light and dark themes
- VirusTotal accent gets a proper accessible light-theme variant
- The native window background is tinted with the accent, matching the app background

### Fixed

- Window control labels are localized instead of hard-coded English
- Unknown verdicts no longer show a success checkmark
- Removed dead styles and duplicated overrides left over from earlier design passes

## [0.3.9] - 2026-11-05

### Changed

- Removed the dotted background pattern and accent glow gradient for a flat background

## [0.3.8] - 2026-08-19

### Added

- Scan cards can open the original file’s folder when the file is still on disk
- Scan cards and reports show the Windows file icon for the original path

### Changed

- Overview, Queue, and History scan cards now share the same actions: verdict, open folder, and remove

### Fixed

- File icons on scan cards use the real icon size instead of a cropped, oversized thumbnail

## [0.3.7] - 2026-08-19

### Changed

- Tray context menu now shows active scans with progress, recent results with verdicts and detection counts, and navigation items for Dashboard, Queue, History, and Settings
- Clicking a recent scan in the tray menu opens the report directly
- Tray menu labels are translated into the current interface language (all 7 languages)

## [0.3.6] - 2026-08-19

### Fixed

- Deleting a report or clearing History now shows a confirmation dialog instead of doing nothing

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

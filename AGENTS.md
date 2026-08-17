# Sentinel agent guide

This file is the project map for coding agents and contributors. Prefer it over assumptions from similar Tauri or React apps. Claude Code also loads [CLAUDE.md](CLAUDE.md) (concise session brief; this file is the full map).

## What Sentinel is

Sentinel is a **Tauri 2 desktop app** that submits files and folders to the **VirusTotal API v3**, polls analysis status, and shows a local scan history. It is not a local antivirus engine. Verdicts come from VirusTotal.

Typical user loop:

1. Save a VirusTotal API key in Settings (OS keychain).
2. Add files or a folder from the dashboard (picker or drag-and-drop).
3. `useScanRunner` uploads, polls, and writes a `FileReport`.
4. Queue shows live status; History keeps completed reports.

UI languages: English and Russian. Identifier: `dev.sentinel.scanner`. Version: `0.1.2`. Changelog: [CHANGELOG.md](CHANGELOG.md).

Maintainer: [NemoKing](https://github.com/NemoKing1210). Repository: [NemoKing1210/Sentinel](https://github.com/NemoKing1210/Sentinel).

## Stack (accurate)

| Piece    | Reality                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------- |
| Frontend | React 19 + TypeScript + Vite 6                                                                           |
| UI kit   | **Custom CSS**, not MUI. Primitives in `src/components/ui/`                                              |
| Icons    | `@heroicons/react` 24/outline, mapped in `src/components/ui/Icon.tsx`                                    |
| State    | Zustand (`src/core/state/store.ts`)                                                                      |
| i18n     | i18next + react-i18next, catalogs in `src/core/i18n/locales/` (`en`, `ru`, `es`, `de`, `fr`, `pt`, `zh`) |
| Native   | Rust 2021, Tauri 2, plugins: dialog, opener, single-instance, tray                                       |
| HTTP     | `reqwest` (rustls) to `https://www.virustotal.com/api/v3`                                                |
| Secrets  | `keyring` service `sentinel-virustotal`, account `api-key`                                               |

Path alias `@/*` → `src/*` (`tsconfig.json`, `vite.config.ts`). Vite dev server is port **1421** (`strictPort: true`).

`npm run dev` is UI-only. Native commands, keychain, tray, and persistence need `npm run tauri dev`. `src/core/native/api.ts` detects Tauri via `__TAURI_INTERNALS__` and returns empty/mock results in the browser.

## Repository map

```
src/
  main.tsx                 React mount, i18n + CSS
  App.tsx                  Composition root: bootstrap, navigation, toasts, DnD
  app/
    constants/             Views, defaults, accent palettes, poll presets
    hooks/                 useToast, useNativeTheme
    utils/                 format, verdict tones, fileKind / MIME
  components/
    ui/                    Button, Card, Field, Icon, StatusIcon, Switch, Select, …
    layout/                WindowChrome (frameless title bar + nav), Toast
  core/
    domain/types.ts        Shared domain types
    native/api.ts          Frontend ↔ native boundary
    native/menuBridge.ts   Native menu events → view / pickers
    state/store.ts         Zustand app state
    persistence/           Hydrate/save state.json; window bounds
    i18n/index.ts          i18next init, loads all locale files
    i18n/locales/          One file per language: en, ru, es, de, fr, pt, zh
    logging/               Frontend log helpers → native log_event
  features/
    dashboard/             DashboardPage
    queue/                 QueuePage, QueueRow, useScanRunner
    history/               HistoryPage, HistoryListPage, HistoryReportPage, HistoryRow, historyQuery
    settings/              SettingsPage
  styles/
    global.css             Visual primitives
    manual.css             Theme / layout
src-tauri/src/
  main.rs                  Thin entry: sentinel_lib::run()
  lib.rs                   Plugins, command table, tray close, setup
  commands.rs              Keychain, VT upload/poll, path metadata, URLs
  persistence.rs           state.json in app data dir (version 1)
  logging.rs               Daily JSON logs, rotation, level config
  chrome.rs                Native menu + tray
.github/
  workflows/ci.yml         PR quality gate (lint, format, build, clippy, versions)
  workflows/release.yml    Tag/manual installer builds → draft GitHub Release
  actions/setup            Shared Node/Rust/Linux setup
scripts/                   Version bump, changelog extract, release tag
```

Do not edit `dist/` or `src-tauri/target/` by hand.

## Import direction

```
features → core | app | components
app      → core (types, store) ; not features
components → core/app only as needed for types/helpers; not features
core     → does not import features
```

Feature modules must not import other features. When a screen outgrows one file, add siblings in the same `src/features/<feature>/` directory (kebab-case).

## Runtime architecture

### Composition root

`App.tsx` owns:

- Hydration (`hydratePersistedState`) and persistence subscription
- Window bounds restore/subscribe
- Native menu binding
- Drag-and-drop via `subscribeToFileDrops`
- Screen switching (`view`: `dashboard` | `queue` | `history` | `settings`)
- Toast host
- Scan runner (`useScanRunner`)

Pages are presentational: they receive props and render store state. I/O stays in `core/native`, `core/persistence`, and feature hooks/services.

### Native command table

Registered in `src-tauri/src/lib.rs`. Add new commands there **and** expose them from `api.ts`.

| Command                                                                                      | Role                                                                                        |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `has_saved_api_key` / `get_api_key` / `save_api_key` / `validate_api_key`                    | Keychain + VT probe (`GET /domains/google.com`)                                             |
| `submit_file`                                                                                | Hash SHA-256, upload (direct `/files` if ≤ 32 MB, else `/files/upload_url`), cap **650 MB** |
| `submit_archive`                                                                             | Walk folder, ZIP to tempfile, then `submit_file`                                            |
| `get_analysis_status`                                                                        | `GET /analyses/{id}`                                                                        |
| `get_path_metadata`                                                                          | Size, file count, mtime, `is_dir`                                                           |
| `open_external_url`                                                                          | Open VirusTotal (or other) URLs                                                             |
| `get_log_level` / `set_log_level` / `get_log_directory` / `open_log_directory` / `log_event` | Logging                                                                                     |
| `load_persisted_state` / `save_persisted_state` / `clear_persisted_state`                    | App data `state.json`                                                                       |
| `set_close_to_tray`                                                                          | Close button hides window when enabled                                                      |

Native commands return `Result<T, String>` (or a typed error converted at the boundary). They must not panic on user-controlled input.

### Scan pipeline

1. UI collects **absolute paths** (`pickFiles`, `pickFolder`, `pickPath`, or drop).
2. `pathToItem` builds a `ScanItem` (metadata from `get_path_metadata`).
3. `useScanRunner.runScan` requires `settings.hasApiKey`; otherwise it switches to Settings.
4. `scanPath` calls `submit_file` or `submit_archive`, then polls `get_analysis_status` until `completed` / `failed` or 60 attempts.
5. Polling in `scanPath` currently uses a **5 second** delay. `settings.pollInterval` is persisted and edited in Settings; wire it through if you change polling.
6. Result becomes `FileReport` (verdict from `stats.malicious` / `stats.suspicious`) and is stored in `history`.

History is a list plus a report sub-page. `view` stays `history`; `selectedReportId` chooses the sub-page. Nav and the native History menu open the list. Dashboard, Queue, and completed scans open a report by id. Missing ids fall back to the list.

In-flight items (`uploading` / `scanning`) are saved as `failed` with `interrupted_by_restart` on persist so a crash does not revive a fake running state.

### Persistence and secrets

- **Keychain:** API key only. `sanitizeSettings` forces `hasApiKey: false` in `state.json`.
- **state.json:** `items`, `history`, settings (no key), optional `window` bounds. Schema version `1` in `persistence.rs`. Version mismatch → ignore file.
- **logging.json:** log level in the app config dir.
- **Logs:** `sentinel-YYYY-MM-DD.log` in the app log dir, 10 MB rotate, 30-day retention. Structured JSON lines. Never log the API key.

### Desktop chrome

- Frameless window; `WindowChrome` handles caption, nav, min/max/close.
- Close can hide to tray (`CLOSE_TO_TRAY`).
- Native menu and tray emit `native:menu`; `menuBridge.ts` maps ids to views and pickers.
- `tauri-plugin-single-instance` focuses the existing window.

## Domain types

Canonical types live in `src/core/domain/types.ts`:

- `ScanItem` — queue row (`queued` → `uploading` → `scanning` → `completed` | `failed`)
- `FileReport` / `EngineResult` — history. Optional `fileKind` (older records derive it from the file name). Selection is `selectedReportId`, not a report snapshot.
- `AppSettings` — theme, accent, language, pollInterval, logLevel, scanImmediately, closeToTray, startMinimized, hasApiKey
- `Verdict` — `clean` | `suspicious` | `malicious` | `unknown`

Keep scan state serializable and UI-independent. Components render; services perform I/O.

## Core rules

1. Keep secrets in the OS keychain. Never persist API keys in local storage, source, logs, or reports.
2. Validate and normalize user input at the boundary. Reject empty paths and blank API keys.
3. Native commands return `Result<T, String>` (or a typed error converted at the boundary) and must not panic on user-controlled input.
4. Frontend code must not call Tauri commands from visual components; route through `api.ts` or a feature service.
5. Use absolute filesystem paths for native file operations. Do not replace dropped paths with display names.
6. Keep scan state serializable and UI-independent.
7. Preserve English and Russian translations for every user-facing string.
8. Use small, composable functions and explicit types. Avoid `any` in new code.
9. Do not commit secrets, generated build output, local credentials, or OS-specific temp files.
10. Before submitting changes, run `npm run build`, `npm run check:versions`, and `cargo check --manifest-path src-tauri/Cargo.toml` when Rust is available.
11. Log every shipped change in [CHANGELOG.md](CHANGELOG.md) and bump SemVer in the same change. Small changes are a **patch** (`0.1.0` → `0.1.1`). New user-visible capabilities are a **minor**. Breaking changes are a **major**. Keep `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (`sentinel`), `src-tauri/tauri.conf.json`, and the `Version:` line in this file in sync.

## Naming

| Kind                     | Convention                              |
| ------------------------ | --------------------------------------- |
| React components         | PascalCase                              |
| TS functions / variables | camelCase                               |
| Rust fn + Tauri commands | snake_case                              |
| Feature directories      | kebab-case                              |
| Tests                    | next to the module or matching `tests/` |

## How to add work safely

**New screen / feature:** `src/features/<name>/`, register the view in `app/constants` (`VIEWS`) and `App.tsx`. Import only `core/`, `app/`, `components/`.

**New native capability:** implement in the right Rust module (`commands.rs` vs `persistence.rs` vs `logging.rs` vs `chrome.rs`), register in `lib.rs`, wrap in `api.ts`, then call from a hook or `App.tsx`.

**New string:** add the same key under every language in `src/core/i18n/locales/` (`en`, `ru`, `es`, `de`, `fr`, `pt`, `zh`).

**New icon:** map a Heroicons 24/outline component in `Icon.tsx`; do not import Heroicons from feature files.

**New setting:** extend `AppSettings` + `DEFAULT_SETTINGS`, persist via `sanitizeSettings`, and keep `hasApiKey` out of disk.

## Commands agents should run

```bash
npm run lint
npm run format:check
npm run build
npm run check:versions
npm test
cargo check --manifest-path src-tauri/Cargo.toml
```

Format TS with Prettier (`.prettierrc.json`: 120 width, single quotes). Rust: default rustfmt.

## Change checklist

- File selection, folder selection, drag-and-drop
- Keychain persistence and validation
- Scan polling, retries, and error toasts
- UI stays responsive during upload/poll
- New commands registered in `lib.rs` and wrapped in `api.ts`
- Translations updated
- This guide updated when architecture changes
- `CHANGELOG.md` updated and SemVer bumped (patch / minor / major) in all version files

## Out of scope / traps

- Do not introduce MUI, Redux, or a second i18n system.
- Do not store the API key in Zustand beyond the in-memory Settings field used for the input; `hasApiKey` is the durable flag, the secret stays in keychain.
- Do not treat display names as paths.
- Folder scans are one ZIP upload, not per-file analyses.
- Browser Vite preview is not a substitute for `tauri dev` when touching native behavior.

# CLAUDE.md

Instructions for [Claude Code](https://code.claude.com/docs/en/claude-md) working in this repo. Full architecture map: [AGENTS.md](AGENTS.md). Human workflow: [CONTRIBUTING.md](CONTRIBUTING.md).

## Project

Sentinel is a **Tauri 2** desktop client for **VirusTotal API v3**. It uploads files/folders, polls analysis, and stores local history. It is not a local antivirus. Verdicts come from VirusTotal.

Stack: React 19 + TypeScript + Vite 6 + Zustand + i18next (`en`/`ru`) + custom CSS + Heroicons. Native: Rust, `reqwest`, OS keychain (`sentinel-virustotal` / `api-key`). Identifier: `dev.sentinel.scanner`. Alias `@/*` → `src/*`. Vite port **1421**.

Maintainer: [NemoKing](https://github.com/NemoKing1210). Repo: [NemoKing1210/Sentinel](https://github.com/NemoKing1210/Sentinel).

`npm run dev` is UI-only (browser mocks in `api.ts`). Use `npm run tauri dev` for dialogs, keychain, scans, tray, and persistence.

## Commands

```bash
npm install
npm run tauri dev          # real desktop app
npm run lint
npm run format:check
npm run build              # tsc + Vite
npm run check:versions     # SemVer files + changelog section
npm run version:patch      # bump every version file
npm run release            # tag vX.Y.Z and push
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri build        # packaged binary
```

Before finishing a change: `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml`. Prettier: 120 width, single quotes (`.prettierrc.json`). Rust: default rustfmt.

## Layout

```
src/App.tsx                composition root (hydrate, DnD, menu, toasts, views)
src/app/                   constants, hooks, pure utils
src/components/ui/         presentational widgets — not MUI
src/components/layout/     WindowChrome, Toast
src/core/domain/types.ts   ScanItem, FileReport, AppSettings
src/core/native/api.ts     only frontend ↔ Tauri boundary
src/core/state/store.ts    Zustand
src/core/i18n/index.ts     en + ru catalogs
src/core/persistence/      state.json hydrate/save
src/features/<name>/       one screen; kebab-case dirs
src-tauri/src/lib.rs       command registration
src-tauri/src/commands.rs  keychain, VT, path metadata
src-tauri/src/persistence.rs  logging.rs  chrome.rs
```

Do not edit `dist/` or `src-tauri/target/`.

## Import direction

```
features → core | app | components
app      → core ; never features
components → types/helpers only ; never features
core     → never features
```

Features must not import other features.

## Architecture (short)

- Pages render Zustand state. I/O lives in `core/native`, `core/persistence`, and feature hooks (`useScanRunner`).
- New Tauri commands: implement in the matching Rust module → register in `lib.rs` → wrap in `api.ts` → call from a hook/`App.tsx`. Visual components never `invoke`.
- Scan: absolute paths → `pathToItem` → `submit_file` or `submit_archive` (folder → ZIP) → poll `get_analysis_status`. File cap 650 MB; ≤32 MB uses `/files`, larger uses `/files/upload_url`.
- `settings.pollInterval` is persisted in Settings; `scanPath` currently polls every **5s**. Wire it through if you change polling.
- API key: OS keychain only. `sanitizeSettings` writes `hasApiKey: false` to `state.json`. Never log the key.

## Versioning

SemVer starts at **0.1.0**. Every shipped change must bump the version and add a dated section to [CHANGELOG.md](CHANGELOG.md). Do not defer this.

- **Patch** (`0.1.0` → `0.1.1`): small change — bugfix, copy, docs, tweak, translation, hardening.
- **Minor** (`0.1.1` → `0.2.0`): new user-visible capability, still compatible.
- **Major** (`0.2.0` → `1.0.0`): breaking change for users or persisted data.

Default to patch when unsure. Keep `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (`sentinel`), `src-tauri/tauri.conf.json`, and the `Version:` line in [AGENTS.md](AGENTS.md) in sync. The UI reads `package.json` via `packageMeta.ts`.

## Rules

1. Secrets stay in the OS keychain. Never persist API keys in local storage, source, logs, or reports.
2. Reject empty paths and blank keys at the boundary.
3. Native commands return `Result<T, String>` (or a typed error at the boundary). Do not panic on user input.
4. Use absolute filesystem paths. Do not replace dropped paths with display names.
5. Scan state is serializable and UI-independent.
6. Every user-facing string: both `en` and `ru` in `src/core/i18n/index.ts`.
7. No `any` in new TypeScript. Small functions, explicit types.
8. Do not commit secrets, `dist/`, `src-tauri/target/`, `.env`, or OS temp files.
9. Log every change in `CHANGELOG.md` and bump SemVer (patch for small changes).

## Naming

React components PascalCase. TS functions camelCase. Rust fns and Tauri commands `snake_case`. Feature dirs kebab-case. Tests next to the module or under matching `tests/`.

## How to add

- **Screen:** `src/features/<name>/`, register in `VIEWS` + `App.tsx`.
- **Native API:** Rust module → `lib.rs` → `api.ts` → hook/`App.tsx`.
- **String:** same key in `en` and `ru`.
- **Icon:** map Heroicons 24/outline in `Icon.tsx`; do not import Heroicons from features.
- **Setting:** `AppSettings` + `DEFAULT_SETTINGS` + `sanitizeSettings`; keep the key off disk.

## Do not

- Add MUI, Redux, or a second i18n system.
- Treat Vite browser preview as a substitute for `tauri dev` when touching native behavior.
- Treat folder scans as per-file analyses (one ZIP upload).
- Store the API key in Zustand except the Settings input; durable flag is `hasApiKey`.

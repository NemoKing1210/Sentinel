# Contributing to Sentinel

Thanks for helping. This document is the human workflow. [AGENTS.md](AGENTS.md) is the architecture map for both people and coding agents — read it before changing module boundaries. Claude Code uses [CLAUDE.md](CLAUDE.md).

## Prerequisites

- Node.js 20+
- Rust stable with the Tauri 2 desktop toolchain for your OS
- A VirusTotal API key if you need to exercise real scans

See the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for WebView2 (Windows), WebKit (Linux), and Xcode CLT (macOS).

## Setup

```bash
git clone https://github.com/NemoKing1210/Sentinel.git
cd Sentinel
npm install
npm run tauri dev
```

Issues and pull requests go to [NemoKing1210/Sentinel](https://github.com/NemoKing1210/Sentinel). The maintainer is [NemoKing](https://github.com/NemoKing1210).

Use `npm run tauri dev` for almost all work. `npm run dev` is the Vite UI without native commands, so dialogs, keychain, tray, and scans will not behave as in the packaged app.

## Everyday commands

| Command | Purpose |
| --- | --- |
| `npm run tauri dev` | Run the desktop app |
| `npm run lint` | ESLint on TypeScript |
| `npm run format` / `npm run format:check` | Prettier |
| `npm run build` | `tsc` + Vite production bundle |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Native compile check |
| `npm run tauri build` | Packaged installer / binary |

Run `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` before you open a pull request.

## How to make a change

1. Branch from the default branch with a short, descriptive name.
2. Keep the change focused. Do not mix a feature with unrelated formatting.
3. Follow the import direction: `features/` → `core/` / `app/` / `components/`. Features never import each other.
4. Route every Tauri `invoke` through `src/core/native/api.ts` (or a feature service). Visual components must not call commands directly.
5. Add or update `en` and `ru` strings in `src/core/i18n/index.ts` for any user-facing text.
6. Register new Rust commands in `src-tauri/src/lib.rs`.
7. Bump the app version and add a dated section to [CHANGELOG.md](CHANGELOG.md) in the same change. Small changes are a **patch** (`0.1.0` → `0.1.1`). New user-visible capabilities are a **minor**. Breaking changes are a **major**. Keep `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (`sentinel`), `src-tauri/tauri.conf.json`, and the `Version:` line in [AGENTS.md](AGENTS.md) in sync.
8. Open a pull request with what changed, why, and how you tested it.

## Code conventions

- **TypeScript:** PascalCase components, camelCase functions. No `any` in new code. Use the `@/` alias.
- **Rust:** `snake_case` functions and Tauri command names. Return `Result<T, String>` (or a typed error converted at the boundary). Do not panic on user-controlled input.
- **Features:** kebab-case directories under `src/features/`.
- **Tests:** next to the module or under a matching `tests/` directory.
- **Prettier:** 120 print width, single quotes, trailing commas. Rust uses default `rustfmt`.

UI is custom CSS plus primitives in `src/components/ui/`. Icons come from `@heroicons/react` (24/outline) and are mapped in `src/components/ui/Icon.tsx`. Do not add Material UI or another component library without an explicit design change.

## Security rules

- Persist API keys only through `save_api_key` / the OS keychain. Never write keys to `state.json`, logs, reports, or source.
- Validate and trim user input at the boundary (empty paths, blank keys).
- Use absolute filesystem paths for native file operations. Do not replace dropped paths with display names.
- Keep scan state serializable and UI-independent.

## What to test

Exercise the path you touched, then the shared flows when the change is close to scanning or settings:

- File pick, folder pick, drag-and-drop
- Keychain save / load / validate
- Upload, polling, retry, and error toasts
- Persistence across restart (queue, history, settings, window bounds)
- Tray close, native menu, and single-instance focus
- English and Russian copy for new strings
- Light and dark theme if you changed chrome or CSS

Keep the UI responsive while uploads and polling run.

## Pull requests

- Prefer small, reviewable diffs.
- Describe user-visible behavior, not only file lists.
- Do not commit `dist/`, `src-tauri/target/`, `.env`, credentials, or OS temp files.
- Do not commit secrets.

Commit messages should say **why** the change exists in one or two sentences. Use `add` / `update` / `fix` language that matches the actual intent.

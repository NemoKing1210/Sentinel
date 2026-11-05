# Нативная достоверность WinUI 3 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Довести интерфейс Sentinel до максимального сходства с нативными приложениями Windows 11: настоящая Mica, системный акцент, поведение title bar и NavigationView, нативные списки, настройки, фокус, иконки и отчёт.

**Architecture:** Работаем в текущем стеке Tauri 2 + React 19. Нативные возможности окна добавляются через Rust-команды и `@tauri-apps/api/window`, визуальные метрики — через токены и CSS в `manual.css`. Логика режимов навигации и акцентных палитр выносится в чистые функции с юнит-тестами, чтобы поведение не зависело от CSS media queries.

**Tech Stack:** Tauri 2, Rust (`windows` 0.61, `winreg` 0.52), React 19, TypeScript 5.7, Vite 6, Zustand, i18next, `@fluentui/react-icons`, CSS.

**Spec:** `docs/superpowers/specs/2026-11-05-winui-native-fidelity-design.md`

## Global Constraints

- Базовая версия — **0.4.0**. Итоговая — **0.5.0** (minor: новые пользовательские возможности). Версии синхронизируются в `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (пакет `sentinel`), `src-tauri/tauri.conf.json` и строке `Version:` в `AGENTS.md`.
- Каждая новая строка добавляется во все 7 локалей: `src/core/i18n/locales/{en,ru,es,de,fr,pt,zh}.ts`.
- Windows 10 должна оставаться рабочей: Mica — только прогрессивное улучшение, фон при её отсутствии непрозрачный.
- Проверка нативных эффектов — только `npm run tauri dev`; браузерный `npm run dev` не показывает Mica, keychain и окно.
- Направление импортов: `features → core | app | components`; `components` не импортирует features; `core` не импортирует features.
- Новые команды: Rust-модуль → регистрация в `src-tauri/src/lib.rs` → обёртка в `src/core/native/api.ts` → вызов из хука/`App.tsx`.
- Никаких `any` в новом TypeScript. Чистые функции покрываются тестами через `node --experimental-strip-types`.
- В рабочем дереве уже лежит незакоммиченный релиз 0.4.0. Перед Task 1 согласовать с пользователем и закоммитить его как базовую точку; не потерять эти изменения.
- Секреты не попадают в логи, состояние и отчёты. API-ключ — только keychain.

## Review Focus

1. **Windows 10 / build < 22000 / RDP:** Mica недоступна — окно не должно стать прозрачным до рабочего стола; фон обязан остаться `#202020` / `#f3f3f3`.
2. **Экстремальный системный акцент (белый, чёрный, очень яркий):** текст на акцентной заливке должен оставаться читаемым; при отсутствии системного цвета — `#0078d4`.
3. **Узкое окно 560–640 px и переходы между режимами:** панель не перекрывает контент, настройки достижимы, оверлей закрывается, фокус не теряется.
4. **Maximize/restore, перетаскивание между мониторами с разным DPI, потеря фокуса окна:** правильная иконка restore, корректный drag region, приглушение в неактивном окне.
5. **Клавиатура, скринридер, высокая контрастность:** все элементы достижимы Tab/стрелками, focus visible двухцветный, подсказка не является единственной меткой, `forced-colors` не ломает читаемость.

---

### Task 1: Настоящая Mica и нативная рамка окна

**Files:**

- Create: `src-tauri/tauri.windows.conf.json`
- Create: `src/app/hooks/useWindowBackdrop.ts`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/commands.rs` (в конец файла)
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/core/native/api.ts`
- Modify: `src/app/hooks/useNativeTheme.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/styles/manual.css`

**Interfaces:**

- Produces (Rust): `pub struct WindowBackdrop { pub mica: bool, pub build: u32 }`, `#[tauri::command] pub fn get_window_backdrop() -> WindowBackdrop`, `fn backdrop_for_build(build: u32) -> bool`.
- Produces (TS): `interface WindowBackdropInfo { mica: boolean; build: number }`, `getWindowBackdrop(): Promise<WindowBackdropInfo>`, `type BackdropMode = 'mica' | 'solid'`, `useWindowBackdrop(theme: ThemeMode, scheme: ColorScheme): BackdropMode`.

- [ ] **Step 1: Написать падающий Rust-тест**

В конец `src-tauri/src/commands.rs`:

```rust
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
}
```

- [ ] **Step 2: Убедиться, что тест не компилируется**

Run: `cargo test --manifest-path src-tauri/Cargo.toml mica_requires_windows_11`
Expected: FAIL — `cannot find function backdrop_for_build`.

- [ ] **Step 3: Реализовать команду в `commands.rs`**

Точные сигнатуры:

```rust
#[derive(Serialize)]
pub struct WindowBackdrop {
    pub mica: bool,
    pub build: u32,
}

fn backdrop_for_build(build: u32) -> bool {
    build >= 22000
}

#[cfg(target_os = "windows")]
fn windows_build_number() -> u32 { /* winreg: HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion, CurrentBuildNumber, parse u32 */ }

#[cfg(not(target_os = "windows"))]
fn windows_build_number() -> u32 {
    0
}

#[tauri::command]
pub fn get_window_backdrop() -> WindowBackdrop {
    let build = windows_build_number();
    WindowBackdrop {
        mica: cfg!(target_os = "windows") && backdrop_for_build(build),
        build,
    }
}
```

`windows_build_number` использует `winreg::RegKey::predef(HKEY_LOCAL_MACHINE)`, ключ `SOFTWARE\Microsoft\Windows NT\CurrentVersion`, значение `CurrentBuildNumber` (строка), `unwrap_or(0)` при любой ошибке.

- [ ] **Step 4: Зарегистрировать команду и обёрнуть в `api.ts`**

В `src-tauri/src/lib.rs` добавить `commands::get_window_backdrop` в `generate_handler![]`.

В `src/core/native/api.ts`:

```ts
export interface WindowBackdropInfo {
  mica: boolean;
  build: number;
}

export async function getWindowBackdrop(): Promise<WindowBackdropInfo> {
  if (!isTauri) return { mica: false, build: 0 };
  return invoke<WindowBackdropInfo>('get_window_backdrop');
}
```

- [ ] **Step 5: Разделить базовый и Windows-конфиг окна**

В `src-tauri/tauri.conf.json` оставить непрозрачный базовый вариант: `decorations: false`, `shadow: true`, `backgroundColor: "#202020"`, `minWidth: 560`, `minHeight: 560`.

Создать `src-tauri/tauri.windows.conf.json` — платформенный конфиг **заменяет массив `app.windows` целиком**, поэтому объект окна дублируется полностью:

```json
{
  "app": {
    "windows": [
      {
        "title": "Sentinel",
        "backgroundColor": "#00000000",
        "decorations": false,
        "shadow": true,
        "transparent": true,
        "visible": false,
        "width": 1320,
        "height": 860,
        "minWidth": 560,
        "minHeight": 560,
        "resizable": true
      }
    ]
  }
}
```

`windowEffects` в конфиг **не добавлять**: эффект применяется в рантайме только при `mica: true`, иначе Windows 10 получит ошибку.

- [ ] **Step 6: Реализовать хук `useWindowBackdrop`**

```ts
export type BackdropMode = 'mica' | 'solid';

export function useWindowBackdrop(theme: ThemeMode, scheme: ColorScheme): BackdropMode;
```

Поведение:

- Поддержка проверяется один раз (`getWindowBackdrop()`), результат кэшируется в модульной переменной `Promise<boolean>`.
- Если `mica` поддерживается — `getCurrentWindow().setEffects({ effects: [effect] })`, где `effect` = `micaLight` при `theme === 'light'`, `micaDark` при `theme === 'dark'`, иначе `mica`. При успехе вернуть `'mica'`.
- При ошибке или отсутствии поддержки — `clearEffects().catch(() => undefined)`, затем `setBackgroundColor(scheme === 'light' ? '#f3f3f3' : '#202020').catch(() => undefined)` и вернуть `'solid'`.
- В браузере (нет `__TAURI_INTERNALS__`) сразу `'solid'`.
- Эффект перезапускается при изменении `theme` и `scheme`; флаг `active` защищает от установки состояния после размонтирования.

В `useNativeTheme` убрать `setBackgroundColor` и константы `LIGHT_WINDOW_BG` / `DARK_WINDOW_BG` — остаётся только `setTheme`.

- [ ] **Step 7: Подключить режим в `App.tsx` и CSS**

В `App.tsx`:

```ts
const backdrop = useWindowBackdrop(settings.theme, colorScheme);
```

Класс контейнера: `manual-app ${colorScheme}${backdrop === 'mica' ? ' mica' : ''}`.

В `src/styles/global.css` убрать `background: #202020` у `:root`; добавить `html, body, #root { background: transparent; }`.

В `src/styles/manual.css` рядом с `.manual-app`:

```css
.manual-app.mica {
  background-color: transparent;
  background-image: none;
}
```

Токены `--bg`, `--card-bg`, `--card-stroke` не менять: карточки уже полупрозрачные.

- [ ] **Step 8: Показывать окно после гидратации**

Так как на Windows окно создаётся с `visible: false`, в `App.tsx` добавить функцию:

```ts
const revealWindow = () => {
  if (useAppStore.getState().settings.startMinimized) return;
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
  void getCurrentWindow().show();
};
```

Вызвать её в `finally` у промиса гидратации: `})().catch(...).finally(() => { if (!cancelled.current) revealWindow(); });`. Существующую ветку `shouldStartHidden` / `hide()` сохранить.

- [ ] **Step 9: Проверить**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml mica_requires_windows_11
cargo check --manifest-path src-tauri/Cargo.toml
npm run build
npm run tauri dev
```

Ожидается: тест PASS; окно появляется без вспышки рабочего стола; на Windows 11 видна Mica под заголовком и панелью; при переключении темы Mica светлеет/темнеет; при максимизации углы скруглены; на узком окне ничего не просвечивает. На Windows 10 (если доступна) — непрозрачный фон.

- [ ] **Step 10: Коммит**

```bash
git add src-tauri/tauri.conf.json src-tauri/tauri.windows.conf.json src-tauri/src/commands.rs src-tauri/src/lib.rs src/core/native/api.ts src/app/hooks/useWindowBackdrop.ts src/app/hooks/useNativeTheme.ts src/App.tsx src/styles/global.css src/styles/manual.css
git commit -m "feat: enable Windows 11 Mica with a solid fallback

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: Системный акцент Windows

**Files:**

- Modify: `src/app/utils/theme.ts`
- Modify: `src/app/utils/theme.test.ts`
- Create: `src/app/utils/accent.ts`
- Create: `src/app/hooks/useSystemAccent.ts`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/core/native/api.ts`
- Modify: `src/core/domain/types.ts`
- Modify: `src/app/constants/index.ts`
- Modify: `src/App.tsx`
- Modify: `src/features/settings/SettingsPage.tsx`
- Modify: all 7 files in `src/core/i18n/locales/`

**Interfaces:**

- Produces (TS): `accentPaletteFromHex(hex: string, scheme: ColorScheme): AccentPalette`, `onAccentFor(color: string): '#000000' | '#ffffff'`, `resolveAccentPalette(accent: AccentColor, scheme: ColorScheme, systemAccent: string | null): AccentPalette`, `SYSTEM_ACCENT_FALLBACK = '#0078d4'`, `useSystemAccent(): string | null`.
- Produces (Rust): `#[tauri::command] pub fn get_system_accent() -> Result<String, String>`.
- Produces (api): `getSystemAccent(): Promise<string>`.
- Consumes: `AccentPalette` и `getAccentPalette` из `src/app/constants/index.ts`.

- [ ] **Step 1: Написать падающие тесты палитры**

Добавить в `src/app/utils/theme.test.ts` (файл уже в `npm test`), заменив существующий импорт на:

```ts
import { accentPaletteFromHex, mixHex, resolveColorScheme } from './theme.ts';

test('derives a readable dark palette from the Windows accent', () => {
  assert.deepEqual(accentPaletteFromHex('#0078d4', 'dark'), {
    teal: '#66aee5',
    tealDeep: '#5a99ca',
    onTeal: '#000000',
  });
});

test('derives a readable light palette from the Windows accent', () => {
  assert.deepEqual(accentPaletteFromHex('#0078d4', 'light'), {
    teal: '#006cbf',
    tealDeep: '#005fa8',
    onTeal: '#ffffff',
  });
});

test('keeps text readable on extreme accent values', () => {
  assert.equal(accentPaletteFromHex('#ffffff', 'dark').onTeal, '#000000');
  assert.equal(accentPaletteFromHex('#000000', 'light').onTeal, '#ffffff');
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL — `accentPaletteFromHex is not a function` (или ошибка импорта).

- [ ] **Step 3: Реализовать палитру в `theme.ts`**

```ts
import type { AccentPalette } from '@/app/constants';

export function relativeLuminance(color: string): number;
export function onAccentFor(color: string): '#000000' | '#ffffff';
export function accentPaletteFromHex(hex: string, scheme: ColorScheme): AccentPalette;
```

Правила:

- `relativeLuminance` — WCAG: канал `v/255`, при `v <= 0.03928` делить на `12.92`, иначе `((v + 0.055) / 1.055) ** 2.4`; веса `0.2126 / 0.7152 / 0.0722`. Невалидный hex → `0`.
- `onAccentFor`: сравнить контраст с чёрным `(L + 0.05) / 0.05` и с белым `1.05 / (L + 0.05)`; вернуть тот, у которого контраст больше или равен.
- `accentPaletteFromHex`: для `dark` — `mixHex(hex, '#ffffff', 0.4)`, для `light` — `mixHex(hex, '#000000', 0.1)`; `tealDeep = mixHex(teal, '#000000', 0.12)`, `onTeal = onAccentFor(teal)`.

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Реализовать Rust-команду акцента**

В `src-tauri/Cargo.toml` добавить feature `"UI_ViewManagement"` в зависимость `windows` (рядом с остальными `Win32_*`).

В `src-tauri/src/commands.rs`:

```rust
#[tauri::command]
pub fn get_system_accent() -> Result<String, String> {
    system_accent().ok_or_else(|| "system accent unavailable".to_string())
}

fn hex_from_rgb(r: u8, g: u8, b: u8) -> String {
    format!("#{r:02x}{g:02x}{b:02x}")
}

fn accent_from_registry_value(value: u32) -> String {
    hex_from_rgb(((value >> 16) & 0xff) as u8, ((value >> 8) & 0xff) as u8, (value & 0xff) as u8)
}
```

- `accent_from_ui_settings()` (только Windows): `use windows::UI::ViewManagement::{UIColorType, UISettings};`, затем `UISettings::new()`, `GetColorValue(UIColorType::Accent)`, вернуть `hex_from_rgb(color.R, color.G, color.B)`; любая ошибка → `None`.
- `accent_from_registry()` (только Windows): `HKCU\Software\Microsoft\Windows\DWM`, значение `ColorizationColor` (`u32`), преобразовать через `accent_from_registry_value`.
- `system_accent()` (Windows): `accent_from_ui_settings().or_else(accent_from_registry)`; не-Windows → `None`.
- Зарегистрировать `commands::get_system_accent` в `lib.rs`.

Добавить тест:

```rust
#[test]
fn reads_rgb_from_dwm_argb() {
    assert_eq!(accent_from_registry_value(0xC40078D4), "#0078d4");
    assert_eq!(accent_from_registry_value(0xFFC42B1C), "#c42b1c");
}
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml reads_rgb_from_dwm_argb`
Expected: PASS.

- [ ] **Step 6: Обёртка и типы**

В `src/core/native/api.ts`:

```ts
export async function getSystemAccent(): Promise<string> {
  if (!isTauri) return '#0078d4';
  return invoke<string>('get_system_accent');
}
```

В `src/core/domain/types.ts`: `AccentColor = 'system' | 'vt' | 'teal' | 'blue' | 'violet' | 'rose' | 'amber'`.

В `src/app/constants/index.ts`: `DEFAULT_SETTINGS.accent = 'system'`. `ACCENT_COLORS` не трогать (там остаются пользовательские цвета).

- [ ] **Step 7: Резолвер и хук**

Создать `src/app/utils/accent.ts`:

```ts
import type { AccentColor, ColorScheme } from '@/core/domain/types';
import { getAccentPalette, type AccentPalette } from '@/app/constants';
import { accentPaletteFromHex } from './theme';

export const SYSTEM_ACCENT_FALLBACK = '#0078d4';

export function resolveAccentPalette(
  accent: AccentColor,
  scheme: ColorScheme,
  systemAccent: string | null,
): AccentPalette {
  if (accent === 'system') return accentPaletteFromHex(systemAccent ?? SYSTEM_ACCENT_FALLBACK, scheme);
  return getAccentPalette(accent, scheme);
}
```

Создать `src/app/hooks/useSystemAccent.ts`: состояние `string | null`, при монтировании вызвать `getSystemAccent()`; в Tauri подписаться на `getCurrentWindow().onFocusChanged` и повторять запрос при `payload === true`; корректно снимать подписку и игнорировать ответы после размонтирования.

- [ ] **Step 8: Подключить в `App.tsx` и настройках**

`App.tsx`:

```ts
const systemAccent = useSystemAccent();
const accent = resolveAccentPalette(settings.accent, colorScheme, systemAccent);
```

Заменить импорт `getAccentPalette` на `resolveAccentPalette` и `useSystemAccent`.

`SettingsPage` получает новый проп `systemAccent: string | null`. В начале `.accent-swatches` добавить кнопку `role="radio"` для `settings.accent === 'system'`:

- `aria-label={t('accentSystem')}`, `title={t('accentSystem')}`;
- цвета из `resolveAccentPalette('system', colorScheme, systemAccent)`;
- выбранная — с `<Icon name="check" />`.

В `App.tsx` передать `systemAccent={systemAccent}` в `<SettingsPage />`.

- [ ] **Step 9: Добавить строки во все 7 локалей**

Ключ `accentSystem` рядом с `accentAmber`:

| Локаль | Значение                              |
| ------ | ------------------------------------- |
| en     | `'Windows accent'`                    |
| ru     | `'Акцент Windows'`                    |
| es     | `'Color de énfasis de Windows'`       |
| de     | `'Windows-Akzentfarbe'`               |
| fr     | `'Couleur d’accentuation de Windows'` |
| pt     | `'Cor de destaque do Windows'`        |
| zh     | `'Windows 主题色'`                    |

- [ ] **Step 10: Проверить**

Run: `npm test`, `npm run build`, `cargo check --manifest-path src-tauri/Cargo.toml`, `npm run tauri dev`.

Ожидается: в настройках первым выбран системный образец; его цвет совпадает с акцентом Windows; смена акцента в Windows и возврат фокуса обновляют цвет; при выборе другого образца акцент меняется; в светлой и тёмной теме текст на образце читаем.

- [ ] **Step 11: Коммит**

```bash
git add src/app/utils/theme.ts src/app/utils/theme.test.ts src/app/utils/accent.ts src/app/hooks/useSystemAccent.ts src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/commands.rs src-tauri/src/lib.rs src/core/native/api.ts src/core/domain/types.ts src/app/constants/index.ts src/App.tsx src/features/settings/SettingsPage.tsx src/core/i18n/locales
git commit -m "feat: follow the Windows system accent color

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: Fluent-контролы, иконки и статусы

**Files:**

- Create: `src/components/ui/Tooltip.tsx`
- Modify: `src/components/ui/Icon.tsx`
- Modify: `src/components/ui/Button.tsx`
- Modify: `src/components/ui/Select.tsx`
- Modify: `src/components/ui/StatusIcon.tsx`
- Modify: `src/components/ui/ScanRow.tsx`
- Modify: `src/components/ui/FileReportRow.tsx`
- Modify: `src/components/ui/OpenFolderButton.tsx`
- Modify: `src/components/ui/StepperInput.tsx`
- Modify: `src/components/ui/EmptyState.tsx`
- Modify: `src/components/ui/DropZone.tsx`
- Modify: `src/components/layout/Toast.tsx`
- Modify: `src/features/queue/QueueRow.tsx`
- Modify: `src/features/history/HistoryReportPage.tsx`
- Modify: `src/features/history/HistoryListPage.tsx`
- Modify: `src/features/dashboard/DashboardPage.tsx`
- Modify: `src/styles/manual.css`

**Interfaces:**

- Produces: `Tooltip({ content, children, placement })`, `Icon({ name, size }: { name: string; size?: 16 | 20 | 24 | 32 | 40 })`.
- Produces (CSS): `.status-text`, `.engine-status`, `--focus-outer`, `--focus-inner`.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Создать `Tooltip.tsx`**

```tsx
interface TooltipProps {
  content: string;
  children: ReactElement;
  placement?: 'top' | 'bottom' | 'right';
}

export function Tooltip({ content, children, placement = 'top' }: TooltipProps);
```

Поведение:

- Обёртка `<span className="tooltip-anchor">` с `onPointerEnter` / `onPointerLeave` / `onFocus` / `onBlur`.
- По указателю — задержка **400 мс**; по фокусу — сразу; скрытие мгновенное; `Escape` закрывает.
- Позиция считается от `getBoundingClientRect()` якоря и рендерится через `createPortal` в `.manual-app` с `position: fixed`:
  - `top`: `left = rect.left + rect.width / 2`, `top = rect.top - 8`, `transform: translate(-50%, -100%)`;
  - `bottom`: `top = rect.bottom + 8`;
  - `right`: `left = rect.right + 8`, `top = rect.top + rect.height / 2`, `transform: translateY(-50%)`.
- `role="tooltip"`, `pointer-events: none`.
- Отменять таймер при уходе указателя и размонтировании.

CSS: `.tooltip-anchor { display: inline-flex; }`, `.tooltip { position: fixed; z-index: 80; padding: 6px 10px; border: 1px solid var(--card-stroke); border-radius: var(--radius-control); color: var(--text); background: var(--flyout-bg); box-shadow: var(--shadow-flyout); font-size: 12px; line-height: 16px; white-space: nowrap; pointer-events: none; animation: tooltip-in 100ms cubic-bezier(0.1, 0.9, 0.2, 1); }`.

- [ ] **Step 2: Переделать карту иконок на варианты**

В `Icon.tsx`:

```ts
export type IconSize = 16 | 20 | 24 | 32 | 40;
interface IconVariants {
  16?: IconComponent;
  20?: IconComponent;
  24: IconComponent;
}
const ICONS: Record<string, IconVariants> = {/* … */};
```

Правила:

- Каждая запись получает `16` и `24`; `20` добавляется для иконок, которые рисуются в 20 px.
- Имена вариантов — по шаблону `Foo16Regular` / `Foo20Regular` / `Foo24Regular`; все используемые имена проверены в `@fluentui/react-icons@2.0.345`.
- Добавить отсутствующие записи: `menu` (`Navigation*Regular`), `restore` (`SquareMultiple*Regular`), `clock` (`Clock*Regular`).
- `Icon({ name, size })`: при `size` выбрать вариант (`≤16 → 16`, `≤20 → 20`, иначе `24`), фолбэк — `24`; без `size` использовать вариант `16` и не задавать inline-размер (CSS продолжает управлять размером). При `size` задать `style={{ width: size, height: size }}`.
- `FILE_KIND_ICON` не менять.

- [ ] **Step 3: Проставить размеры там, где CSS рисует иконку больше 16 px**

`size` обязателен в:

- `EmptyState` — 32;
- `DropZone` (`DropSymbol`) — 24;
- `StatusIcon` — 20;
- `ScanRow` (иконка файла) — 20;
- `HistoryReportPage` (иконка файла) — 24, иконка движка — 16;
- `WatchBoard` (`watch-scope`, `watch-stat-icon`) — 20/16;
- `DashboardPage` (key-banner) — 20;
- `SettingsPage` (about-mark) — 24;
- `Toast` — 20.

Остальные вызовы можно не трогать: они получат 16-вариант.

- [ ] **Step 4: Заменить заливные статусы на текст**

- `QueueRow.tsx`: `<span className={`status-text ${tone}`}>{t(item.verdict)}</span>` и `<span className={`status-text ${isActive ? 'teal' : item.status}`}>{t(item.status)}</span>`.
- `FileReportRow.tsx`: `<span className={`status-text ${tone}`}>{t(report.verdict)}</span>`.
- `HistoryReportPage.tsx`: `<small className={`engine-status ${enginePillTone(engine.category)}`}>`.

CSS:

```css
.status-text,
.engine-status {
  flex: 0 0 auto;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
  white-space: nowrap;
}
.status-text.teal {
  color: var(--accent);
}
.status-text.completed,
.status-text.success,
.engine-status.success {
  color: var(--success);
}
.status-text.failed,
.status-text.danger,
.engine-status.danger {
  color: var(--danger);
}
.status-text.suspicious,
.status-text.warning,
.engine-status.warning {
  color: var(--warning);
}
```

Класс `.pill` оставить только если он ещё где-то используется; после замены удалить правила `.pill*` и `.pill .glyph` из CSS.

- [ ] **Step 5: Двухцветный focus visual**

Добавить токены в `.manual-app` (тёмная тема) и `.manual-app.light`:

```css
--focus-inner: #ffffff;
--focus-outer: #000000;
```

(в светлой — наоборот).

Заменить существующее правило `:focus-visible` на:

```css
.manual-app button:focus-visible,
.manual-app a:focus-visible,
.manual-app [role='radio']:focus-visible,
.manual-app [role='tab']:focus-visible,
.manual-app [role='option']:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 1px var(--focus-outer),
    0 0 0 3px var(--focus-inner);
}
```

Для `.switch-input:focus-visible + .switch` использовать те же два кольца. Не ломать существующие `box-shadow` у `.select-trigger.open` — для него добавить кольца через `outline` с теми же цветами.

- [ ] **Step 6: Метрики контролов**

- `Select.tsx`: `MENU_OPTION_HEIGHT` изменить с `42` на `34` (реальная высота опции — 32 px).
- `.button` остаётся 32 px; `.button .glyph` — 16 px.
- `.select-trigger` — 32 px; `.select-option` — `min-height: 32px`, `padding: 0 12px`.
- `.field input` — 32 px, фокус — нижняя акцентная линия 2 px (уже есть).
- `.switch` — 40×20; thumb без изменений.
- Добавить `font-variant-numeric: tabular-nums` для `.watch-stat-value`, `.history-stats-legend`, `.settings-row-copy span` с числами не нужно.

- [ ] **Step 7: Проверить**

Run: `npm run build`, `npm run lint`, `npm run format:check`, `npm run tauri dev`.

Ожидается: подсказки появляются через ~400 мс и сразу по фокусу; иконки в кнопках/навигации/строках выглядят плотнее; статусы — цветной текст без плашек; фокус двухцветный на кнопках, вкладках, радио и опциях; ComboBox не «прыгает».

- [ ] **Step 8: Коммит**

```bash
git add src/components src/features src/styles/manual.css
git commit -m "feat: align Fluent controls, icons, focus and status text

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: NavigationView — метрики, режимы и клавиатура

**Files:**

- Create: `src/app/utils/navigation.ts`
- Create: `src/app/utils/navigation.test.ts`
- Create: `src/app/hooks/useNavigationMode.ts`
- Modify: `src/components/layout/NavigationPane.tsx`
- Modify: `src/components/layout/WindowChrome.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/manual.css`
- Modify: `package.json` (список тестов)

**Interfaces:**

- Produces: `type NavigationMode = 'expanded' | 'compact' | 'minimal'`, `type NavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'`, `navigationModeForWidth(width: number): NavigationMode`, `nextNavIndex(current: number, key: NavigationKey, count: number): number`, `useNavigationMode(): NavigationMode`.
- Produces: `NavigationPane({ nav, view, setView, mode, open, onNavigate })`.
- Produces: `WindowChrome({ paneExpanded, onTogglePane })`.
- Consumes: `Tooltip` и `Icon size` из Task 3.

- [ ] **Step 1: Написать падающие тесты**

Создать `src/app/utils/navigation.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { navigationModeForWidth, nextNavIndex } from './navigation.ts';

test('uses the WinUI NavigationView breakpoints', () => {
  assert.equal(navigationModeForWidth(1400), 'expanded');
  assert.equal(navigationModeForWidth(1008), 'expanded');
  assert.equal(navigationModeForWidth(1007), 'compact');
  assert.equal(navigationModeForWidth(641), 'compact');
  assert.equal(navigationModeForWidth(640), 'minimal');
  assert.equal(navigationModeForWidth(480), 'minimal');
});

test('wraps arrow navigation and supports Home/End', () => {
  assert.equal(nextNavIndex(0, 'ArrowDown', 4), 1);
  assert.equal(nextNavIndex(3, 'ArrowDown', 4), 0);
  assert.equal(nextNavIndex(0, 'ArrowUp', 4), 3);
  assert.equal(nextNavIndex(2, 'Home', 4), 0);
  assert.equal(nextNavIndex(2, 'End', 4), 3);
  assert.equal(nextNavIndex(0, 'ArrowDown', 0), 0);
});
```

Добавить `src/app/utils/navigation.test.ts` в скрипт `test` в `package.json`.

Run: `npm test`
Expected: FAIL — модуль не найден.

- [ ] **Step 2: Реализовать `navigation.ts`**

```ts
export const NAV_EXPANDED_MIN_WIDTH = 1008;
export const NAV_COMPACT_MIN_WIDTH = 641;

export function navigationModeForWidth(width: number): NavigationMode {
  if (width >= NAV_EXPANDED_MIN_WIDTH) return 'expanded';
  if (width >= NAV_COMPACT_MIN_WIDTH) return 'compact';
  return 'minimal';
}

export function nextNavIndex(current: number, key: NavigationKey, count: number): number {
  if (count <= 0) return 0;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown') return (current + 1) % count;
  return (current - 1 + count) % count;
}
```

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Хук режима**

`src/app/hooks/useNavigationMode.ts`: `useState(window.innerWidth)`, подписка на `resize`, возврат `navigationModeForWidth(width)`.

- [ ] **Step 4: Переписать `NavigationPane`**

Пропсы:

```ts
export interface NavigationPaneProps {
  nav: NavItem[];
  view: View;
  setView: (view: View) => void;
  mode: NavigationMode;
  open: boolean;
  onNavigate?: () => void;
}
```

Поведение:

- Классы: `nav-pane ${mode} ${open ? 'open' : 'closed'}`; при `mode !== 'expanded' && open` добавить `overlay`.
- Элементы: `height: 36px`, `gap: 12px`, `padding: 0 12px`, иконка 20 px; в закрытом режиме — только иконка по центру.
- Выбранный элемент: фон `var(--subtle-hover)`, акцентная полоска 3×16 слева, иконка акцентная, текст основной.
- Счётчик: в открытом режиме — InfoBadge `<b>`, в закрытом — точка 4 px у иконки (обёртка `.nav-icon` с `position: relative`).
- В закрытом режиме каждый пункт обёрнут в `<Tooltip placement="right">`; у кнопки остаётся `aria-label`.
- Клавиатура: `itemRefs`, локальный `focusIndex`; `onKeyDown` на `<nav>` обрабатывает только `ArrowDown | ArrowUp | Home | End`, вызывает `nextNavIndex`, делает `.focus()`; `tabIndex` — `0` только у текущего индекса.
- Порядок индексов: `primary` затем `secondary` (Settings), как в DOM.
- `aria-current="page"` на выбранном, `aria-label` у иконки-кнопки.

- [ ] **Step 5: Подключить состояние в `App.tsx`**

```ts
const navMode = useNavigationMode();
const [paneOpen, setPaneOpen] = useState(navMode === 'expanded');
useEffect(() => {
  setPaneOpen(navMode === 'expanded');
}, [navMode]);
const togglePane = useCallback(() => setPaneOpen((open) => !open), []);
```

- `<NavigationPane nav={nav} view={view} setView={goToView} mode={navMode} open={paneOpen} onNavigate={() => { if (navMode !== 'expanded') setPaneOpen(false); }} />`.
- Если `navMode !== 'expanded' && paneOpen`, рендерить `<div className="nav-scrim" onClick={() => setPaneOpen(false)} />` перед панелью (внутри `.app-body`).
- `<WindowChrome paneExpanded={paneOpen} onTogglePane={togglePane} />`.
- `.app-body` получает `position: relative`.

- [ ] **Step 6: Кнопка навигации в заголовке**

В `WindowChrome` добавить пропсы `{ paneExpanded: boolean; onTogglePane: () => void }` и кнопку перед заголовком:

```tsx
<Tooltip content={t('toggleNavigation')} placement="bottom">
  <button
    type="button"
    className="window-nav-toggle"
    aria-label={t('toggleNavigation')}
    aria-expanded={paneExpanded}
    onMouseDown={(event) => event.stopPropagation()}
    onClick={onTogglePane}
  >
    <Icon name="menu" size={16} />
  </button>
</Tooltip>
```

CSS: `.window-nav-toggle { width: 40px; height: 32px; display: grid; place-items: center; border: 0; border-radius: var(--radius-control); color: var(--text-secondary); background: transparent; }`, hover — `var(--subtle-hover)`; отступ справа 4 px. `isInteractiveTarget` уже исключает кнопки из drag. Для кнопок заголовка добавить `.window-controls > .tooltip-anchor { display: flex; height: 100%; }`.

- [ ] **Step 7: CSS навигации**

- `.nav-pane`: `flex: 0 0 48px; width: 48px; padding: 4px;` (компактная база).
- `.nav-pane.open`: `flex-basis: 320px; width: 320px; padding: 4px 8px 8px;`.
- `.nav-pane.overlay`: `position: absolute; inset: 0 auto 0 0; z-index: 30; width: 320px; background: var(--flyout-bg); box-shadow: var(--shadow-flyout);`.
- `.nav-pane.closed:not(.minimal)`: рельс 48 px; `.nav-pane.overlay.closed { display: none; }`.
- `.nav-pane:not(.open) .nav-label`, `.nav-pane:not(.open) .nav-link b` — `display: none`.
- `.nav-scrim { position: absolute; inset: 0; z-index: 25; background: rgba(0,0,0,0.3); }`.
- Удалить блок правил `.nav-pane`, `.nav-link`, `.nav-label`, `.nav-link b`, `.nav-divider` из `@media (max-width: 900px)`.
- `.nav-link` — `min-height: 36px; gap: 12px; padding: 0 12px;`.
- `.nav-badge-dot` — 4×4, accent, `border-radius: 50%`, `position: absolute; top: -1px; right: -2px`.
- `.nav-pane .tooltip-anchor { display: block; width: 100%; }` — чтобы обёртка подсказки не ломала ширину пункта.

- [ ] **Step 8: Добавить строку `toggleNavigation` во все 7 локалей**

| Локаль | Значение       |
| ------ | -------------- |
| en     | `'Navigation'` |
| ru     | `'Навигация'`  |
| es     | `'Navegación'` |
| de     | `'Navigation'` |
| fr     | `'Navigation'` |
| pt     | `'Navegação'`  |
| zh     | `'导航'`       |

- [ ] **Step 9: Проверить**

Run: `npm test`, `npm run build`, `npm run tauri dev`.

Ожидается: при ширине окна 1200 px панель 320 px; при 900 px — рельс 48 px с подсказками; при 600 px панель скрыта и открывается кнопкой в заголовке как оверлей; клик по пункту закрывает оверлей; стрелки/Home/End переводят фокус; Tab не проходит по всем пунктам сразу; счётчики видны.

- [ ] **Step 10: Коммит**

```bash
git add src/app/utils/navigation.ts src/app/utils/navigation.test.ts src/app/hooks/useNavigationMode.ts src/components/layout/NavigationPane.tsx src/components/layout/WindowChrome.tsx src/App.tsx src/styles/manual.css src/core/i18n/locales package.json
git commit -m "feat: rebuild navigation with NavigationView metrics and modes

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: Поведение заголовка окна

**Files:**

- Modify: `src/components/layout/WindowChrome.tsx`
- Modify: `src/App.tsx`
- Modify: `src/features/history/HistoryReportPage.tsx`
- Modify: `src/styles/manual.css`
- Modify: all 7 files in `src/core/i18n/locales/`

**Interfaces:**

- Consumes: `Tooltip`, `Icon size`, `WindowChrome({ paneExpanded, onTogglePane })` из Tasks 3–4.
- Produces: `WindowChrome({ paneExpanded, onTogglePane, onBack?, backLabel? })`.

- [ ] **Step 1: Добавить состояние окна**

В `WindowChrome`:

```ts
const [maximized, setMaximized] = useState(false);
const [focused, setFocused] = useState(true);
```

Эффект (с guard `currentWindow()`):

- `win.isMaximized()` при монтировании;
- `win.onResized(...)` → повторно `isMaximized()`;
- `win.onFocusChanged(({ payload }) => setFocused(payload))`.

Все подписки снимать в cleanup; ответы после размонтирования игнорировать.

- [ ] **Step 2: Кнопка maximize/restore и подсказки**

- Иконка: `maximized ? 'restore' : 'maximize'`, размер 16.
- Подпись: `maximized ? t('windowRestore') : t('windowMaximize')`.
- Все три кнопки обернуть в `<Tooltip content={label} placement="bottom">`.
- Кнопка minimize — `t('windowMinimize')`, close — `t('windowClose')`.
- У кнопок остаются `aria-label`; `onMouseDown` с `stopPropagation` сохранить.

- [ ] **Step 3: Неактивное окно**

Класс `window-chrome inactive`, когда `focused === false`.

CSS:

```css
.window-chrome.inactive .window-title,
.window-chrome.inactive .window-control,
.window-chrome.inactive .window-nav-toggle,
.window-chrome.inactive .window-back {
  color: var(--text-disabled);
}
.window-chrome.inactive .window-control:hover {
  color: var(--text-secondary);
}
.window-chrome.inactive .window-control.close:hover {
  color: #ffffff;
  background: #c42b1c;
}
```

- [ ] **Step 4: Кнопка «назад» на отчёте**

`WindowChrome` получает `onBack?: () => void` и `backLabel?: string`. Если `onBack` задан — после кнопки навигации рендерится кнопка `.window-back` (40×32, `Icon name="back" size={16}`, `Tooltip placement="bottom"`).

В `App.tsx`:

```ts
const selectedReportId = useAppStore((state) => state.selectedReportId);
const reportOpen = view === 'history' && Boolean(selectedReportId);
```

Передать `onBack={reportOpen ? () => setReport(null) : undefined}` и `backLabel={t('historyBack')}`. `setReport` уже получен из store.

В `HistoryReportPage` удалить кнопку `<Button variant="quiet" icon="back" ...>` из `.history-report-nav`; проп `onBack` оставить — он нужен для Escape. CSS `.history-report-nav` переключить на `justify-content: flex-end`.

- [ ] **Step 5: Добавить `windowRestore` во все 7 локалей**

| Локаль | Значение             |
| ------ | -------------------- |
| en     | `'Restore down'`     |
| ru     | `'Восстановить'`     |
| es     | `'Restaurar'`        |
| de     | `'Wiederherstellen'` |
| fr     | `'Restaurer'`        |
| pt     | `'Restaurar'`        |
| zh     | `'还原'`             |

- [ ] **Step 6: Проверить**

Run: `npm run build`, `npm run tauri dev`.

Ожидается: двойной клик по заголовку разворачивает и восстанавливает; иконка меняется на restore; при переходе в другое окно заголовок и кнопки приглушаются, при возврате — восстанавливаются; на отчёте в заголовке появляется «назад», в списке истории — нет; Esc по-прежнему закрывает отчёт; подсказки читаются на всех 7 языках (проверить хотя бы en/ru).

- [ ] **Step 7: Коммит**

```bash
git add src/components/layout/WindowChrome.tsx src/App.tsx src/features/history/HistoryReportPage.tsx src/styles/manual.css src/core/i18n/locales
git commit -m "feat: add native title bar states and report back button

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: Списки одной поверхностью и нативные настройки

**Files:**

- Modify: `src/components/ui/ScanRow.tsx`
- Modify: `src/features/queue/QueuePage.tsx`
- Modify: `src/features/history/HistoryListPage.tsx`
- Modify: `src/features/dashboard/DashboardPage.tsx`
- Modify: `src/features/settings/SettingsPage.tsx`
- Modify: `src/app/constants/index.ts`
- Modify: `src/core/domain/types.ts`
- Modify: `src/styles/manual.css`
- Modify: `package.json`, `package-lock.json` (удаление зависимости)

**Interfaces:**

- Consumes: `AccentPalette`, `resolveAccentPalette`, `systemAccent` из Task 2.
- Produces (CSS): `.list-surface`, `.settings-section`.

- [ ] **Step 1: Убрать `surface` у строки**

В `ScanRow.tsx` заменить

```ts
const className = ['surface scan-row', ...]
```

на

```ts
const className = ['scan-row', ...]
```

- [ ] **Step 2: Обернуть списки в один surface**

- `QueuePage`: `<div className="list-surface surface">` вокруг `AnimatePresence`.
- `HistoryListPage`: `<div className="history-group-rows list-surface surface">` вокруг `AnimatePresence` (заголовок группы остаётся снаружи).
- `DashboardPage`: `<div className="list list-surface surface">` вокруг `recent`.

CSS:

```css
.list-surface {
  overflow: hidden;
  padding: 4px 0;
}
.list-surface > * + * {
  border-top: 1px solid var(--divider);
}
.scan-row {
  min-height: 64px;
  padding: 8px 12px;
  border-radius: 0;
}
.scan-row:hover {
  background: var(--subtle-hover);
}
```

- Удалить `.history-group-rows` gap, если он создаёт разрывы между строками; между группами оставить `20px`.
- `.surface { border-radius: var(--radius-control); }` — карточки WinUI используют 4 px; `--radius-surface: 8px` остаётся для flyout/меню.

- [ ] **Step 3: Секции настроек**

В `SettingsPage.tsx` добавить локальный компонент:

```tsx
function SettingsSection({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h2>{title}</h2>
      <p>{hint}</p>
      <Card className="settings-card">{children}</Card>
    </section>
  );
}
```

Заменить каждую карточку с `.settings-card-head` на `SettingsSection` с теми же `title`/`hint`; внутри остаются только `.settings-list` и `.settings-actions`. Затронуты секции: Appearance, VirusTotal access, Scanning, Notifications, Integration, System, Logging, About.

CSS:

```css
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.settings-section > h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}
.settings-section > p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 16px;
}
.settings-row {
  min-height: 64px;
  padding: 12px 20px;
}
```

Удалить `.settings-card-head`, `.settings-card-icon` и связанные правила. `settings-screen { gap: 24px; }`.

- [ ] **Step 4: Убрать флаги языков**

- В `SettingsPage` удалить импорты `country-flag-icons`, `ReactElement`, `LanguageFlag`, константу `LANGUAGE_FLAG_ICONS` и `prefix` у опций языка.
- В `src/app/constants/index.ts` убрать `flag` из `LANGUAGES` и удалить `LANGUAGE_FLAG`.
- В `src/core/domain/types.ts` удалить `LanguageFlag`.
- Удалить `.flag-icon` и `.select-prefix` из CSS, если `prefix` больше нигде не используется.
- Run: `npm uninstall country-flag-icons`.

- [ ] **Step 5: Системный образец акцента**

Убедиться, что кнопка System стоит первой в `.accent-swatches` (Task 2) и что строка «Акцент» в новой секции не потерялась при реструктуризации.

- [ ] **Step 6: Проверить**

Run: `npm run build`, `npm run lint`, `npm run format:check`, `npm run tauri dev`.

Ожидается: Queue/History/Overview показывают список как одну карточку с разделителями и hover по строке; строки 64 px; настройки — заголовки над карточками, без иконок в шапке; строки 64 px; флагов нет; System-образец акцента на месте.

- [ ] **Step 7: Коммит**

```bash
git add src/components/ui/ScanRow.tsx src/features/queue/QueuePage.tsx src/features/history/HistoryListPage.tsx src/features/dashboard/DashboardPage.tsx src/features/settings/SettingsPage.tsx src/app/constants/index.ts src/core/domain/types.ts src/styles/manual.css package.json package-lock.json
git commit -m "feat: use native list and settings surfaces

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: Severity-first отчёт и полировка Dashboard

**Files:**

- Modify: `src/features/history/HistoryReportPage.tsx`
- Modify: `src/features/dashboard/DashboardPage.tsx`
- Modify: `src/styles/manual.css`

**Interfaces:**

- Consumes: `StatusIcon`, `Icon size`, `.status-text`/`.engine-status` из Task 3; `clock` из Task 3.

- [ ] **Step 1: Перестроить hero отчёта**

Порядок внутри `Card.history-report-hero`:

1. `.report-verdict` — `StatusIcon` (20–24 px), затем `<h1>{t(report.verdict)}</h1>` (28/36, цвет `var(--tone)`), `<p>{detections} / {total} {t('detections')}</p>`.
2. `.history-report-heading` — иконка файла, имя файла как `<h2>` (20/28 semibold) со ссылкой на VT, метаданные `<small>`.
3. `.history-stats-bar` и `.history-stats-legend` — без изменений.

CSS:

```css
.report-verdict {
  display: flex;
  align-items: center;
  gap: 16px;
}
.report-verdict h1 {
  margin: 0;
  color: var(--tone, var(--text));
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 600;
  line-height: 36px;
}
.report-verdict p {
  margin: 2px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 20px;
}
.report-verdict + .history-report-heading {
  padding-top: 16px;
  border-top: 1px solid var(--divider);
}
```

Удалить старое правило `.history-report-title h1` или переименовать под `h2` (20/28 semibold), чтобы имя файла не конкурировало с вердиктом.

- [ ] **Step 2: Панель действий отчёта**

`.history-report-nav` содержит только действия справа (`open folder`, `open report`, `remove`). Убедиться, что кнопка «назад» удалена (Task 5), а `.history-report-nav { justify-content: flex-end; }`.

- [ ] **Step 3: Dashboard**

- Проверить, что `Icon name="clock"` теперь рендерит `Clock*Regular`, а не `Home24Regular`.
- Drop zone: при `dragging` — `border-color: var(--accent)`, `background: var(--accent-soft)`; без масштабирования.
- `WatchBoard`: числовые значения — `font-variant-numeric: tabular-nums`; заголовки карточек 14/20 semibold.
- Не менять структуру и логику сканирования.

- [ ] **Step 4: Проверить**

Run: `npm run build`, `npm run tauri dev`.

Ожидается: отчёт открывается с крупного цветного вердикта и количества детекций; имя файла ниже; действия справа; на Dashboard иконка часов корректна; drop zone подсвечивается акцентом.

- [ ] **Step 5: Коммит**

```bash
git add src/features/history/HistoryReportPage.tsx src/features/dashboard/DashboardPage.tsx src/styles/manual.css
git commit -m "feat: lead reports with the verdict and polish the dashboard

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: Движение, выделение текста, высокая контрастность, DPI

**Files:**

- Modify: `src/components/ui/ScanRow.tsx`
- Modify: `src/features/history/HistoryReportPage.tsx`
- Modify: `src/styles/manual.css`
- Modify: `src/styles/global.css`

**Interfaces:**

- Consumes: everything above.

- [ ] **Step 1: Привести анимации к WinUI**

- `ScanRow`: transition `{ duration: 0.167, ease: [0.1, 0.9, 0.2, 1] }`, `initial={{ opacity: 0, y: 8 }}`, `exit={{ opacity: 0 }}`; убрать `scale`.
- Движок отчёта (`HistoryReportPage`): те же значения.
- `.page-transition`: `animation: page-enter 167ms cubic-bezier(0.1, 0.9, 0.2, 1) both`; `from { opacity: 0; transform: translateY(8px); }`.
- Flyout/меню: 120–167 мс, без пружин.

- [ ] **Step 2: Разрешить копирование текста**

В `global.css` оставить `user-select: none` для `body`, но добавить:

```css
code,
.history-hash-row code,
.history-report-title h2,
.scan-row-name {
  user-select: text;
  -webkit-user-select: text;
}
```

Для `input`, `textarea` правило уже есть. Проверить, что перетаскивание окна за заголовок не блокируется.

- [ ] **Step 3: Режим высокой контрастности**

Добавить в конец `manual.css`:

```css
@media (forced-colors: active) {
  .manual-app {
    --bg: Canvas;
    --card-bg: Canvas;
    --card-stroke: ButtonBorder;
    --control-bg: Canvas;
    --control-bg-hover: Highlight;
    --control-bg-pressed: Highlight;
    --control-stroke: ButtonBorder;
    --subtle-hover: Highlight;
    --subtle-pressed: Highlight;
    --divider: ButtonBorder;
    --text: CanvasText;
    --text-secondary: CanvasText;
    --text-tertiary: CanvasText;
    --text-disabled: GrayText;
    --accent: Highlight;
    --accent-soft: Canvas;
    --on-accent: HighlightText;
    background: Canvas;
    background-image: none;
  }
  .manual-app.mica {
    background: Canvas;
  }
  .surface,
  .list-surface,
  .settings-card {
    border: 1px solid ButtonBorder;
  }
  .manual-app button:focus-visible,
  .manual-app a:focus-visible,
  .manual-app [role='tab']:focus-visible,
  .manual-app [role='radio']:focus-visible,
  .manual-app [role='option']:focus-visible {
    outline: 2px solid Highlight;
    outline-offset: 2px;
    box-shadow: none;
  }
  .nav-link.active::before,
  .segment.selected::after {
    background: Highlight;
  }
}
```

- [ ] **Step 4: Проверить адаптивность и DPI**

Run: `npm run tauri dev`.

Проверить ширины окна: **1280, 1008, 900, 700, 640, 600, 560 px**. На каждой:

- нет горизонтального скролла и обрезанного текста;
- панель в правильном режиме;
- настройки: строки не наезжают друг на друга, селекты не выходят за карточку;
- отчёт: hero и легенда не ломаются;
- кнопки заголовка не перекрывают заголовок.

Проверить масштаб Windows **100%, 125%, 150%, 200%** и перенос окна на монитор с другим DPI: границы 1 px остаются чёткими, иконки не размываются.

- [ ] **Step 5: Проверить reduced motion и контрастность**

- В Windows включить «Анимационные эффекты» → выкл; убедиться, что анимации почти отсутствуют, интерфейс работает.
- Включить режим высокой контрастности; проверить навигацию, кнопки, карточки, фокус, статусы.

- [ ] **Step 6: Коммит**

```bash
git add src/components/ui/ScanRow.tsx src/features/history/HistoryReportPage.tsx src/styles/manual.css src/styles/global.css
git commit -m "feat: align motion, text selection and high-contrast behavior

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: Документация, версия и финальная проверка

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: version files (через `npm run version:minor`)

**Interfaces:**

- Consumes: все предыдущие задачи.

- [ ] **Step 1: Поднять версию**

Run: `npm run version:minor`
Expected: `0.4.0 → 0.5.0`; скрипт обновляет `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, `AGENTS.md` и вставляет заглушку `## [0.5.0]` в `CHANGELOG.md`.

- [ ] **Step 2: Заполнить CHANGELOG**

Секция `## [0.5.0] - 2026-11-05`:

```markdown
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
```

- [ ] **Step 3: Обновить `AGENTS.md`**

- Строка `Version:` → `0.5.0`.
- Таблица команд: добавить `get_window_backdrop` (Mica/Windows build) и `get_system_accent` (системный акцент).
- Раздел «Design tokens»: Mica как фон окна, `mica`/`micaDark`/`micaLight`, solid fallback, системный акцент `system`, двухцветный фокус, варианты иконок.
- Раздел «Desktop chrome»: режимы NavigationView 320/48/оверлей и breakpoints 1008/641.
- Исправить устаревшую строку про Heroicons в «How to add work safely» на Fluent System Icons и `Icon` с `size`.
- Добавить `docs/superpowers/` в карту репозитория, если она полезна.

- [ ] **Step 4: Обновить `CLAUDE.md`**

- Layout: упомянуть `src/app/utils/navigation.ts`, `src/app/hooks/useWindowBackdrop.ts`, `useSystemAccent.ts`, `src/components/ui/Tooltip.tsx`.
- Architecture: Mica и системный акцент как часть окна; `NavigationPane` режимы.
- Commands: без изменений.
- Rules: не хардкодить акцент; системный акцент — через `resolveAccentPalette`.

- [ ] **Step 5: Полная проверка**

Run:

```bash
npm run lint
npm run format:check
npm run build
npm run check:versions
npm test
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: все команды завершаются с кодом 0; `Versions match 0.5.0`; тесты PASS.

- [ ] **Step 6: Ручная матрица в `npm run tauri dev`**

| Сценарий                 | Ожидание                                          |
| ------------------------ | ------------------------------------------------- |
| Windows 11, светлая тема | Mica светлая, карточки читаемы                    |
| Windows 11, тёмная тема  | Mica тёмная, контраст как в Проводнике            |
| Maximize / restore       | Иконка меняется, окно восстанавливается           |
| Другое окно в фокусе     | Заголовок и кнопки приглушены                     |
| 1200 / 900 / 600 px      | Expanded / compact / overlay                      |
| Стрелки в навигации      | Фокус перемещается, Enter открывает               |
| Отчёт                    | Вердикт сверху, «назад» в заголовке, Esc работает |
| Смена акцента в Windows  | Цвет обновляется после возврата фокуса            |
| Высокая контрастность    | Все границы и фокус видны                         |
| Масштаб 150%             | Нет размытых границ и обрезанного текста          |

- [ ] **Step 7: Коммит**

```bash
git add CHANGELOG.md AGENTS.md CLAUDE.md package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "chore: release 0.5.0 native fidelity pass

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Проверка плана

- Каждая задача заканчивается независимо проверяемым результатом и коммитом.
- Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9; зависимости по интерфейсам указаны в блоках **Interfaces**.
- Тестами покрыты: gating Mica по build, палитра акцента и контраст, breakpoints и клавиатура навигации, парсинг DWM ARGB.
- Ручными проверками покрыты: Win10 fallback, Mica, maximize/restore, DPI, высокая контрастность, reduced motion.
- Snap Layouts сознательно вынесены за границы: требуют subclassing `WM_NCHITTEST` и отдельного спайка.

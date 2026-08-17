import type { AccentColor, AppSettings, Language, LanguageFlag, LogLevel, ThemeMode } from '@/core/domain/types';

export const VIEWS = ['dashboard', 'queue', 'history', 'settings'] as const;
export type View = (typeof VIEWS)[number];

export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];

export const LANGUAGES: ReadonlyArray<{ value: Language; label: string; flag: LanguageFlag }> = [
  { value: 'en', label: 'English', flag: 'us' },
  { value: 'ru', label: 'Русский', flag: 'ru' },
  { value: 'es', label: 'Español', flag: 'es' },
  { value: 'de', label: 'Deutsch', flag: 'de' },
  { value: 'fr', label: 'Français', flag: 'fr' },
  { value: 'pt', label: 'Português', flag: 'pt' },
  { value: 'zh', label: '中文', flag: 'cn' },
];

export const LANGUAGE_FLAG: Record<Language, LanguageFlag> = LANGUAGES.reduce(
  (acc, language) => ({ ...acc, [language.value]: language.flag }),
  {} as Record<Language, LanguageFlag>,
);

export const LOG_LEVELS: LogLevel[] = ['off', 'error', 'warn', 'info', 'debug', 'trace'];

export const POLL_INTERVAL_MIN = 1;
export const POLL_INTERVAL_MAX = 60;
export const POLL_INTERVALS = [3, 5, 10, 15, 30];

export interface AccentPalette {
  teal: string;
  tealDeep: string;
  onTeal: string;
}

export interface AccentOption {
  value: AccentColor;
  dark: AccentPalette;
  light: AccentPalette;
}

export const ACCENT_COLORS: AccentOption[] = [
  {
    value: 'vt',
    dark: { teal: '#86aaf9', tealDeep: '#86aaf9', onTeal: '#0d1233' },
    light: { teal: '#86aaf9', tealDeep: '#86aaf9', onTeal: '#0d1233' },
  },
  {
    value: 'teal',
    dark: { teal: '#a4e6d9', tealDeep: '#76d3c2', onTeal: '#073b36' },
    light: { teal: '#216c63', tealDeep: '#286c67', onTeal: '#ffffff' },
  },
  {
    value: 'blue',
    dark: { teal: '#9dc8ff', tealDeep: '#6fb1ff', onTeal: '#0a2742' },
    light: { teal: '#1460c8', tealDeep: '#1256b8', onTeal: '#ffffff' },
  },
  {
    value: 'violet',
    dark: { teal: '#c9b8ff', tealDeep: '#a98df5', onTeal: '#221244' },
    light: { teal: '#6a3fe0', tealDeep: '#5d35c9', onTeal: '#ffffff' },
  },
  {
    value: 'rose',
    dark: { teal: '#ffb8c6', tealDeep: '#ff8fa6', onTeal: '#47111f' },
    light: { teal: '#c2185b', tealDeep: '#ab1551', onTeal: '#ffffff' },
  },
  {
    value: 'amber',
    dark: { teal: '#ffd79e', tealDeep: '#ffbb55', onTeal: '#3d2600' },
    light: { teal: '#8a5a00', tealDeep: '#7a4f00', onTeal: '#ffffff' },
  },
];

export function getAccentPalette(accent: AccentColor, theme: ThemeMode): AccentPalette {
  const option = ACCENT_COLORS.find((item) => item.value === accent) ?? ACCENT_COLORS[0];
  return theme === 'light' ? option.light : option.dark;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  accent: 'vt',
  language: 'en',
  pollInterval: 5,
  hasApiKey: false,
  logLevel: 'info',
  scanImmediately: true,
  closeToTray: true,
  startMinimized: false,
};

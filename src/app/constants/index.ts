import type { AppSettings, Language, LogLevel } from '@/core/domain/types';
import { detectPreferredLanguage } from '@/core/i18n/resolveLanguage';

export const VIEWS = ['dashboard', 'queue', 'history', 'settings'] as const;
export type View = (typeof VIEWS)[number];

export const LANGUAGES: ReadonlyArray<{ value: Language; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'pt', label: 'Português' },
  { value: 'zh', label: '中文' },
];

export const LOG_LEVELS: LogLevel[] = ['off', 'error', 'warn', 'info', 'debug', 'trace'];

export const POLL_INTERVAL_MIN = 1;
export const POLL_INTERVAL_MAX = 60;
export const POLL_INTERVALS = [3, 5, 10, 15, 30];

export interface AccentPalette {
  teal: string;
  tealDeep: string;
  onTeal: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: detectPreferredLanguage(),
  pollInterval: 5,
  hasApiKey: false,
  logLevel: 'info',
  scanImmediately: true,
  closeToTray: true,
  startMinimized: false,
  notificationsEnabled: true,
  notifyOnCompleted: true,
  notifyOnFailed: true,
  contextMenuEnabled: false,
};

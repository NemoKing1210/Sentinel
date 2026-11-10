import type { Verdict, WatchNotifyMode, WatchRule } from './types';

export const WATCH_MAX_FOLDERS = 32;
export const WATCH_MAX_SIZE_BYTES = 681_574_400;
export const WATCH_MIN_SETTLE_MS = 500;
export const WATCH_MAX_SETTLE_MS = 10_000;

const MAX_WATCH_DEPTH = 64;
const ABSOLUTE_WINDOWS_PATH = /^(?:[A-Za-z]:[\\/]|\\\\)/;
const EXTENSION_PATTERN = /^[a-z0-9+_-]+$/;
const NOTIFY_MODES: ReadonlySet<WatchNotifyMode> = new Set(['all', 'threats', 'none']);

export const DEFAULT_WATCH_RULE: Omit<WatchRule, 'id' | 'path'> = {
  enabled: true,
  maxDepth: null,
  includeExtensions: [],
  excludeExtensions: [],
  ignoreHidden: true,
  ignoreTemp: true,
  minSizeBytes: 0,
  maxSizeBytes: WATCH_MAX_SIZE_BYTES,
  settleMs: 1_500,
  scanMissedWhileClosed: false,
  notify: 'threats',
};

/** Lowercase extension without the leading dot, or null when it is not a plain extension. */
export function normalizeExtension(value: string): string | null {
  const normalized = value.trim().replace(/^\.+/, '').toLowerCase();
  return normalized && EXTENSION_PATTERN.test(normalized) ? normalized : null;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const candidate = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, candidate));
}

function sanitizeDepth(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const depth = Math.round(value);
  return depth >= 1 && depth <= MAX_WATCH_DEPTH ? depth : null;
}

function sanitizeExtensions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const extension = normalizeExtension(entry);
    if (extension && !result.includes(extension)) result.push(extension);
  }
  return result;
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeNotify(value: unknown): WatchNotifyMode {
  return typeof value === 'string' && NOTIFY_MODES.has(value as WatchNotifyMode)
    ? (value as WatchNotifyMode)
    : DEFAULT_WATCH_RULE.notify;
}

/** Builds a rule from untrusted persisted JSON; null means the record is unusable. */
export function sanitizeWatchRule(value: unknown): WatchRule | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const path = typeof raw.path === 'string' ? raw.path.trim() : '';
  if (!id || !path || !ABSOLUTE_WINDOWS_PATH.test(path)) return null;

  const minSizeBytes = clampInteger(raw.minSizeBytes, 0, WATCH_MAX_SIZE_BYTES, DEFAULT_WATCH_RULE.minSizeBytes);
  const maxSizeBytes = clampInteger(raw.maxSizeBytes, 1, WATCH_MAX_SIZE_BYTES, DEFAULT_WATCH_RULE.maxSizeBytes);

  return {
    id,
    path,
    enabled: sanitizeBoolean(raw.enabled, DEFAULT_WATCH_RULE.enabled),
    maxDepth: sanitizeDepth(raw.maxDepth),
    includeExtensions: sanitizeExtensions(raw.includeExtensions),
    excludeExtensions: sanitizeExtensions(raw.excludeExtensions),
    ignoreHidden: sanitizeBoolean(raw.ignoreHidden, DEFAULT_WATCH_RULE.ignoreHidden),
    ignoreTemp: sanitizeBoolean(raw.ignoreTemp, DEFAULT_WATCH_RULE.ignoreTemp),
    minSizeBytes: Math.min(minSizeBytes, maxSizeBytes),
    maxSizeBytes,
    settleMs: clampInteger(raw.settleMs, WATCH_MIN_SETTLE_MS, WATCH_MAX_SETTLE_MS, DEFAULT_WATCH_RULE.settleMs),
    scanMissedWhileClosed: sanitizeBoolean(raw.scanMissedWhileClosed, DEFAULT_WATCH_RULE.scanMissedWhileClosed),
    notify: sanitizeNotify(raw.notify),
  };
}

function pathComponents(path: string): string[] {
  return path.toLowerCase().replace(/\//g, '\\').replace(/\\+$/, '').split('\\').filter(Boolean);
}

/** True when either path is the same as or nested inside the other. Case-insensitive (Windows-only app). */
export function watchPathsOverlap(a: string, b: string): boolean {
  const left = pathComponents(a);
  const right = pathComponents(b);
  const shared = Math.min(left.length, right.length);
  if (shared === 0) return false;
  for (let index = 0; index < shared; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/** Whether a completed scan should raise a notification under the folder's rule. */
export function shouldNotifyWatch(rule: WatchRule, verdict: Verdict): boolean {
  if (rule.notify === 'none') return false;
  if (rule.notify === 'all') return true;
  return verdict === 'malicious' || verdict === 'suspicious';
}

/** Display name for a watched folder: its last segment, keeping a drive root intact. */
export function watchFolderName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  if (parts.length === 0) return path;
  const [first] = parts;
  if (parts.length === 1 && /^[A-Za-z]:$/.test(first)) return `${first}\\`;
  return parts[parts.length - 1];
}

/** Restores persisted rules, dropping invalid, duplicate and overlapping records. */
export function sanitizeWatchedFolders(value: unknown): WatchRule[] {
  if (!Array.isArray(value)) return [];
  const result: WatchRule[] = [];
  for (const entry of value) {
    const rule = sanitizeWatchRule(entry);
    if (!rule) continue;
    if (result.some((existing) => existing.id === rule.id)) continue;
    if (result.some((existing) => watchPathsOverlap(existing.path, rule.path))) continue;
    result.push(rule);
    if (result.length >= WATCH_MAX_FOLDERS) break;
  }
  return result;
}

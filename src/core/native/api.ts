import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { ask, open } from '@tauri-apps/plugin-dialog';
import type {
  EngineCategory,
  FileReport,
  LogLevel,
  ScanItem,
  WatchPendingFile,
  WatchRule,
  WatchStatus,
} from '../domain/types';
import { detectFileKind, detectMimeType } from '@/app/utils/fileKind';
import {
  analysisPhase,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_SCAN_TIMEOUT_MS,
  MAX_POLL_INTERVAL_MS,
  MIN_POLL_INTERVAL_MS,
  pollAttempts,
  pollProgress,
} from '@/app/utils/scanPolling';
import { toScanError } from './scanError';

const isTauri = Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
const bytes = (value: number) => value;

function normalizeSelection(selection: string | string[] | null): string[] {
  if (!selection) return [];
  return Array.isArray(selection) ? selection.filter(Boolean) : [selection];
}

export async function pickFiles(): Promise<string[]> {
  if (isTauri) return normalizeSelection(await open({ multiple: true, directory: false }));
  return [];
}

export async function pickFolder(): Promise<string[]> {
  if (isTauri) {
    const path = await open({ directory: true, multiple: false });
    return path ? [path as string] : [];
  }
  return [];
}

export interface PickedPath {
  path: string;
  isFolder: boolean;
}

async function detectIsFolder(path: string): Promise<boolean> {
  try {
    const metadata = await getPathMetadata(path);
    return metadata.is_dir;
  } catch {
    return false;
  }
}

export async function detectPaths(paths: string[]): Promise<PickedPath[]> {
  return Promise.all(paths.map(async (path) => ({ path, isFolder: await detectIsFolder(path) })));
}

export async function pickPath(): Promise<PickedPath[]> {
  if (!isTauri) return [];
  return detectPaths(normalizeSelection(await open({ multiple: true })));
}

export async function saveApiKey(key: string): Promise<void> {
  const normalized = key.trim();
  if (!normalized) throw new Error('API key cannot be empty');
  if (isTauri) await invoke('save_api_key', { key: normalized });
}

export async function hasSavedApiKey(): Promise<boolean> {
  if (!isTauri) return false;
  return invoke<boolean>('has_saved_api_key');
}

export async function getApiKey(): Promise<string> {
  if (!isTauri) return '';
  return invoke<string>('get_api_key');
}

export async function validateApiKey(): Promise<boolean> {
  if (isTauri) return invoke<boolean>('validate_api_key');
  return true;
}

export async function getLogLevel(): Promise<LogLevel> {
  if (!isTauri) return 'info';
  return invoke<LogLevel>('get_log_level');
}
export async function setLogLevel(level: LogLevel): Promise<void> {
  if (isTauri) await invoke('set_log_level', { level });
}
export async function openLogDirectory(): Promise<void> {
  if (isTauri) await invoke('open_log_directory');
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri) {
    await invoke('open_external_url', { url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function isNativeRuntime(): boolean {
  return isTauri;
}

export interface InternalBrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type InternalBrowserAction = 'back' | 'forward' | 'reload';

export interface InternalBrowserLoad {
  url: string;
  phase: 'started' | 'finished';
}

/**
 * The embedded webview is a native surface owned by Rust, so open/close calls
 * must not overtake each other (React Strict Mode mounts effects twice).
 */
let browserQueue: Promise<unknown> = Promise.resolve();

function enqueueBrowserCommand<T>(command: () => Promise<T>): Promise<T> {
  const run = browserQueue.then(command, command);
  browserQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function openInternalBrowser(url: string, bounds: InternalBrowserBounds): Promise<void> {
  if (!isTauri) return Promise.resolve();
  return enqueueBrowserCommand(() => invoke('open_internal_browser', { url, bounds }));
}

export function setInternalBrowserBounds(bounds: InternalBrowserBounds): Promise<void> {
  if (!isTauri) return Promise.resolve();
  return enqueueBrowserCommand(() => invoke('set_internal_browser_bounds', { bounds }));
}

export function internalBrowserAction(action: InternalBrowserAction): Promise<void> {
  if (!isTauri) return Promise.resolve();
  return enqueueBrowserCommand(() => invoke('internal_browser_action', { action }));
}

export function closeInternalBrowser(): Promise<void> {
  if (!isTauri) return Promise.resolve();
  return enqueueBrowserCommand(() => invoke('close_internal_browser'));
}

export async function listenInternalBrowserLoad(handler: (event: InternalBrowserLoad) => void): Promise<() => void> {
  if (!isTauri) return () => undefined;
  return listen<InternalBrowserLoad>('internal-browser:page-load', (event) => handler(event.payload));
}

export async function fileExists(path: string): Promise<boolean> {
  if (!isTauri) return false;
  return invoke<boolean>('file_exists', { path });
}

export async function openFolderContaining(path: string): Promise<void> {
  if (isTauri) await invoke('open_folder_containing', { path });
}

export async function getFileIcon(path: string): Promise<string | null> {
  if (!isTauri) return null;
  return invoke<string | null>('get_file_icon', { path });
}

export interface WindowBackdropInfo {
  mica: boolean;
  build: number;
}

export async function getWindowBackdrop(): Promise<WindowBackdropInfo> {
  if (!isTauri) return { mica: false, build: 0 };
  return invoke<WindowBackdropInfo>('get_window_backdrop');
}

export async function getSystemAccent(): Promise<string> {
  if (!isTauri) return '#0078d4';
  return invoke<string>('get_system_accent');
}

export interface ConfirmActionOptions {
  title: string;
  message: string;
  kind?: 'info' | 'warning' | 'error';
  okLabel?: string;
  cancelLabel?: string;
}

export async function confirmAction(options: ConfirmActionOptions): Promise<boolean> {
  if (!isTauri) return window.confirm(options.message);
  try {
    return Boolean(
      await ask(options.message, {
        title: options.title,
        kind: options.kind ?? 'warning',
        okLabel: options.okLabel,
        cancelLabel: options.cancelLabel,
      }),
    );
  } catch (error) {
    void logEvent('error', 'dialog.confirm_failed', { error: String(error) }).catch(() => undefined);
    return window.confirm(options.message);
  }
}

export async function logEvent(level: LogLevel, event: string, fields?: Record<string, unknown>): Promise<void> {
  if (isTauri) await invoke('log_event', { level, event, fields: fields ?? {} });
}

export async function setCloseToTray(enabled: boolean): Promise<void> {
  if (isTauri) await invoke('set_close_to_tray', { enabled });
}

export async function getAutostart(): Promise<boolean> {
  if (!isTauri) return false;
  return invoke<boolean>('get_autostart');
}

export async function setAutostart(enabled: boolean): Promise<void> {
  if (isTauri) await invoke('set_autostart', { enabled });
}

export interface TrayMenuLabels {
  show: string;
  dashboard: string;
  queue: string;
  queue_count: string;
  history: string;
  settings: string;
  scan_file: string;
  scan_folder: string;
  active_count: string;
  recent_count: string;
  no_active: string;
  no_recent: string;
  quit: string;
  status_queued: string;
  status_uploading: string;
  status_scanning: string;
  verdict_clean: string;
  verdict_suspicious: string;
  verdict_malicious: string;
  verdict_unknown: string;
}

export interface TrayActiveItem {
  id: string;
  name: string;
  status: string;
  progress: number;
}

export interface TrayRecentItem {
  item_id: string;
  name: string;
  verdict: string;
  detections: number;
  total: number;
}

export async function updateTrayState(
  labels: TrayMenuLabels,
  active: TrayActiveItem[],
  recent: TrayRecentItem[],
): Promise<void> {
  if (!isTauri) return;
  await invoke('update_tray_state', {
    labels: JSON.stringify(labels),
    active: JSON.stringify(active),
    recent: JSON.stringify(recent),
  });
}

export async function isWindowsPlatform(): Promise<boolean> {
  if (!isTauri) return false;
  return (await invoke<string>('platform_name')) === 'windows';
}

export async function registerContextMenu(): Promise<void> {
  if (isTauri) await invoke('register_context_menu');
}

export async function unregisterContextMenu(): Promise<void> {
  if (isTauri) await invoke('unregister_context_menu');
}

export async function isContextMenuRegistered(): Promise<boolean> {
  if (!isTauri) return false;
  return invoke<boolean>('is_context_menu_registered');
}

export async function getPendingScanPaths(): Promise<string[]> {
  if (!isTauri) return [];
  return invoke<string[]>('get_pending_scan_paths');
}

export async function isWindowFocused(): Promise<boolean> {
  if (!isTauri) return true;
  return getCurrentWindow().isFocused();
}

export interface NativeScanNotification {
  title: string;
  body: string;
  itemId: string;
  actionLabel?: string;
}

export async function showNativeScanNotification(notification: NativeScanNotification): Promise<void> {
  if (!isTauri) return;
  await invoke('notify_scan_result', {
    title: notification.title,
    body: notification.body,
    itemId: notification.itemId,
    actionLabel: notification.actionLabel ?? null,
  });
}

export async function subscribeToFileDrops(
  onDrop: (paths: string[]) => void,
  onDragging: (dragging: boolean) => void,
): Promise<() => void> {
  if (!isTauri) return () => undefined;
  const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === 'enter' || event.payload.type === 'over') onDragging(true);
    if (event.payload.type === 'leave') onDragging(false);
    if (event.payload.type === 'drop') {
      onDragging(false);
      onDrop(event.payload.paths);
    }
  });
  return unlisten;
}

export interface ScanProgress {
  onProgress?: (progress: number) => void;
  /** Poll cadence in milliseconds; defaults to 5 s. */
  pollIntervalMs?: number;
  /** Whole-analysis budget; defaults to 5 minutes. */
  timeoutMs?: number;
}

interface AnalysisResult {
  engine_name?: string;
  category?: string;
  result?: string | null;
  engine_update?: string;
}

interface AnalysisAttributes {
  status?: string;
  stats?: Partial<Record<'malicious' | 'suspicious' | 'undetected' | 'harmless', number>>;
  results?: Record<string, AnalysisResult>;
}

interface AnalysisResponse {
  data?: { attributes?: AnalysisAttributes };
}

const ENGINE_CATEGORIES: ReadonlySet<string> = new Set([
  'malicious',
  'suspicious',
  'undetected',
  'harmless',
  'type-unsupported',
  'failure',
  'timeout',
  'confirmed-timeout',
]);

/** VirusTotal may add categories; an unknown one must not read as "clean". */
function toEngineCategory(value: unknown): EngineCategory {
  return typeof value === 'string' && ENGINE_CATEGORIES.has(value) ? (value as EngineCategory) : 'failure';
}

export async function scanPath(
  path: string,
  isFolder = false,
  options: ScanProgress = {},
): Promise<{ analysisId: string; report: FileReport }> {
  if (isTauri) {
    let upload: { analysis_id: string; sha256: string };
    try {
      upload = await (isFolder
        ? invoke<{ analysis_id: string; sha256: string }>('submit_archive', { paths: [path] })
        : invoke<{ analysis_id: string; sha256: string }>('submit_file', { path }));
    } catch (error) {
      throw toScanError(error);
    }
    options.onProgress?.(35);
    const intervalMs = Math.min(
      MAX_POLL_INTERVAL_MS,
      Math.max(MIN_POLL_INTERVAL_MS, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS),
    );
    const attempts = pollAttempts(intervalMs, options.timeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS);
    let analysis: AnalysisResponse | null = null;
    let phase: ReturnType<typeof analysisPhase> = 'pending';
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        analysis = await invoke<AnalysisResponse>('get_analysis_status', { analysisId: upload.analysis_id });
      } catch (error) {
        throw toScanError(error);
      }
      phase = analysisPhase(analysis?.data?.attributes?.status);
      if (phase === 'completed') break;
      if (phase === 'failed') throw new Error('VirusTotal analysis failed');
      options.onProgress?.(pollProgress(attempt, attempts));
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
    if (phase !== 'completed') {
      throw new Error('VirusTotal analysis timed out');
    }
    const attrs = analysis?.data?.attributes ?? {};
    const stats = attrs.stats ?? {};
    const results = Object.values(attrs.results ?? {});
    const report: FileReport = {
      itemId: upload.analysis_id,
      name: path.split(/[\\/]/).pop() || 'upload',
      path,
      size: 0,
      type: isFolder ? 'application/zip' : 'application/octet-stream',
      sha256: upload.sha256,
      sha1: '',
      md5: '',
      verdict: (stats.malicious ?? 0) > 0 ? 'malicious' : (stats.suspicious ?? 0) > 0 ? 'suspicious' : 'clean',
      stats: {
        malicious: stats.malicious || 0,
        suspicious: stats.suspicious || 0,
        undetected: stats.undetected || 0,
        harmless: stats.harmless || 0,
      },
      engines: results.map((result) => ({
        name: result.engine_name || 'Unknown',
        category: toEngineCategory(result.category),
        result: result.result || null,
        update: result.engine_update || '',
      })),
      vtUrl: `https://www.virustotal.com/gui/file/${upload.sha256}/detection`,
      scannedAt: new Date().toISOString(),
    };
    return { analysisId: upload.analysis_id, report };
  }
  await new Promise((resolve) => setTimeout(resolve, 900));
  const id = crypto.randomUUID();
  const hash = 'a7f3c1d9e40b7d3f5c8a92f11b9a2e6c1d4f8a73c9e2b1d6f0a4c8e9b2d7f1a';
  return {
    analysisId: id,
    report: {
      itemId: id,
      name: path.split(/[\\/]/).pop() || 'sample.bin',
      path,
      size: bytes(348160),
      type: 'application/octet-stream',
      sha256: hash,
      sha1: hash.slice(0, 40),
      md5: hash.slice(0, 32),
      verdict: 'clean',
      stats: { malicious: 0, suspicious: 0, undetected: 4, harmless: 67 },
      engines: ['Microsoft', 'Kaspersky', 'BitDefender', 'ESET', 'Avast'].map((name) => ({
        name,
        category: 'undetected',
        result: null,
        update: '2026-08-16',
      })),
      vtUrl: `https://www.virustotal.com/gui/file/${hash}/detection`,
      scannedAt: new Date().toISOString(),
    },
  };
}

export function syncWatchRules(rules: WatchRule[]): Promise<WatchStatus[]> {
  if (!isTauri) return Promise.resolve([]);
  return invoke<WatchStatus[]>('sync_watch_rules', { rules });
}

export function getWatchStatuses(): Promise<WatchStatus[]> {
  if (!isTauri) return Promise.resolve([]);
  return invoke<WatchStatus[]>('get_watch_statuses');
}

export function drainWatchSpool(): Promise<WatchPendingFile[]> {
  if (!isTauri) return Promise.resolve([]);
  return invoke<WatchPendingFile[]>('drain_watch_spool');
}

export function ackWatchSpool(ids: string[]): Promise<void> {
  if (!isTauri) return Promise.resolve();
  return invoke('ack_watch_spool', { ids });
}

export async function listenWatchDetected(handler: (file: WatchPendingFile) => void): Promise<UnlistenFn> {
  if (!isTauri) return () => undefined;
  return listen<WatchPendingFile>('watch:file-detected', (event) => handler(event.payload));
}

export async function listenWatchStatus(handler: (statuses: WatchStatus[]) => void): Promise<UnlistenFn> {
  if (!isTauri) return () => undefined;
  return listen<WatchStatus[]>('watch:status', (event) => handler(event.payload));
}

interface PathMetadata {
  size: number;
  file_count: number;
  modified_at: number;
  is_dir: boolean;
}

export async function getPathMetadata(path: string): Promise<PathMetadata> {
  if (!isTauri) return { size: 0, file_count: 0, modified_at: 0, is_dir: false };
  return invoke<PathMetadata>('get_path_metadata', { path });
}

export async function pathToItem(path: string, folder = false): Promise<ScanItem> {
  const displayName = folder ? `${path.split(/[\\/]/).pop() || 'folder'}.zip` : path.split(/[\\/]/).pop() || path;
  let size = 0;
  let fileCount: number | undefined;
  try {
    const metadata = await getPathMetadata(path);
    size = metadata.size;
    fileCount = metadata.file_count;
  } catch {
    /* keep zero defaults */
  }
  return {
    id: crypto.randomUUID(),
    name: displayName,
    isFolder: folder,
    path,
    size,
    type: detectMimeType(displayName, folder),
    fileKind: folder ? 'folder' : detectFileKind(displayName),
    fileCount: folder ? fileCount : undefined,
    status: 'queued',
    progress: 0,
    createdAt: new Date().toISOString(),
  };
}

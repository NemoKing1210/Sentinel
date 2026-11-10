export type Language = 'en' | 'ru' | 'es' | 'de' | 'fr' | 'pt' | 'zh';
export type ColorScheme = 'light' | 'dark';
export type LogLevel = 'off' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
export type ScanStatus = 'waiting' | 'queued' | 'uploading' | 'scanning' | 'completed' | 'failed';
export type Verdict = 'clean' | 'suspicious' | 'malicious' | 'unknown';
export type ReportOpenTarget = 'internal' | 'external';
export type WatchNotifyMode = 'all' | 'threats' | 'none';
export type WatchState = 'disabled' | 'indexing' | 'watching' | 'missing' | 'error';

export interface WatchRule {
  id: string;
  path: string;
  enabled: boolean;
  maxDepth: number | null;
  includeExtensions: string[];
  excludeExtensions: string[];
  ignoreHidden: boolean;
  ignoreTemp: boolean;
  minSizeBytes: number;
  maxSizeBytes: number;
  settleMs: number;
  scanMissedWhileClosed: boolean;
  notify: WatchNotifyMode;
}

export interface WatchStatus {
  watchId: string;
  state: WatchState;
  error?: string;
}

export interface WatchPendingFile {
  id: string;
  watchId: string;
  path: string;
  size: number;
  modifiedAt: number;
  detectedAt: number;
}

export type FileKind =
  | 'folder'
  | 'archive'
  | 'image'
  | 'video'
  | 'audio'
  | 'code'
  | 'executable'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'font'
  | 'disk'
  | 'database'
  | 'text'
  | 'unknown';

export interface ScanItem {
  id: string;
  name: string;
  path?: string;
  size: number;
  type: string;
  fileKind: FileKind;
  isFolder?: boolean;
  fileCount?: number;
  status: ScanStatus;
  progress: number;
  verdict?: Verdict;
  detections?: number;
  engines?: number;
  sha256?: string;
  analysisId?: string;
  error?: string;
  createdAt: string;
  origin?: 'manual' | 'watch';
  autoStart?: boolean;
  watchId?: string;
  watchName?: string;
  retryAt?: string;
  retryCount?: number;
}

export type EngineCategory =
  | 'malicious'
  | 'suspicious'
  | 'undetected'
  | 'harmless'
  | 'type-unsupported'
  | 'failure'
  | 'timeout'
  | 'confirmed-timeout';

export interface EngineResult {
  name: string;
  category: EngineCategory;
  result: string | null;
  update: string;
}

export interface FileReport {
  itemId: string;
  name: string;
  path?: string;
  size: number;
  type: string;
  fileKind?: FileKind;
  sha256: string;
  sha1: string;
  md5: string;
  verdict: Verdict;
  stats: { malicious: number; suspicious: number; undetected: number; harmless: number };
  engines: EngineResult[];
  vtUrl: string;
  scannedAt: string;
  watchId?: string;
  watchName?: string;
}

export interface AppSettings {
  language: Language;
  pollInterval: number;
  hasApiKey: boolean;
  logLevel: LogLevel;
  scanImmediately: boolean;
  closeToTray: boolean;
  autostart: boolean;
  startMinimized: boolean;
  notificationsEnabled: boolean;
  notifyOnCompleted: boolean;
  notifyOnFailed: boolean;
  contextMenuEnabled: boolean;
  reportOpenTarget: ReportOpenTarget;
  scanConcurrency: number;
  scanDelaySeconds: number;
}

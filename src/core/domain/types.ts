export type Language = 'en' | 'ru' | 'es' | 'de' | 'fr' | 'pt' | 'zh';
export type LanguageFlag = 'us' | 'ru' | 'es' | 'de' | 'fr' | 'pt' | 'cn';
export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentColor = 'vt' | 'teal' | 'blue' | 'violet' | 'rose' | 'amber';
export type LogLevel = 'off' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
export type ScanStatus = 'queued' | 'uploading' | 'scanning' | 'completed' | 'failed';
export type Verdict = 'clean' | 'suspicious' | 'malicious' | 'unknown';

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
}

export interface EngineResult {
  name: string;
  category: 'malicious' | 'suspicious' | 'undetected' | 'harmless' | 'type-unsupported';
  result: string | null;
  update: string;
}

export interface FileReport {
  itemId: string;
  name: string;
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
}

export interface AppSettings {
  theme: ThemeMode;
  accent: AccentColor;
  language: Language;
  pollInterval: number;
  hasApiKey: boolean;
  logLevel: LogLevel;
  scanImmediately: boolean;
  closeToTray: boolean;
  startMinimized: boolean;
}

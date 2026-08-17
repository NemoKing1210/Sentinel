import { useCallback, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { logError, logInfo, logWarn } from '@/core/logging';

export type ToastLevel = 'info' | 'success' | 'warn' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title: string;
  description?: string;
  icon?: string;
  level?: ToastLevel;
  duration?: number;
  action?: ToastAction;
}

export interface ActiveToast {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  level: ToastLevel;
  duration: number;
  action?: ToastAction;
  createdAt: number;
}

export type ToastPreset =
  | 'filesAdded'
  | 'folderAdded'
  | 'filePickFailed'
  | 'folderPickFailed'
  | 'pathPickFailed'
  | 'scanStarted'
  | 'scanCompleted'
  | 'scanFailed'
  | 'scanNoKey'
  | 'apiKeySaved'
  | 'apiKeySaveFailed'
  | 'apiKeyReadFailed'
  | 'apiKeyEmpty'
  | 'connectionVerified'
  | 'connectionFailed'
  | 'connectionCheckFailed'
  | 'logLevelSaved'
  | 'logLevelFailed'
  | 'logFolderOpened'
  | 'logFolderFailed'
  | 'languageChanged'
  | 'themeChanged'
  | 'accentChanged'
  | 'pollIntervalChanged'
  | 'queueCleared'
  | 'hashCopied'
  | 'copyFailed'
  | 'historyCleared'
  | 'reportRemoved'
  | 'reportMissing'
  | 'vtOpenFailed';

interface PresetDescriptor {
  icon: string;
  level: ToastLevel;
  titleKey: string;
  descKey?: string;
  duration?: number;
}

const PRESETS: Record<ToastPreset, PresetDescriptor> = {
  filesAdded: { icon: 'upload', level: 'info', titleKey: 'toast.filesAdded.title' },
  folderAdded: {
    icon: 'folder',
    level: 'info',
    titleKey: 'toast.folderAdded.title',
    descKey: 'toast.folderAdded.desc',
  },
  filePickFailed: {
    icon: 'alert',
    level: 'error',
    titleKey: 'toast.filePickFailed.title',
    descKey: 'toast.filePickFailed.desc',
  },
  folderPickFailed: {
    icon: 'alert',
    level: 'error',
    titleKey: 'toast.folderPickFailed.title',
    descKey: 'toast.folderPickFailed.desc',
  },
  pathPickFailed: {
    icon: 'alert',
    level: 'error',
    titleKey: 'toast.pathPickFailed.title',
    descKey: 'toast.pathPickFailed.desc',
  },
  scanStarted: {
    icon: 'shield',
    level: 'info',
    titleKey: 'toast.scanStarted.title',
    descKey: 'toast.scanStarted.desc',
    duration: 3200,
  },
  scanCompleted: {
    icon: 'shield',
    level: 'success',
    titleKey: 'toast.scanCompleted.title',
    descKey: 'toast.scanCompleted.desc',
  },
  scanFailed: {
    icon: 'alert',
    level: 'error',
    titleKey: 'toast.scanFailed.title',
    descKey: 'toast.scanFailed.desc',
  },
  scanNoKey: {
    icon: 'key',
    level: 'warn',
    titleKey: 'toast.scanNoKey.title',
    descKey: 'toast.scanNoKey.desc',
  },
  apiKeySaved: {
    icon: 'key',
    level: 'success',
    titleKey: 'toast.apiKeySaved.title',
    descKey: 'toast.apiKeySaved.desc',
  },
  apiKeySaveFailed: {
    icon: 'alert',
    level: 'error',
    titleKey: 'toast.apiKeySaveFailed.title',
    descKey: 'toast.apiKeySaveFailed.desc',
  },
  apiKeyReadFailed: {
    icon: 'alert',
    level: 'error',
    titleKey: 'toast.apiKeyReadFailed.title',
    descKey: 'toast.apiKeyReadFailed.desc',
  },
  apiKeyEmpty: {
    icon: 'key',
    level: 'warn',
    titleKey: 'toast.apiKeyEmpty.title',
    descKey: 'toast.apiKeyEmpty.desc',
  },
  connectionVerified: {
    icon: 'check',
    level: 'success',
    titleKey: 'toast.connectionVerified.title',
    descKey: 'toast.connectionVerified.desc',
  },
  connectionFailed: {
    icon: 'alert',
    level: 'warn',
    titleKey: 'toast.connectionFailed.title',
    descKey: 'toast.connectionFailed.desc',
  },
  connectionCheckFailed: {
    icon: 'alert',
    level: 'error',
    titleKey: 'toast.connectionCheckFailed.title',
    descKey: 'toast.connectionCheckFailed.desc',
  },
  logLevelSaved: {
    icon: 'doc',
    level: 'success',
    titleKey: 'toast.logLevelSaved.title',
    descKey: 'toast.logLevelSaved.desc',
  },
  logLevelFailed: {
    icon: 'alert',
    level: 'error',
    titleKey: 'toast.logLevelFailed.title',
    descKey: 'toast.logLevelFailed.desc',
  },
  logFolderOpened: {
    icon: 'folder',
    level: 'info',
    titleKey: 'toast.logFolderOpened.title',
    descKey: 'toast.logFolderOpened.desc',
  },
  logFolderFailed: {
    icon: 'alert',
    level: 'error',
    titleKey: 'toast.logFolderFailed.title',
    descKey: 'toast.logFolderFailed.desc',
  },
  languageChanged: { icon: 'check', level: 'info', titleKey: 'toast.languageChanged.title', duration: 2400 },
  themeChanged: { icon: 'check', level: 'info', titleKey: 'toast.themeChanged.title', duration: 2400 },
  accentChanged: { icon: 'check', level: 'info', titleKey: 'toast.accentChanged.title', duration: 2400 },
  pollIntervalChanged: {
    icon: 'check',
    level: 'info',
    titleKey: 'toast.pollIntervalChanged.title',
    descKey: 'toast.pollIntervalChanged.desc',
    duration: 2800,
  },
  queueCleared: {
    icon: 'trash',
    level: 'info',
    titleKey: 'toast.queueCleared.title',
    descKey: 'toast.queueCleared.desc',
  },
  hashCopied: {
    icon: 'copy',
    level: 'success',
    titleKey: 'toast.hashCopied.title',
    descKey: 'toast.hashCopied.desc',
    duration: 2400,
  },
  copyFailed: {
    icon: 'alert',
    level: 'error',
    titleKey: 'toast.copyFailed.title',
    descKey: 'toast.copyFailed.desc',
  },
  historyCleared: {
    icon: 'trash',
    level: 'info',
    titleKey: 'toast.historyCleared.title',
    descKey: 'toast.historyCleared.desc',
  },
  reportRemoved: {
    icon: 'trash',
    level: 'info',
    titleKey: 'toast.reportRemoved.title',
    descKey: 'toast.reportRemoved.desc',
  },
  reportMissing: {
    icon: 'alert',
    level: 'warn',
    titleKey: 'toast.reportMissing.title',
    descKey: 'toast.reportMissing.desc',
  },
  vtOpenFailed: {
    icon: 'alert',
    level: 'error',
    titleKey: 'toast.vtOpenFailed.title',
    descKey: 'toast.vtOpenFailed.desc',
  },
};

const DEFAULT_DURATION: Record<ToastLevel, number> = {
  info: 3800,
  success: 3800,
  warn: 5400,
  error: 6800,
};

const MAX_VISIBLE = 5;

export function describePreset(preset: ToastPreset, t: TFunction, params?: Record<string, unknown>): ToastOptions {
  const descriptor = PRESETS[preset];
  const description = descriptor.descKey ? t(descriptor.descKey, params) : undefined;
  return {
    title: t(descriptor.titleKey, params),
    description,
    icon: descriptor.icon,
    level: descriptor.level,
    duration: descriptor.duration ?? DEFAULT_DURATION[descriptor.level],
  };
}

export function useToast() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((options: ToastOptions) => {
    counterRef.current += 1;
    const id = `toast-${counterRef.current}`;
    const level: ToastLevel = options.level ?? 'info';
    const duration = options.duration ?? DEFAULT_DURATION[level];
    const toast: ActiveToast = {
      id,
      title: options.title,
      description: options.description,
      icon: options.icon,
      level,
      duration,
      action: options.action,
      createdAt: Date.now(),
    };
    setToasts((prev) => {
      const next = [...prev, toast];
      return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
    });
    if (level === 'error') logError('ui.toast', { title: toast.title, level });
    else if (level === 'warn') logWarn('ui.toast', { title: toast.title, level });
    else logInfo('ui.toast', { title: toast.title, level });
    return id;
  }, []);

  const api = useMemo(
    () => ({
      toasts,
      showToast,
      dismiss,
    }),
    [toasts, showToast, dismiss],
  );

  return api;
}

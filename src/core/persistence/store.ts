import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '@/core/state/store';
import { DEFAULT_SETTINGS } from '@/app/constants';
import type { AppSettings, FileReport, ScanItem, WatchRule } from '@/core/domain/types';
import { sanitizeWatchedFolders } from '@/core/domain/watch';
import { detectPreferredLanguage, isAppLanguage } from '@/core/i18n/resolveLanguage';
import { logError, logInfo, logWarn } from '@/core/logging';
import { setCloseToTray } from '@/core/native/api';
import { sanitizeItems } from './sanitize';

const SAVE_DEBOUNCE_MS = 600;

interface PersistedState {
  items: ScanItem[];
  history: FileReport[];
  settings: AppSettings;
  watchedFolders?: WatchRule[];
  window?: WindowState;
}

interface WindowState {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  maximized: boolean;
}

function readWindowState(): WindowState | undefined {
  return useAppStore.getState().windowState ?? undefined;
}

function resolvePersistedLanguage(value: unknown): AppSettings['language'] {
  return isAppLanguage(value) ? value : detectPreferredLanguage();
}

function sanitizeSettings(settings: AppSettings): AppSettings {
  return {
    language: settings.language,
    pollInterval: settings.pollInterval,
    logLevel: settings.logLevel,
    scanImmediately: settings.scanImmediately,
    closeToTray: settings.closeToTray,
    autostart: settings.autostart,
    startMinimized: settings.startMinimized,
    notificationsEnabled: settings.notificationsEnabled,
    notifyOnCompleted: settings.notifyOnCompleted,
    notifyOnFailed: settings.notifyOnFailed,
    contextMenuEnabled: settings.contextMenuEnabled,
    reportOpenTarget: settings.reportOpenTarget === 'external' ? 'external' : 'internal',
    scanConcurrency: settings.scanConcurrency,
    scanDelaySeconds: settings.scanDelaySeconds,
    hasApiKey: false,
  };
}

export async function hydratePersistedState(): Promise<boolean> {
  try {
    const payload = await invoke<PersistedState | null>('load_persisted_state');
    if (!payload) {
      const language = detectPreferredLanguage();
      useAppStore.setState({
        settings: { ...useAppStore.getState().settings, language },
      });
      logInfo('persistence.hydrated', { items: 0, history: 0, empty: true, language });
      return true;
    }
    const persisted = payload.settings;
    const settings: AppSettings = {
      ...sanitizeSettings({
        ...DEFAULT_SETTINGS,
        ...(persisted ?? {}),
        language: resolvePersistedLanguage(persisted?.language),
      }),
      hasApiKey: useAppStore.getState().settings.hasApiKey,
    };
    useAppStore.setState({
      items: sanitizeItems(payload.items ?? []),
      history: payload.history ?? [],
      settings,
      watchedFolders: sanitizeWatchedFolders(payload.watchedFolders),
      windowState: payload.window ?? null,
    });
    await setCloseToTray(settings.closeToTray);
    logInfo('persistence.hydrated', {
      items: (payload.items ?? []).length,
      history: (payload.history ?? []).length,
    });
    return true;
  } catch (error) {
    logWarn('persistence.hydrate_failed', { error: String(error) });
    return false;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let flushChain: Promise<boolean> = Promise.resolve(true);

async function writeState(): Promise<boolean> {
  if (!useAppStore.getState().hydrated) {
    logWarn('persistence.save_skipped_unhydrated');
    return false;
  }
  try {
    const state = useAppStore.getState();
    const payload: PersistedState = {
      items: sanitizeItems(state.items),
      history: state.history,
      settings: sanitizeSettings(state.settings),
      watchedFolders: state.watchedFolders,
      window: readWindowState(),
    };
    await invoke('save_persisted_state', { state: payload });
    logInfo('persistence.saved', { items: payload.items.length, history: payload.history.length });
    return true;
  } catch (error) {
    logError('persistence.save_failed', { error: String(error) });
    return false;
  }
}

/**
 * Serializes writes and resolves true only when the state at call time (and later)
 * reached disk, so a spool acknowledgement never precedes its durable items.
 */
export function flushPersistedState(): Promise<boolean> {
  flushChain = flushChain.then(writeState, writeState);
  return flushChain;
}

export function subscribePersistence(): () => void {
  let previous = useAppStore.getState();
  const unsubscribe = useAppStore.subscribe((state) => {
    const itemsChanged = state.items !== previous.items;
    const historyChanged = state.history !== previous.history;
    const settingsChanged = state.settings !== previous.settings;
    const windowChanged = state.windowState !== previous.windowState;
    const closeToTrayChanged = state.settings.closeToTray !== previous.settings.closeToTray;
    previous = state;
    if (!itemsChanged && !historyChanged && !settingsChanged && !windowChanged) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void flushPersistedState();
    }, SAVE_DEBOUNCE_MS);
    if (closeToTrayChanged) {
      void setCloseToTray(state.settings.closeToTray);
    }
  });
  return () => {
    unsubscribe();
    if (saveTimer) clearTimeout(saveTimer);
    void flushPersistedState();
  };
}

export async function persistWindowState(state: WindowState): Promise<void> {
  useAppStore.setState({ windowState: state });
}

export async function clearPersistedState(): Promise<void> {
  try {
    await invoke('clear_persisted_state');
    logInfo('persistence.cleared');
  } catch (error) {
    logError('persistence.clear_failed', { error: String(error) });
  }
}

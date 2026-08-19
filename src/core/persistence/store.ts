import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '@/core/state/store';
import { DEFAULT_SETTINGS } from '@/app/constants';
import type { AppSettings, FileReport, ScanItem } from '@/core/domain/types';
import { detectPreferredLanguage, isAppLanguage } from '@/core/i18n/resolveLanguage';
import { logError, logInfo, logWarn } from '@/core/logging';
import { setCloseToTray } from '@/core/native/api';

const SAVE_DEBOUNCE_MS = 600;

interface PersistedState {
  items: ScanItem[];
  history: FileReport[];
  settings: AppSettings;
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
    theme: settings.theme,
    accent: settings.accent,
    language: settings.language,
    pollInterval: settings.pollInterval,
    logLevel: settings.logLevel,
    scanImmediately: settings.scanImmediately,
    closeToTray: settings.closeToTray,
    startMinimized: settings.startMinimized,
    notificationsEnabled: settings.notificationsEnabled,
    notifyOnCompleted: settings.notifyOnCompleted,
    notifyOnFailed: settings.notifyOnFailed,
    contextMenuEnabled: settings.contextMenuEnabled,
    hasApiKey: false,
  };
}

function sanitizeItems(items: ScanItem[]): ScanItem[] {
  return items.map((item) =>
    item.status === 'uploading' || item.status === 'scanning'
      ? { ...item, status: 'failed', progress: 0, error: 'interrupted_by_restart' as const }
      : item,
  );
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
      ...DEFAULT_SETTINGS,
      ...(persisted ?? {}),
      language: resolvePersistedLanguage(persisted?.language),
      hasApiKey: useAppStore.getState().settings.hasApiKey,
    };
    useAppStore.setState({
      items: sanitizeItems(payload.items ?? []),
      history: payload.history ?? [],
      settings,
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
let saveInFlight = false;
let saveQueued = false;

async function flushPersistedState(): Promise<void> {
  if (!useAppStore.getState().hydrated) {
    logWarn('persistence.save_skipped_unhydrated');
    return;
  }
  if (saveInFlight) {
    saveQueued = true;
    return;
  }
  saveInFlight = true;
  try {
    const state = useAppStore.getState();
    const payload: PersistedState = {
      items: sanitizeItems(state.items),
      history: state.history,
      settings: sanitizeSettings(state.settings),
      window: readWindowState(),
    };
    await invoke('save_persisted_state', { state: payload });
    logInfo('persistence.saved', { items: payload.items.length, history: payload.history.length });
  } catch (error) {
    logError('persistence.save_failed', { error: String(error) });
  } finally {
    saveInFlight = false;
    if (saveQueued) {
      saveQueued = false;
      void flushPersistedState();
    }
  }
}

export function subscribePersistence(): () => void {
  let previous = useAppStore.getState();
  const unsubscribe = useAppStore.subscribe((state) => {
    const itemsChanged = state.items !== previous.items;
    const historyChanged = state.history !== previous.history;
    const settingsChanged = state.settings !== previous.settings;
    const windowChanged = state.windowState !== previous.windowState;
    previous = state;
    if (!itemsChanged && !historyChanged && !settingsChanged && !windowChanged) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void flushPersistedState();
    }, SAVE_DEBOUNCE_MS);
    if (settingsChanged && state.settings.closeToTray !== previous.settings.closeToTray) {
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

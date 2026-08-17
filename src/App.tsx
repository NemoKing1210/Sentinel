import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useAppStore } from '@/core/state/store';
import { getAccentPalette, LANGUAGES, type View } from '@/app/constants';
import {
  detectPaths,
  getApiKey,
  getLogLevel,
  hasSavedApiKey,
  openLogDirectory,
  openExternalUrl,
  pathToItem,
  pickFiles,
  pickFolder,
  pickPath,
  saveApiKey,
  setLogLevel,
  subscribeToFileDrops,
  validateApiKey,
} from '@/core/native/api';
import type { AppSettings, LogLevel, ScanItem } from '@/core/domain/types';
import { describePreset, useToast } from '@/app/hooks/useToast';
import { useNativeTheme } from '@/app/hooks/useNativeTheme';
import { useScanRunner } from '@/features/queue/useScanRunner';
import { logError, logInfo, logWarn } from '@/core/logging';
import { WindowChrome, type NavItem } from '@/components/layout/WindowChrome';
import { ToastContainer } from '@/components/layout/Toast';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { QueuePage } from '@/features/queue/QueuePage';
import { HistoryPage } from '@/features/history/HistoryPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { hydratePersistedState, subscribePersistence } from '@/core/persistence/store';
import { applyPersistedWindowState, subscribeWindowState } from '@/core/persistence/windowState';
import { bindNativeMenu } from '@/core/native/menuBridge';

function keepListener(cancelled: { current: boolean }, assign: (unlisten: () => void) => void) {
  return (unlisten: () => void) => {
    if (cancelled.current) {
      unlisten();
      return;
    }
    assign(unlisten);
  };
}

export default function App() {
  const { t, i18n } = useTranslation();
  const settings = useAppStore((state) => state.settings);
  const view = useAppStore((state) => state.view);
  const setView = useAppStore((state) => state.setView);
  const items = useAppStore((state) => state.items);
  const addItems = useAppStore((state) => state.addItems);
  const clearItems = useAppStore((state) => state.clearItems);
  const clearCompletedItems = useAppStore((state) => state.clearCompletedItems);
  const history = useAppStore((state) => state.history);
  const setReport = useAppStore((state) => state.setReport);
  const setSettings = useAppStore((state) => state.setSettings);
  const { toasts, showToast, dismiss } = useToast();
  const { runScan, startAll } = useScanRunner();
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [dragging, setDragging] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const goToView = useCallback(
    (next: View) => {
      if (next === 'history') setReport(null);
      setView(next);
    },
    [setReport, setView],
  );

  const setViewRef = useRef(goToView);
  const pickFilesAndAddRef = useRef<() => Promise<void>>(async () => undefined);
  const pickFolderAndAddRef = useRef<() => Promise<void>>(async () => undefined);
  const addDetectedPathsRef = useRef<(items: Array<{ path: string; isFolder: boolean }>) => Promise<void>>(
    async () => undefined,
  );

  const addPaths = useCallback(
    async (paths: string[], folder = false) => {
      const valid = paths.filter(Boolean);
      if (!valid.length) return;
      const newItems = await Promise.all(valid.map((path) => pathToItem(path, folder)));
      addItems(newItems);
      setView('queue');
      const preset = folder ? 'folderAdded' : 'filesAdded';
      showToast(describePreset(preset, t, { count: valid.length }));
      if (useAppStore.getState().settings.scanImmediately) {
        newItems.forEach((item) => void runScan(item));
      }
    },
    [addItems, runScan, setView, showToast, t],
  );

  const addDetectedPaths = useCallback(
    async (items: Array<{ path: string; isFolder: boolean }>) => {
      if (!items.length) return;
      const files = items.filter((item) => !item.isFolder).map((item) => item.path);
      const folders = items.filter((item) => item.isFolder).map((item) => item.path);
      if (files.length) await addPaths(files, false);
      if (folders.length) await addPaths(folders, true);
    },
    [addPaths],
  );

  const pickFilesAndAdd = useCallback(async () => {
    try {
      const paths = await pickFiles();
      if (paths.length) await addPaths(paths, false);
    } catch (error) {
      logError('ui.file_pick_failed', { error: String(error) });
      showToast(describePreset('filePickFailed', t));
    }
  }, [addPaths, showToast, t]);

  const pickFolderAndAdd = useCallback(async () => {
    try {
      const paths = await pickFolder();
      if (paths.length) await addPaths(paths, true);
    } catch (error) {
      logError('ui.folder_pick_failed', { error: String(error) });
      showToast(describePreset('folderPickFailed', t));
    }
  }, [addPaths, showToast, t]);

  const pickPathAndAdd = useCallback(async () => {
    try {
      await addDetectedPaths(await pickPath());
    } catch (error) {
      logError('ui.path_pick_failed', { error: String(error) });
      showToast(describePreset('pathPickFailed', t));
    }
  }, [addDetectedPaths, showToast, t]);

  useEffect(() => {
    setViewRef.current = goToView;
    pickFilesAndAddRef.current = pickFilesAndAdd;
    pickFolderAndAddRef.current = pickFolderAndAdd;
    addDetectedPathsRef.current = addDetectedPaths;
  }, [goToView, pickFilesAndAdd, pickFolderAndAdd, addDetectedPaths]);

  useEffect(() => {
    // Subscribe once: async unlistens + Strict Mode remounts used to leak drop listeners.
    const cancelled = { current: false };
    let disposeDrop: (() => void) | undefined;
    let disposeMenu: (() => void) | undefined;
    let disposeWindow: (() => void) | undefined;
    let disposePersistence: (() => void) | undefined;
    void (async () => {
      const persistOk = await hydratePersistedState();
      if (cancelled.current) return;
      const [hasApiKey, logLevel] = await Promise.all([
        hasSavedApiKey().catch((error) => {
          logWarn('bootstrap.key_check_failed', { error: String(error) });
          return useAppStore.getState().settings.hasApiKey;
        }),
        getLogLevel().catch((error) => {
          logWarn('bootstrap.log_level_failed', { error: String(error) });
          return useAppStore.getState().settings.logLevel;
        }),
      ]);
      if (cancelled.current) return;
      useAppStore.getState().setSettings({ hasApiKey, logLevel });
      if (!persistOk) {
        logWarn('bootstrap.persistence_locked');
        return;
      }
      useAppStore.getState().setHydrated(true);
      const shouldStartHidden = useAppStore.getState().settings.startMinimized;
      if (shouldStartHidden) {
        await getCurrentWindow().hide();
      } else {
        await applyPersistedWindowState();
      }
      if (cancelled.current) return;
      disposePersistence = subscribePersistence();
      disposeWindow = subscribeWindowState();
    })().catch((error) => logWarn('bootstrap.hydration_failed', { error: String(error) }));
    void subscribeToFileDrops(async (paths) => {
      if (!paths.length) return;
      await addDetectedPathsRef.current(await detectPaths(paths));
    }, setDragging)
      .then(
        keepListener(cancelled, (unlisten) => {
          disposeDrop = unlisten;
        }),
      )
      .catch((error) => logError('bootstrap.file_drop_listener_failed', { error: String(error) }));
    void bindNativeMenu({
      setView: (next: View) => setViewRef.current(next),
      pickFiles: () => pickFilesAndAddRef.current(),
      pickFolder: () => pickFolderAndAddRef.current(),
      showAbout: () => setViewRef.current('settings'),
    })
      .then(
        keepListener(cancelled, (unlisten) => {
          disposeMenu = unlisten;
        }),
      )
      .catch((error) => logWarn('bootstrap.menu_listener_failed', { error: String(error) }));
    logInfo('app.started_ui');
    return () => {
      cancelled.current = true;
      disposeDrop?.();
      disposeMenu?.();
      disposeWindow?.();
      disposePersistence?.();
    };
  }, []);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [view]);

  useEffect(() => {
    const blockContextMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener('contextmenu', blockContextMenu);
    return () => document.removeEventListener('contextmenu', blockContextMenu);
  }, []);

  useNativeTheme(settings.theme);

  useEffect(() => {
    void i18n.changeLanguage(settings.language);
  }, [i18n, settings.language]);

  const nav: NavItem[] = [
    { id: 'dashboard', label: t('dashboard'), icon: 'grid' },
    {
      id: 'queue',
      label: t('queue'),
      icon: 'queue',
      count: items.filter((item) => item.status !== 'completed').length,
    },
    { id: 'history', label: t('history'), icon: 'history', count: history.length },
    { id: 'settings', label: t('settings'), icon: 'tune' },
  ];

  const save = async () => {
    if (!apiKey.trim()) {
      showToast(describePreset('apiKeyEmpty', t));
      return;
    }
    try {
      await saveApiKey(apiKey);
      setSettings({ hasApiKey: true });
      setApiKey('');
      showToast(describePreset('apiKeySaved', t));
      logInfo('credentials.api_key_saved_ui');
    } catch (error) {
      logError('credentials.api_key_save_failed_ui', { error: String(error) });
      showToast(describePreset('apiKeySaveFailed', t));
    }
  };

  const toggleApiKey = async () => {
    if (!showApiKey && !apiKey && settings.hasApiKey) {
      try {
        setApiKey(await getApiKey());
      } catch (error) {
        logError('credentials.key_read_failed_ui', { error: String(error) });
        showToast(describePreset('apiKeyReadFailed', t));
        return;
      }
    }
    setShowApiKey((visible) => !visible);
  };

  const validate = async () => {
    try {
      const ok = await validateApiKey();
      setSettings({ hasApiKey: ok });
      showToast(describePreset(ok ? 'connectionVerified' : 'connectionFailed', t));
      logInfo('connection.checked_ui', { ok });
    } catch (error) {
      logError('connection.check_failed_ui', { error: String(error) });
      showToast(describePreset('connectionCheckFailed', t));
    }
  };

  const changeLogLevel = async (level: LogLevel) => {
    try {
      await setLogLevel(level);
      setSettings({ logLevel: level });
      showToast(describePreset('logLevelSaved', t, { level: t(`log${level[0].toUpperCase()}${level.slice(1)}`) }));
      logInfo('logging.level_changed_ui', { level });
    } catch (error) {
      logError('logging.level_change_failed_ui', { level, error: String(error) });
      showToast(describePreset('logLevelFailed', t));
    }
  };

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSettings(patch);
    if (patch.language) {
      void i18n.changeLanguage(patch.language);
      const languageOption = LANGUAGES.find((language) => language.value === patch.language);
      showToast(
        describePreset('languageChanged', t, {
          language: languageOption?.label ?? patch.language,
        }),
      );
    }
    if (patch.theme) {
      showToast(
        describePreset('themeChanged', t, {
          theme: t(patch.theme),
        }),
      );
    }
    if (patch.accent) {
      showToast(describePreset('accentChanged', t));
    }
    if (patch.pollInterval !== undefined) {
      showToast(describePreset('pollIntervalChanged', t, { interval: patch.pollInterval }));
    }
  };

  const clearQueue = useCallback(() => {
    if (items.length === 0) return;
    clearItems();
    showToast(describePreset('queueCleared', t));
  }, [clearItems, items.length, showToast, t]);

  const clearCompleted = useCallback(() => {
    const finished = items.filter((item) => item.status === 'completed' || item.status === 'failed').length;
    if (finished === 0) return;
    clearCompletedItems();
    showToast(describePreset('queueCleared', t));
  }, [clearCompletedItems, items, showToast, t]);

  const openItemDetails = useCallback(
    (item: ScanItem) => {
      const report = history.find((entry) => entry.itemId === item.id);
      setReport(report ?? null);
      setView('history');
    },
    [history, setReport, setView],
  );

  const accent = getAccentPalette(settings.accent, settings.theme);
  const accentVars = {
    '--teal': accent.teal,
    '--teal-deep': accent.tealDeep,
    '--on-teal': accent.onTeal,
  } as CSSProperties;

  return (
    <div className={`manual-app ${settings.theme === 'light' ? 'light' : 'dark'}`} style={accentVars}>
      <WindowChrome nav={nav} view={view} setView={goToView} />
      <main ref={mainRef} className="manual-main">
        <div className="page-transition" key={view}>
          {view === 'dashboard' && (
            <DashboardPage
              items={items}
              history={history}
              dragging={dragging}
              hasApiKey={settings.hasApiKey}
              scanImmediately={settings.scanImmediately}
              setScanImmediately={(value) => updateSettings({ scanImmediately: value })}
              setDragging={setDragging}
              pickPath={pickPathAndAdd}
              setView={setView}
              setReport={setReport}
            />
          )}
          {view === 'queue' && (
            <QueuePage
              items={items}
              dragging={dragging}
              runScan={runScan}
              startAll={() => startAll(items)}
              clearCompleted={clearCompleted}
              clearQueue={clearQueue}
              onOpenDetails={openItemDetails}
              pickPath={pickPathAndAdd}
              setDragging={setDragging}
            />
          )}
          {view === 'history' && <HistoryPage />}
          {view === 'settings' && (
            <SettingsPage
              settings={settings}
              apiKey={apiKey}
              showApiKey={showApiKey}
              toggleApiKey={toggleApiKey}
              setApiKey={setApiKey}
              save={save}
              validate={validate}
              setSettings={updateSettings}
              changeLanguage={(language) => void i18n.changeLanguage(language)}
              setLogLevel={changeLogLevel}
              openLogDirectory={async () => {
                try {
                  await openLogDirectory();
                  showToast(describePreset('logFolderOpened', t));
                  logInfo('logging.directory_opened_ui');
                } catch (error) {
                  logError('logging.directory_open_failed_ui', { error: String(error) });
                  showToast(describePreset('logFolderFailed', t));
                }
              }}
              openExternalUrl={(url) => openExternalUrl(url)}
            />
          )}
        </div>
      </main>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

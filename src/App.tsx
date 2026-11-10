import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { MotionConfig } from 'motion/react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useAppStore } from '@/core/state/store';
import { LANGUAGES, type View } from '@/app/constants';
import { PageTransition } from '@/app/navigation/PageTransition';
import { ROUTES, isBrowserPath, reportIdFromPath, resolveView } from '@/app/navigation/routes';
import { useAppNavigate } from '@/app/navigation/useAppNavigate';
import {
  ackWatchSpool,
  detectPaths,
  drainWatchSpool,
  getApiKey,
  getAutostart,
  getLogLevel,
  getPendingScanPaths,
  hasSavedApiKey,
  isWindowsPlatform,
  listenWatchDetected,
  listenWatchStatus,
  openLogDirectory,
  openExternalUrl,
  pathToItem,
  pickFiles,
  pickFolder,
  pickPath,
  registerContextMenu,
  saveApiKey,
  setAutostart,
  setLogLevel,
  subscribeToFileDrops,
  syncWatchRules,
  unregisterContextMenu,
  updateTrayState,
  validateApiKey,
} from '@/core/native/api';
import type { AppSettings, LogLevel, ScanItem, WatchPendingFile, WatchStatus } from '@/core/domain/types';
import { useAppShortcuts } from '@/app/hooks/useAppShortcuts';
import { describePreset, useToast } from '@/app/hooks/useToast';
import { useNativeTheme } from '@/app/hooks/useNativeTheme';
import { useSystemAccent } from '@/app/hooks/useSystemAccent';
import { useWindowBackdrop } from '@/app/hooks/useWindowBackdrop';
import { resolveSystemAccentPalette } from '@/app/utils/accent';
import { shouldRevealWindow, shouldStartHidden } from '@/app/utils/windowReveal';
import { useScanRunner } from '@/features/queue/useScanRunner';
import { useScanScheduler } from '@/features/queue/useScanScheduler';
import { logError, logInfo, logWarn } from '@/core/logging';
import { WindowChrome } from '@/components/layout/WindowChrome';
import { NavigationPane, type NavItem } from '@/components/layout/NavigationPane';
import { ToastContainer } from '@/components/layout/Toast';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { QueuePage } from '@/features/queue/QueuePage';
import { HistoryPage } from '@/features/history/HistoryPage';
import { InternalBrowserPage } from '@/features/history/InternalBrowserPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { WatchPage } from '@/features/watch/WatchPage';
import { hydratePersistedState, flushPersistedState, subscribePersistence } from '@/core/persistence/store';
import { planWatchIngest } from '@/features/watch/ingestWatch';
import { applyPersistedWindowState, subscribeWindowState } from '@/core/persistence/windowState';
import { bindNativeMenu } from '@/core/native/menuBridge';
import { bindNativeNotifications } from '@/core/native/notificationBridge';
import { bindContextMenuScans } from '@/core/native/contextMenuBridge';

function keepListener(cancelled: { current: boolean }, assign: (unlisten: () => void) => void) {
  return (unlisten: () => void) => {
    if (cancelled.current) {
      unlisten();
      return;
    }
    assign(unlisten);
  };
}

function statusesById(statuses: WatchStatus[]): Record<string, WatchStatus> {
  return Object.fromEntries(statuses.map((status) => [status.watchId, status]));
}

export default function App() {
  const { t, i18n } = useTranslation();
  const settings = useAppStore((state) => state.settings);
  const location = useLocation();
  const { goToView, openReport: navigateToReport, backToReport } = useAppNavigate();
  const activeView = resolveView(location.pathname) ?? 'dashboard';
  const historyReportId = reportIdFromPath(location.pathname);
  const browserMode = isBrowserPath(location.pathname);
  const browserParams = new URLSearchParams(location.search);
  const browserUrl = browserParams.get('url') ?? '';
  const browserBack = browserParams.get('back') ?? '';
  const items = useAppStore((state) => state.items);
  const addItems = useAppStore((state) => state.addItems);
  const clearItems = useAppStore((state) => state.clearItems);
  const clearCompletedItems = useAppStore((state) => state.clearCompletedItems);
  const history = useAppStore((state) => state.history);
  const setSettings = useAppStore((state) => state.setSettings);
  const hydrated = useAppStore((state) => state.hydrated);
  const watchedFolders = useAppStore((state) => state.watchedFolders);
  const { toasts, showToast, dismiss } = useToast();
  const { executeScan, notifyFailed } = useScanRunner();
  const { requestScan, requestAll } = useScanScheduler({ executeScan, notifyFailed });
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [supportsContextMenu, setSupportsContextMenu] = useState(false);
  const [supportsAutostart, setSupportsAutostart] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const scrollPositions = useRef(new Map<string, number>());

  const revealWindow = useCallback((hasPendingPaths = false) => {
    if (!shouldRevealWindow(useAppStore.getState().settings.startMinimized, hasPendingPaths)) return;
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
    void getCurrentWindow().show();
  }, []);

  const setViewRef = useRef(goToView);
  const pickFilesAndAddRef = useRef<() => Promise<void>>(async () => undefined);
  const pickFolderAndAddRef = useRef<() => Promise<void>>(async () => undefined);
  const addDetectedPathsRef = useRef<(items: Array<{ path: string; isFolder: boolean }>) => Promise<void>>(
    async () => undefined,
  );
  const scanContextPathsRef = useRef<(paths: string[]) => Promise<void>>(async () => undefined);
  const openNotificationReportRef = useRef<(itemId: string) => void>(() => undefined);
  const pendingWatchEventsRef = useRef<WatchPendingFile[]>([]);
  const watchFlushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ingestChainRef = useRef<Promise<void>>(Promise.resolve());

  const openNotificationReport = useCallback(
    (itemId: string) => {
      const report = useAppStore.getState().history.find((entry) => entry.itemId === itemId);
      navigateToReport(itemId);
      logInfo('notifications.report_opened', { itemId, found: Boolean(report) });
    },
    [navigateToReport],
  );

  const ingestWatchFiles = useCallback(async (files: WatchPendingFile[]) => {
    if (!files.length) return;
    const state = useAppStore.getState();
    const plan = planWatchIngest(files, state.watchedFolders, state.items);
    if (plan.items.length) state.addItems(plan.items);
    const saved = await flushPersistedState();
    if (saved && plan.ackIds.length) {
      try {
        await ackWatchSpool(plan.ackIds);
        logInfo('watch.spool_acked', { ids: plan.ackIds.length });
      } catch (error) {
        logError('watch.ack_failed', { error: String(error) });
      }
    } else if (!saved) {
      logWarn('watch.ack_skipped_unsaved', { ids: plan.ackIds.length });
    }
    logInfo('watch.ingested', { detected: files.length, created: plan.items.length });
  }, []);

  const enqueueWatchIngest = useCallback(
    (files: WatchPendingFile[]) => {
      ingestChainRef.current = ingestChainRef.current
        .then(() => ingestWatchFiles(files))
        .catch((error) => {
          logError('watch.ingest_failed', { error: String(error) });
        });
    },
    [ingestWatchFiles],
  );

  const addPaths = useCallback(
    async (paths: string[], folder = false) => {
      const valid = paths.filter(Boolean);
      if (!valid.length) return;
      const newItems = (await Promise.all(valid.map((path) => pathToItem(path, folder)))).map((item) => ({
        ...item,
        origin: 'manual' as const,
        autoStart: useAppStore.getState().settings.scanImmediately,
      }));
      addItems(newItems);
      goToView('queue');
      const preset = folder ? 'folderAdded' : 'filesAdded';
      showToast(describePreset(preset, t, { count: valid.length }));
      if (useAppStore.getState().settings.scanImmediately) {
        requestAll(newItems);
      }
    },
    [addItems, goToView, requestAll, showToast, t],
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

  const scanContextPaths = useCallback(
    async (paths: string[]) => {
      const valid = paths.filter(Boolean);
      if (!valid.length) return;
      const detected = await detectPaths(valid);
      const files = detected.filter((item) => !item.isFolder).map((item) => item.path);
      const folders = detected.filter((item) => item.isFolder).map((item) => item.path);
      const toItem = (path: string, isFolder: boolean) =>
        pathToItem(path, isFolder).then((item) => ({ ...item, origin: 'manual' as const, autoStart: true }));
      const newItems: ScanItem[] = [];
      if (files.length) newItems.push(...(await Promise.all(files.map((path) => toItem(path, false)))));
      if (folders.length) newItems.push(...(await Promise.all(folders.map((path) => toItem(path, true)))));
      if (!newItems.length) return;
      addItems(newItems);
      goToView('queue');
      showToast(describePreset('contextScanStarted', t, { count: newItems.length }));
      logInfo('shell.context_scan_started', { items: newItems.map((item) => item.name) });
      requestAll(newItems);
    },
    [addItems, goToView, requestAll, showToast, t],
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

  useAppShortcuts({ onPickFiles: pickFilesAndAdd, onPickFolder: pickFolderAndAdd, onView: goToView });

  useEffect(() => {
    setViewRef.current = goToView;
    pickFilesAndAddRef.current = pickFilesAndAdd;
    pickFolderAndAddRef.current = pickFolderAndAdd;
    addDetectedPathsRef.current = addDetectedPaths;
    scanContextPathsRef.current = scanContextPaths;
    openNotificationReportRef.current = openNotificationReport;
  }, [goToView, pickFilesAndAdd, pickFolderAndAdd, addDetectedPaths, scanContextPaths, openNotificationReport]);

  useEffect(() => {
    // Subscribe once: async unlistens + Strict Mode remounts used to leak drop listeners.
    const cancelled = { current: false };
    let disposeDrop: (() => void) | undefined;
    let disposeMenu: (() => void) | undefined;
    let disposeNotifications: (() => void) | undefined;
    let disposeContextMenu: (() => void) | undefined;
    let disposeWindow: (() => void) | undefined;
    let disposePersistence: (() => void) | undefined;
    let disposeWatchDetected: (() => void) | undefined;
    let disposeWatchStatus: (() => void) | undefined;
    void (async () => {
      const persistOk = await hydratePersistedState();
      if (cancelled.current) return;
      const [hasApiKey, logLevel, autostart] = await Promise.all([
        hasSavedApiKey().catch((error) => {
          logWarn('bootstrap.key_check_failed', { error: String(error) });
          return useAppStore.getState().settings.hasApiKey;
        }),
        getLogLevel().catch((error) => {
          logWarn('bootstrap.log_level_failed', { error: String(error) });
          return useAppStore.getState().settings.logLevel;
        }),
        getAutostart().catch((error) => {
          logWarn('bootstrap.autostart_check_failed', { error: String(error) });
          return useAppStore.getState().settings.autostart;
        }),
      ]);
      if (cancelled.current) return;
      useAppStore.getState().setSettings({ hasApiKey, logLevel, autostart });
      if (!persistOk) {
        logWarn('bootstrap.persistence_locked');
        return;
      }
      useAppStore.getState().setHydrated(true);
      // Subscribe before syncing/draining: a detection during the drain is a wake-up
      // signal on top of the durable spool, so nothing is lost across webview reloads.
      disposeWatchDetected = await listenWatchDetected((file) => {
        pendingWatchEventsRef.current.push(file);
        if (watchFlushTimerRef.current) clearTimeout(watchFlushTimerRef.current);
        watchFlushTimerRef.current = setTimeout(() => {
          const batch = pendingWatchEventsRef.current.splice(0);
          if (batch.length) enqueueWatchIngest(batch);
        }, 200);
      }).catch((error) => {
        logWarn('bootstrap.watch_detected_listener_failed', { error: String(error) });
        return undefined;
      });
      disposeWatchStatus = await listenWatchStatus((statuses) => {
        useAppStore.getState().setWatchStatuses(statusesById(statuses));
      }).catch((error) => {
        logWarn('bootstrap.watch_status_listener_failed', { error: String(error) });
        return undefined;
      });
      if (cancelled.current) {
        disposeWatchDetected?.();
        disposeWatchStatus?.();
        return;
      }
      try {
        const statuses = await syncWatchRules(useAppStore.getState().watchedFolders);
        useAppStore.getState().setWatchStatuses(statusesById(statuses));
      } catch (error) {
        logError('watch.sync_failed', { error: String(error) });
      }
      if (cancelled.current) return;
      const spooled = await drainWatchSpool().catch((error) => {
        logWarn('watch.drain_failed', { error: String(error) });
        return [] as WatchPendingFile[];
      });
      if (cancelled.current) return;
      if (spooled.length) enqueueWatchIngest(spooled);
      // Bind before draining: a scan requested while the webview was loading must
      // find hydrated state, and an event arriving during the drain must not be lost.
      const contextMenuUnlisten = await bindContextMenuScans({
        onPaths: (paths) => void scanContextPathsRef.current(paths),
      }).catch((error) => {
        logWarn('bootstrap.context_menu_listener_failed', { error: String(error) });
        return undefined;
      });
      if (cancelled.current) {
        contextMenuUnlisten?.();
        return;
      }
      disposeContextMenu = contextMenuUnlisten;
      const pendingContextPaths = await getPendingScanPaths().catch((error) => {
        logWarn('bootstrap.context_paths_failed', { error: String(error) });
        return [] as string[];
      });
      if (cancelled.current) return;
      if (pendingContextPaths.length) {
        await scanContextPathsRef.current(pendingContextPaths);
      }
      const hasPendingPaths = pendingContextPaths.length > 0;
      const startsHidden = shouldStartHidden(useAppStore.getState().settings.startMinimized, hasPendingPaths);
      if (startsHidden) {
        await getCurrentWindow().hide();
      } else {
        await applyPersistedWindowState();
      }
      if (cancelled.current) return;
      disposePersistence = subscribePersistence();
      disposeWindow = subscribeWindowState();
      return hasPendingPaths;
    })()
      .then((hasPendingPaths) => {
        if (!cancelled.current) revealWindow(Boolean(hasPendingPaths));
      })
      .catch((error) => {
        logWarn('bootstrap.hydration_failed', { error: String(error) });
        if (!cancelled.current) revealWindow();
      });
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
      openReport: (itemId) => openNotificationReportRef.current(itemId),
    })
      .then(
        keepListener(cancelled, (unlisten) => {
          disposeMenu = unlisten;
        }),
      )
      .catch((error) => logWarn('bootstrap.menu_listener_failed', { error: String(error) }));
    void bindNativeNotifications({
      openReport: (itemId) => openNotificationReportRef.current(itemId),
    })
      .then(
        keepListener(cancelled, (unlisten) => {
          disposeNotifications = unlisten;
        }),
      )
      .catch((error) => logWarn('bootstrap.notification_listener_failed', { error: String(error) }));
    logInfo('app.started_ui');
    return () => {
      cancelled.current = true;
      if (watchFlushTimerRef.current) {
        clearTimeout(watchFlushTimerRef.current);
        watchFlushTimerRef.current = undefined;
      }
      disposeWatchDetected?.();
      disposeWatchStatus?.();
      disposeDrop?.();
      disposeMenu?.();
      disposeNotifications?.();
      disposeContextMenu?.();
      disposeWindow?.();
      disposePersistence?.();
    };
  }, [enqueueWatchIngest, revealWindow]);

  useEffect(() => {
    if (!hydrated) return;
    // Bootstrap already synced the hydrated rules; only later edits need a push.
    let previous = useAppStore.getState().watchedFolders;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useAppStore.subscribe((state) => {
      if (state.watchedFolders === previous) return;
      previous = state.watchedFolders;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void syncWatchRules(state.watchedFolders)
          .then((statuses) => {
            useAppStore.getState().setWatchStatuses(statusesById(statuses));
          })
          .catch((error) => {
            logError('watch.sync_failed', { error: String(error) });
            showToast(describePreset('watchSyncFailed', t));
          });
      }, 300);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [hydrated, showToast, t]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const routeKey = location.pathname;
    const saveScroll = () => scrollPositions.current.set(routeKey, main.scrollTop);
    main.addEventListener('scroll', saveScroll, { passive: true });
    return () => main.removeEventListener('scroll', saveScroll);
  }, [location.pathname]);

  useEffect(() => {
    const top = scrollPositions.current.get(location.pathname) ?? 0;
    mainRef.current?.scrollTo({ top, behavior: 'auto' });
  }, [location.pathname]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const activeItems = items
        .filter((item) => item.status === 'queued' || item.status === 'uploading' || item.status === 'scanning')
        .slice(0, 5)
        .map((item) => ({
          id: item.id,
          name: item.name,
          status: item.status,
          progress: item.progress,
        }));

      const recentItems = history.slice(0, 5).map((report) => ({
        item_id: report.itemId,
        name: report.name,
        verdict: report.verdict,
        detections: report.stats.malicious + report.stats.suspicious,
        total: report.stats.malicious + report.stats.suspicious + report.stats.undetected + report.stats.harmless,
      }));

      const labels = {
        show: t('tray.show'),
        dashboard: t('tray.dashboard'),
        queue: t('tray.queue'),
        queue_count: t('tray.queueCount'),
        history: t('tray.history'),
        settings: t('tray.settings'),
        scan_file: t('tray.scanFile'),
        scan_folder: t('tray.scanFolder'),
        active_count: t('tray.activeCount'),
        recent_count: t('tray.recentCount'),
        no_active: t('tray.noActive'),
        no_recent: t('tray.noRecent'),
        quit: t('tray.quit'),
        status_queued: t('tray.statusQueued'),
        status_uploading: t('tray.statusUploading'),
        status_scanning: t('tray.statusScanning'),
        verdict_clean: t('tray.verdictClean'),
        verdict_suspicious: t('tray.verdictSuspicious'),
        verdict_malicious: t('tray.verdictMalicious'),
        verdict_unknown: t('tray.verdictUnknown'),
      };

      void updateTrayState(labels, activeItems, recentItems);
    }, 500);

    return () => clearTimeout(timer);
  }, [items, history, t]);

  useEffect(() => {
    const blockContextMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener('contextmenu', blockContextMenu);
    return () => document.removeEventListener('contextmenu', blockContextMenu);
  }, []);

  const colorScheme = useNativeTheme();
  const systemAccent = useSystemAccent();
  const backdrop = useWindowBackdrop(colorScheme);

  useEffect(() => {
    void isWindowsPlatform()
      .then((windows) => {
        setSupportsContextMenu(windows);
        setSupportsAutostart(windows);
      })
      .catch((error) => {
        logWarn('bootstrap.platform_check_failed', { error: String(error) });
        setSupportsContextMenu(false);
        setSupportsAutostart(false);
      });
  }, []);

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
    {
      id: 'watch',
      label: t('watch'),
      icon: 'eye',
      count: watchedFolders.filter((rule) => rule.enabled).length,
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

  const changeContextMenuEnabled = async (enabled: boolean) => {
    try {
      if (enabled) {
        await registerContextMenu();
        setSettings({ contextMenuEnabled: true });
        showToast(describePreset('contextMenuOn', t));
        logInfo('shell.context_menu_enabled_ui');
      } else {
        await unregisterContextMenu();
        setSettings({ contextMenuEnabled: false });
        showToast(describePreset('contextMenuOff', t));
        logInfo('shell.context_menu_disabled_ui');
      }
    } catch (error) {
      logError('shell.context_menu_change_failed_ui', { enabled, error: String(error) });
      showToast(describePreset('contextMenuFailed', t));
    }
  };

  const changeAutostart = async (enabled: boolean) => {
    try {
      await setAutostart(enabled);
      setSettings({ autostart: enabled });
      showToast(describePreset(enabled ? 'autostartOn' : 'autostartOff', t));
      logInfo('autostart.changed_ui', { enabled });
    } catch (error) {
      logError('autostart.change_failed_ui', { enabled, error: String(error) });
      showToast(describePreset('autostartFailed', t));
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
    if (patch.pollInterval !== undefined) {
      showToast(describePreset('pollIntervalChanged', t, { interval: patch.pollInterval }));
    }
    if (patch.scanConcurrency !== undefined || patch.scanDelaySeconds !== undefined) {
      showToast(describePreset('scanSettingsChanged', t));
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
      if (report) navigateToReport(report.itemId);
      else goToView('history');
    },
    [goToView, history, navigateToReport],
  );

  const accent = resolveSystemAccentPalette(systemAccent, colorScheme);
  const accentVars = {
    '--accent': accent.teal,
    '--accent-strong': accent.tealDeep,
    '--on-accent': accent.onTeal,
  } as CSSProperties;

  return (
    <MotionConfig reducedMotion="user">
      <div className={`manual-app ${colorScheme}${backdrop === 'mica' ? ' mica' : ''}`} style={accentVars}>
        <WindowChrome />
        <div className="app-body">
          <NavigationPane nav={nav} view={activeView} setView={goToView} />
          <main ref={mainRef} className={`manual-main${browserMode ? ' browser-mode' : ''}`}>
            <PageTransition routeKey={location.pathname} fill={browserMode}>
              <Routes location={location}>
                <Route path="/" element={<Navigate to={ROUTES.dashboard} replace />} />
                <Route
                  path={ROUTES.dashboard}
                  element={
                    <DashboardPage
                      items={items}
                      history={history}
                      dragging={dragging}
                      hasApiKey={settings.hasApiKey}
                      setDragging={setDragging}
                      pickPath={pickPathAndAdd}
                    />
                  }
                />
                <Route
                  path={ROUTES.queue}
                  element={
                    <QueuePage
                      items={items}
                      dragging={dragging}
                      runScan={requestScan}
                      startAll={() => requestAll(items)}
                      clearCompleted={clearCompleted}
                      clearQueue={clearQueue}
                      onOpenDetails={openItemDetails}
                      pickPath={pickPathAndAdd}
                      setDragging={setDragging}
                    />
                  }
                />
                <Route path={ROUTES.watch} element={<WatchPage />} />
                <Route path={ROUTES.history} element={<HistoryPage reportId={null} search={location.search} />} />
                <Route
                  path={`${ROUTES.history}/:reportId`}
                  element={<HistoryPage reportId={historyReportId} search={location.search} />}
                />
                <Route
                  path={`${ROUTES.history}/:reportId/browser`}
                  element={
                    browserUrl && historyReportId ? (
                      <InternalBrowserPage
                        url={browserUrl}
                        onClose={() => backToReport(historyReportId, browserBack)}
                      />
                    ) : (
                      <Navigate to={ROUTES.history} replace />
                    )
                  }
                />
                <Route
                  path={ROUTES.settings}
                  element={
                    <SettingsPage
                      settings={settings}
                      apiKey={apiKey}
                      showApiKey={showApiKey}
                      toggleApiKey={toggleApiKey}
                      setApiKey={setApiKey}
                      save={save}
                      validate={validate}
                      setSettings={updateSettings}
                      supportsContextMenu={supportsContextMenu}
                      setContextMenuEnabled={changeContextMenuEnabled}
                      supportsAutostart={supportsAutostart}
                      setAutostartEnabled={changeAutostart}
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
                  }
                />
                <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
              </Routes>
            </PageTransition>
          </main>
        </div>
        <ToastContainer toasts={toasts} onDismiss={dismiss} />
      </div>
    </MotionConfig>
  );
}

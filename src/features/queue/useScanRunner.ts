import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { FileReport, ScanItem } from '@/core/domain/types';
import { isWindowFocused, pollScanPath, showNativeScanNotification, submitScanPath } from '@/core/native/api';
import type { ScanPollResult } from '@/core/native/api';
import { useAppStore } from '@/core/state/store';
import { useAppNavigate } from '@/app/navigation/useAppNavigate';
import { describePreset, useToast } from '@/app/hooks/useToast';
import { detectionCount, engineTotal } from '@/app/utils/format';
import { normalizePollInterval } from '@/app/utils/scanPolling';
import { logError, logInfo, logWarn } from '@/core/logging';
import { shouldNotifyWatch } from '@/core/domain/watch';
import { scanResumePhase } from './scanScheduler';

export function useScanRunner() {
  const { t } = useTranslation();
  const updateItem = useAppStore((state) => state.updateItem);
  const addReport = useAppStore((state) => state.addReport);
  const { openReport: navigateToReport } = useAppNavigate();
  const { showToast } = useToast();

  const openReport = useCallback(
    (report: FileReport) => {
      navigateToReport(report.itemId);
    },
    [navigateToReport],
  );

  const notifyCompleted = useCallback(
    async (item: ScanItem, report: FileReport) => {
      const settings = useAppStore.getState().settings;
      if (item.origin === 'watch') {
        const rule = useAppStore.getState().watchedFolders.find((entry) => entry.id === item.watchId);
        if (!rule || !shouldNotifyWatch(rule, report.verdict)) return;
        if (!settings.notificationsEnabled || !settings.notifyOnCompleted) return;
      }
      const params = {
        verdict: t(report.verdict),
        detections: detectionCount(report),
        engines: engineTotal(report),
      };
      const toast = describePreset('scanCompleted', t, params);
      const action = { label: t('toast.openReport'), onClick: () => openReport(report) };
      if (!settings.notificationsEnabled || !settings.notifyOnCompleted) {
        showToast({ ...toast, action });
        return;
      }
      try {
        const focused = await isWindowFocused();
        if (focused) {
          showToast({ ...toast, action });
          return;
        }
      } catch {
        /* focus check is best-effort */
      }
      try {
        await showNativeScanNotification({
          title: toast.title,
          body: toast.description || toast.title,
          itemId: item.id,
          actionLabel: t('toast.openReport'),
        });
        logInfo('notifications.native_shown', { item: item.name, verdict: report.verdict });
      } catch (error) {
        logWarn('notifications.native_failed', { item: item.name, error: String(error) });
      }
    },
    [openReport, showToast, t],
  );

  const notifyFailed = useCallback(
    async (item: ScanItem) => {
      const settings = useAppStore.getState().settings;
      if (!settings.notificationsEnabled || !settings.notifyOnFailed) return;
      if (item.origin === 'watch') {
        const rule = useAppStore.getState().watchedFolders.find((entry) => entry.id === item.watchId);
        if (!rule || rule.notify === 'none') return;
      }
      try {
        const focused = await isWindowFocused();
        if (focused) return;
      } catch {
        /* focus check is best-effort */
      }
      try {
        await showNativeScanNotification({
          title: t('toast.scanFailed.title'),
          body: t('toast.scanFailed.desc'),
          itemId: item.id,
        });
        logInfo('notifications.native_shown', { item: item.name, failed: true });
      } catch (error) {
        logWarn('notifications.native_failed', { item: item.name, error: String(error) });
      }
    },
    [t],
  );

  const executeScan = useCallback(
    async (item: ScanItem) => {
      const current = useAppStore.getState().items.find((entry) => entry.id === item.id);
      if (!current) return;
      const path = current.path || current.name;

      let analysisId = current.analysisId ?? '';
      let sha256 = current.sha256 ?? '';
      let result: ScanPollResult;
      try {
        if (scanResumePhase(current) === 'submit') {
          if (current.origin !== 'watch') showToast(describePreset('scanStarted', t));
          logInfo('scan.started', { item: current.name, path, isFolder: current.isFolder ?? false });
          const submitted = await submitScanPath(path, current.isFolder);
          analysisId = submitted.analysisId;
          sha256 = submitted.sha256;
          updateItem(current.id, {
            analysisId,
            sha256,
            status: 'scanning',
            progress: 35,
          });
        } else {
          logInfo('scan.resumed', { item: current.name, analysisId });
        }

        result = await pollScanPath(analysisId, {
          onProgress: (progress) => updateItem(current.id, { status: 'scanning', progress }),
          pollIntervalMs: normalizePollInterval(useAppStore.getState().settings.pollInterval),
        });
      } catch (error) {
        logError('scan.failed', {
          item: current.name,
          path,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      const report: FileReport = {
        itemId: current.id,
        name: current.name,
        path: current.path,
        size: current.size,
        type: current.type,
        fileKind: current.fileKind,
        sha256,
        sha1: '',
        md5: '',
        verdict: result.verdict,
        stats: result.stats,
        engines: result.engines,
        vtUrl: `https://www.virustotal.com/gui/file/${sha256}/detection`,
        scannedAt: new Date().toISOString(),
        watchId: current.watchId,
        watchName: current.watchName,
      };
      updateItem(current.id, {
        status: 'completed',
        progress: 100,
        analysisId,
        verdict: report.verdict,
        detections: detectionCount(report),
        engines: engineTotal(report),
        sha256,
        error: undefined,
      });
      addReport(report);
      void notifyCompleted(current, report);
      logInfo('scan.completed', {
        item: current.name,
        analysisId,
        verdict: report.verdict,
        detections: detectionCount(report),
        sha256,
      });
    },
    [addReport, notifyCompleted, showToast, t, updateItem],
  );

  return { executeScan, notifyFailed };
}

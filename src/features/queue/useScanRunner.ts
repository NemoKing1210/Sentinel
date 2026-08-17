import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { FileReport, ScanItem } from '@/core/domain/types';
import { scanPath } from '@/core/native/api';
import { useAppStore } from '@/core/state/store';
import { describePreset, useToast } from '@/app/hooks/useToast';
import { detectionCount, engineTotal } from '@/app/utils/format';
import { logError, logInfo, logWarn } from '@/core/logging';

export function useScanRunner() {
  const { t } = useTranslation();
  const updateItem = useAppStore((state) => state.updateItem);
  const addReport = useAppStore((state) => state.addReport);
  const setReport = useAppStore((state) => state.setReport);
  const setView = useAppStore((state) => state.setView);
  const { showToast } = useToast();

  const runScan = useCallback(
    async (item: ScanItem) => {
      const path = item.path || item.name;
      if (!useAppStore.getState().settings.hasApiKey) {
        logWarn('scan.skipped_no_api_key', { item: item.name });
        setView('settings');
        showToast(describePreset('scanNoKey', t));
        return;
      }
      updateItem(item.id, { status: 'uploading', progress: 15 });
      showToast(describePreset('scanStarted', t));
      logInfo('scan.started', { item: item.name, path, isFolder: item.isFolder ?? false });
      try {
        const response = await scanPath(path, item.isFolder, {
          onProgress: (progress) => updateItem(item.id, { status: 'scanning', progress }),
        });
        const report: FileReport = {
          ...response.report,
          itemId: item.id,
          name: item.name || response.report.name,
          size: item.size || response.report.size,
          type: item.type || response.report.type,
          fileKind: item.fileKind,
        };
        updateItem(item.id, {
          status: 'completed',
          progress: 100,
          analysisId: response.analysisId,
          verdict: report.verdict,
          detections: detectionCount(report),
          engines: engineTotal(report),
          sha256: report.sha256,
        });
        addReport(report);
        setReport(report);
        showToast(
          describePreset('scanCompleted', t, {
            verdict: t(report.verdict),
            detections: detectionCount(report),
            engines: engineTotal(report),
          }),
        );
        logInfo('scan.completed', {
          item: item.name,
          analysisId: response.analysisId,
          verdict: report.verdict,
          detections: detectionCount(report),
          sha256: report.sha256,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError('scan.failed', { item: item.name, path, error: message });
        updateItem(item.id, { status: 'failed', error: message });
        showToast(describePreset('scanFailed', t));
      }
    },
    [addReport, setReport, setView, showToast, t, updateItem],
  );

  const startAll = useCallback(
    (items: ScanItem[]) => {
      items
        .filter((item) => item.status === 'queued' || item.status === 'failed')
        .forEach((item) => void runScan(item));
    },
    [runScan],
  );

  return { runScan, startAll };
}

import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScanItem } from '@/core/domain/types';
import { toScanError } from '@/core/native/scanError';
import { useAppStore } from '@/core/state/store';
import { logInfo, logWarn } from '@/core/logging';
import { describePreset, useToast } from '@/app/hooks/useToast';
import { nextStartWaitMs, retryDelaySeconds, SCAN_RETRY_LIMIT, selectNextScan } from './scanScheduler';

const TICK_MS = 1000;

interface SchedulerOptions {
  executeScan: (item: ScanItem) => Promise<void>;
  notifyFailed: (item: ScanItem) => Promise<void>;
}

/** Runs queued scans one tick at a time, throttling starts and retrying rate limits. */
export function useScanScheduler({ executeScan, notifyFailed }: SchedulerOptions) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const activeRef = useRef<Set<string>>(new Set());
  const lastStartedAtRef = useRef<number | undefined>(undefined);
  const nextStartAtRef = useRef(0);
  const noKeyToastShownRef = useRef(false);

  const handleFailure = useCallback(
    async (item: ScanItem, error: unknown) => {
      const scanError = toScanError(error);
      const state = useAppStore.getState();
      const retryCount = item.retryCount ?? 0;
      if (scanError.code === 'rate_limited' && retryCount < SCAN_RETRY_LIMIT) {
        const delay = retryDelaySeconds(scanError, retryCount + 1);
        const retryAtMs = Date.now() + delay * 1000;
        state.updateItem(item.id, {
          status: 'waiting',
          retryCount: retryCount + 1,
          retryAt: new Date(retryAtMs).toISOString(),
          error: scanError.message,
        });
        nextStartAtRef.current = retryAtMs;
        logWarn('scheduler.rate_limited', { item: item.name, delay, attempt: retryCount + 1 });
        logInfo('scheduler.retry_scheduled', { item: item.name, retryAt: retryAtMs });
        return;
      }
      state.updateItem(item.id, {
        status: 'failed',
        error: scanError.message,
        analysisId: scanError.code === 'rate_limited' ? item.analysisId : undefined,
      });
      if (item.origin === 'watch') {
        void notifyFailed(item);
      } else {
        showToast(describePreset('scanFailed', t));
      }
    },
    [notifyFailed, showToast, t],
  );

  const tick = useCallback(() => {
    const now = Date.now();
    const state = useAppStore.getState();
    for (const item of state.items) {
      const retryAt = item.retryAt ? Date.parse(item.retryAt) : 0;
      if (item.status === 'waiting' && !(retryAt > now)) {
        state.updateItem(item.id, { status: 'queued', retryAt: undefined });
        logInfo('scheduler.resumed_poll', { item: item.name, resume: Boolean(item.analysisId) });
      }
    }
    if (activeRef.current.size >= state.settings.scanConcurrency) return;
    if (now < nextStartAtRef.current) return;
    if (nextStartWaitMs(lastStartedAtRef.current, now, state.settings.scanDelaySeconds) > 0) return;
    const next = selectNextScan(state.items);
    if (!next) return;
    if (!state.settings.hasApiKey) {
      if (!noKeyToastShownRef.current) {
        noKeyToastShownRef.current = true;
        logWarn('scheduler.paused_no_key', {});
        showToast(describePreset('scanNoKey', t));
      }
      return;
    }
    const current = useAppStore.getState().items.find((item) => item.id === next.id);
    if (!current || current.status !== 'queued') return;
    activeRef.current.add(current.id);
    lastStartedAtRef.current = now;
    void executeScan(current)
      .catch((error: unknown) => handleFailure(current, error))
      .finally(() => {
        activeRef.current.delete(current.id);
      });
  }, [executeScan, handleFailure, showToast, t]);

  useEffect(() => {
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, [tick]);

  const requestScan = useCallback((item: ScanItem) => {
    useAppStore.getState().updateItem(item.id, {
      autoStart: true,
      status: 'queued',
      error: undefined,
      retryAt: undefined,
      retryCount: 0,
    });
  }, []);

  const requestAll = useCallback(
    (items: ScanItem[]) => {
      for (const item of items) {
        if (item.status === 'queued' || item.status === 'failed') requestScan(item);
      }
    },
    [requestScan],
  );

  return { requestScan, requestAll };
}

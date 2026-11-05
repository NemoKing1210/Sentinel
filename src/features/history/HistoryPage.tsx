import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { FileReport } from '@/core/domain/types';
import { useAppNavigate } from '@/app/navigation/useAppNavigate';
import { useRemoveReport } from '@/app/hooks/useRemoveReport';
import { describePreset, useToast } from '@/app/hooks/useToast';
import { confirmAction } from '@/core/native/api';
import { useAppStore } from '@/core/state/store';
import { logInfo } from '@/core/logging';
import { HistoryListPage } from './HistoryListPage';
import { HistoryReportPage } from './HistoryReportPage';
import { parseHistoryFilter, type HistoryFilter } from './historyQuery';

interface HistoryPageProps {
  /**
   * Route data is passed as props, not read from router context: AnimatePresence
   * re-renders the exiting page after the location has already changed, and
   * context would make it render the next page instead of the one fading out.
   */
  reportId: string | null;
  search: string;
}

export function HistoryPage({ reportId, search }: HistoryPageProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { backToHistory, openReport: navigateToReport } = useAppNavigate();
  const history = useAppStore((state) => state.history);
  const hydrated = useAppStore((state) => state.hydrated);
  const confirmRemove = useRemoveReport();
  const clearHistory = useAppStore((state) => state.clearHistory);
  const [, setSearchParams] = useSearchParams();
  const removedReportId = useRef<string | null>(null);

  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const query = searchParams.get('q') ?? '';
  const filter = parseHistoryFilter(searchParams.get('filter'));

  const selected = useMemo(
    () => (reportId ? (history.find((report) => report.itemId === reportId) ?? null) : null),
    [history, reportId],
  );

  const updateParams = useCallback(
    (patch: { q?: string; filter?: HistoryFilter }) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (patch.q !== undefined) {
            if (patch.q) next.set('q', patch.q);
            else next.delete('q');
          }
          if (patch.filter !== undefined) {
            if (patch.filter === 'all') next.delete('filter');
            else next.set('filter', patch.filter);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (!reportId || selected || !hydrated) return;
    if (removedReportId.current === reportId) {
      removedReportId.current = null;
      return;
    }
    showToast(describePreset('reportMissing', t));
    backToHistory();
  }, [backToHistory, hydrated, reportId, selected, showToast, t]);

  const openReport = useCallback((report: FileReport) => navigateToReport(report.itemId), [navigateToReport]);
  const closeReport = useCallback(() => backToHistory(), [backToHistory]);

  const removeReport = useCallback(
    async (report: FileReport) => {
      const removed = await confirmRemove(report);
      if (!removed) return;
      removedReportId.current = report.itemId;
      backToHistory();
    },
    [backToHistory, confirmRemove],
  );

  const confirmClear = useCallback(async () => {
    if (history.length === 0) return;
    const confirmed = await confirmAction({
      title: t('clearHistoryConfirmTitle'),
      message: t('clearHistoryConfirm', { count: history.length }),
      kind: 'warning',
      okLabel: t('clearHistory'),
      cancelLabel: t('cancel'),
    });
    if (!confirmed) return;
    clearHistory();
    logInfo('history.cleared', { count: history.length });
    showToast(describePreset('historyCleared', t, { count: history.length }));
  }, [clearHistory, history.length, showToast, t]);

  if (reportId && selected) {
    return (
      <HistoryReportPage report={selected} onBack={closeReport} onRemove={(report) => void removeReport(report)} />
    );
  }

  // Hold the route for one render while the effect above sends a missing id
  // back to the list. Before hydration the id may simply not be loaded yet, so
  // show the list instead of a blank page if persistence never settles.
  if (reportId && hydrated) return null;

  return (
    <HistoryListPage
      history={history}
      search={query}
      setSearch={(value) => updateParams({ q: value })}
      filter={filter}
      setFilter={(value) => updateParams({ filter: value })}
      onOpen={openReport}
      onRemove={(report) => void confirmRemove(report)}
      onClear={() => void confirmClear()}
    />
  );
}

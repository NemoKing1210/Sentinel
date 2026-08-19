import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FileReport } from '@/core/domain/types';
import { useRemoveReport } from '@/app/hooks/useRemoveReport';
import { describePreset, useToast } from '@/app/hooks/useToast';
import { confirmAction } from '@/core/native/api';
import { useAppStore } from '@/core/state/store';
import { logInfo } from '@/core/logging';
import { HistoryListPage } from './HistoryListPage';
import { HistoryReportPage } from './HistoryReportPage';
import type { HistoryFilter } from './historyQuery';

export function HistoryPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const history = useAppStore((state) => state.history);
  const selectedReportId = useAppStore((state) => state.selectedReportId);
  const setReport = useAppStore((state) => state.setReport);
  const confirmRemove = useRemoveReport();
  const clearHistory = useAppStore((state) => state.clearHistory);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');

  const selected = useMemo(
    () => history.find((report) => report.itemId === selectedReportId) ?? null,
    [history, selectedReportId],
  );

  useEffect(() => {
    document.querySelector('main.manual-main')?.scrollTo({ top: 0, behavior: 'auto' });
  }, [selectedReportId]);

  useEffect(() => {
    if (!selectedReportId || selected) return;
    setReport(null);
    showToast(describePreset('reportMissing', t));
  }, [selected, selectedReportId, setReport, showToast, t]);

  const openReport = useCallback((report: FileReport) => setReport(report), [setReport]);
  const closeReport = useCallback(() => setReport(null), [setReport]);

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

  if (selected) {
    return (
      <HistoryReportPage report={selected} onBack={closeReport} onRemove={(report) => void confirmRemove(report)} />
    );
  }

  return (
    <HistoryListPage
      history={history}
      search={search}
      setSearch={setSearch}
      filter={filter}
      setFilter={setFilter}
      onOpen={openReport}
      onRemove={(report) => void confirmRemove(report)}
      onClear={() => void confirmClear()}
    />
  );
}

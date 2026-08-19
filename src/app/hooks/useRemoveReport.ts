import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { FileReport } from '@/core/domain/types';
import { confirmAction } from '@/core/native/api';
import { useAppStore } from '@/core/state/store';
import { logInfo } from '@/core/logging';
import { describePreset, useToast } from './useToast';

export function useRemoveReport() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const removeReport = useAppStore((state) => state.removeReport);

  return useCallback(
    async (report: FileReport) => {
      const confirmed = await confirmAction({
        title: t('removeReportConfirmTitle'),
        message: t('removeReportConfirm', { name: report.name }),
        kind: 'warning',
        okLabel: t('removeReport'),
        cancelLabel: t('cancel'),
      });
      if (!confirmed) return;
      removeReport(report.itemId);
      logInfo('history.report_removed', { itemId: report.itemId, name: report.name });
      showToast(describePreset('reportRemoved', t, { name: report.name }));
    },
    [removeReport, showToast, t],
  );
}

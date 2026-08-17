import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import type { FileReport } from '@/core/domain/types';
import { detectionCount, engineTotal, formatDateTime, formatSize } from '@/app/utils/format';
import { verdictTone } from '@/app/utils/verdict';
import { fileIconName, Icon } from '@/components/ui/Icon';
import { reportKind } from './historyQuery';

const rowTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;

interface HistoryRowProps {
  report: FileReport;
  onOpen: (report: FileReport) => void;
  onRemove: (report: FileReport) => void;
}

export function HistoryRow({ report, onOpen, onRemove }: HistoryRowProps) {
  const { t } = useTranslation();
  const kind = reportKind(report);
  const tone = verdictTone(report.verdict);
  const sizeLabel = report.size > 0 ? formatSize(report.size) : null;
  const meta = [report.type, sizeLabel, formatDateTime(report.scannedAt)].filter(Boolean).join(' · ');

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: -14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={rowTransition}
      className={`surface history-row tone-${tone} kind-${kind}`}
    >
      <button type="button" className="history-row-open" onClick={() => onOpen(report)}>
        <div className="history-row-icon">
          <Icon name={fileIconName(kind)} />
        </div>
        <div className="history-row-main">
          <strong className="history-row-name" title={report.name}>
            {report.name}
          </strong>
          <small className="history-row-meta">{meta}</small>
          <small className="history-row-summary">
            {detectionCount(report)}/{engineTotal(report)} {t('engines')}
          </small>
        </div>
      </button>
      <div className="history-row-actions">
        <span className={`pill ${tone}`}>{t(report.verdict)}</span>
        <button
          type="button"
          className="icon-button danger"
          aria-label={t('removeReport')}
          title={t('removeReport')}
          onClick={() => onRemove(report)}
        >
          <Icon name="close" />
        </button>
      </div>
    </motion.section>
  );
}

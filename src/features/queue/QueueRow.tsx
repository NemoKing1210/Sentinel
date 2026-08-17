import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import type { ScanItem } from '@/core/domain/types';
import { formatRelativeTime, formatSize } from '@/app/utils/format';
import { Button } from '@/components/ui/Button';
import { fileIconName, Icon } from '@/components/ui/Icon';
import { verdictTone } from '@/app/utils/verdict';

const rowTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;

interface QueueRowProps {
  item: ScanItem;
  onRunScan: (item: ScanItem) => void;
  onOpenDetails: (item: ScanItem) => void;
  onRemove: (id: string) => void;
}

export function QueueRow({ item, onRunScan, onOpenDetails, onRemove }: QueueRowProps) {
  const { t } = useTranslation();
  const isActive = item.status === 'uploading' || item.status === 'scanning';
  const verdictClass = verdictTone(item.verdict);
  const detections = item.detections ?? 0;
  const engines = item.engines ?? 0;
  const relativeTime = formatRelativeTime(item.createdAt);
  const sizeLabel = item.size > 0 ? formatSize(item.size) : null;
  const countLabel =
    item.isFolder && item.fileCount !== undefined ? t('queueFileCount', { count: item.fileCount }) : null;
  const meta = [item.type, sizeLabel, countLabel, relativeTime].filter(Boolean).join(' · ');

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: -14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={rowTransition}
      className={`surface queue-row tone-${verdictClass} status-${item.status} kind-${item.fileKind}`}
    >
      <div className="queue-row-icon">
        <Icon name={fileIconName(item.fileKind)} />
      </div>
      <div className="queue-row-main">
        <div className="queue-row-head">
          <strong className="queue-row-name" title={item.name}>
            {item.name}
          </strong>
        </div>
        <small className="queue-row-meta">{meta}</small>
        {isActive ? (
          <div className="queue-row-progress">
            <div className="progress">
              <i style={{ width: `${item.progress}%` }} />
            </div>
            <span className="queue-row-progress-label">
              {t(item.status)} · {item.progress}%
            </span>
          </div>
        ) : null}
        {item.status === 'completed' ? (
          <small className="queue-row-summary">
            {detections}/{engines} {t('engines')}
          </small>
        ) : null}
        {item.status === 'failed' && item.error ? (
          <div className="queue-row-error" title={item.error}>
            <Icon name="alert" />
            <span>{item.error}</span>
          </div>
        ) : null}
      </div>
      <div className="queue-row-actions">
        {item.status === 'completed' && item.verdict ? (
          <span className={`pill ${verdictClass}`}>{t(item.verdict)}</span>
        ) : (
          <span className={`pill ${isActive ? 'teal' : item.status}`}>{t(item.status)}</span>
        )}
        {item.status === 'completed' ? (
          <Button variant="quiet" icon="arrow" onClick={() => onOpenDetails(item)}>
            {t('details')}
          </Button>
        ) : item.status === 'failed' ? (
          <>
            <Button variant="quiet" icon="refresh" onClick={() => onRunScan(item)}>
              {t('retry')}
            </Button>
            <button
              type="button"
              className="icon-button danger"
              onClick={() => onRemove(item.id)}
              aria-label={t('removeItem')}
              title={t('removeItem')}
            >
              <Icon name="close" />
            </button>
          </>
        ) : item.status === 'queued' ? (
          <>
            <Button variant="quiet" icon="arrow" onClick={() => onRunScan(item)}>
              {t('startScan')}
            </Button>
            <button
              type="button"
              className="icon-button danger"
              onClick={() => onRemove(item.id)}
              aria-label={t('removeItem')}
              title={t('removeItem')}
            >
              <Icon name="close" />
            </button>
          </>
        ) : (
          <span className="spinner" aria-label={t(item.status)} />
        )}
      </div>
    </motion.section>
  );
}

import { useTranslation } from 'react-i18next';
import type { ScanItem } from '@/core/domain/types';
import { useFileIcon } from '@/app/hooks/useFileIcon';
import { formatRelativeTime, formatSize } from '@/app/utils/format';
import { verdictTone } from '@/app/utils/verdict';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { OpenFolderButton } from '@/components/ui/OpenFolderButton';
import { ScanRow } from '@/components/ui/ScanRow';

interface QueueRowProps {
  item: ScanItem;
  onRunScan: (item: ScanItem) => void;
  onOpenDetails: (item: ScanItem) => void;
  onRemove: (id: string) => void;
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="icon-button danger"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    >
      <Icon name="close" />
    </button>
  );
}

export function QueueRow({ item, onRunScan, onOpenDetails, onRemove }: QueueRowProps) {
  const { t } = useTranslation();
  const isActive = item.status === 'uploading' || item.status === 'scanning';
  const tone = verdictTone(item.verdict);
  const detections = item.detections ?? 0;
  const engines = item.engines ?? 0;
  const relativeTime = formatRelativeTime(item.createdAt);
  const sizeLabel = item.size > 0 ? formatSize(item.size) : null;
  const countLabel =
    item.isFolder && item.fileCount !== undefined ? t('queueFileCount', { count: item.fileCount }) : null;
  const meta = [item.type, sizeLabel, countLabel, relativeTime].filter(Boolean).join(' · ');
  const nativeIcon = useFileIcon(item.path);

  const extra = isActive ? (
    <div className="scan-row-progress">
      <div className="progress">
        <i style={{ width: `${item.progress}%` }} />
      </div>
      <span className="scan-row-progress-label">
        {t(item.status)} · {item.progress}%
      </span>
    </div>
  ) : item.status === 'failed' && item.error ? (
    <div className="scan-row-error" title={item.error}>
      <Icon name="alert" />
      <span>{item.error}</span>
    </div>
  ) : null;

  return (
    <ScanRow
      name={item.name}
      kind={item.fileKind}
      tone={tone}
      meta={meta}
      status={item.status}
      nativeIcon={nativeIcon}
      summary={item.status === 'completed' ? `${detections}/${engines} ${t('engines')}` : undefined}
      extra={extra}
      onOpen={item.status === 'completed' ? () => onOpenDetails(item) : undefined}
      actions={
        <>
          {item.status === 'completed' && item.verdict ? (
            <span className={`pill ${tone}`}>{t(item.verdict)}</span>
          ) : (
            <span className={`pill ${isActive ? 'teal' : item.status}`}>{t(item.status)}</span>
          )}
          <OpenFolderButton path={item.path} />
          {item.status === 'failed' ? (
            <Button variant="quiet" icon="refresh" onClick={() => onRunScan(item)}>
              {t('retry')}
            </Button>
          ) : item.status === 'queued' ? (
            <Button variant="quiet" icon="arrow" onClick={() => onRunScan(item)}>
              {t('startScan')}
            </Button>
          ) : isActive ? (
            <span className="spinner" aria-label={t(item.status)} />
          ) : null}
          {isActive ? null : <RemoveButton label={t('removeItem')} onClick={() => onRemove(item.id)} />}
        </>
      }
    />
  );
}

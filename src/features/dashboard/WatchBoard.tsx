import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { FileReport, ScanItem, ScanStatus } from '@/core/domain/types';
import { verdictTone, type VerdictTone } from '@/app/utils/verdict';
import { detectionCount, engineTotal, formatRelativeTime } from '@/app/utils/format';
import { Icon } from '@/components/ui/Icon';

interface WatchBoardProps {
  items: ScanItem[];
  history: FileReport[];
  onOpenQueue: () => void;
  onOpenHistory: () => void;
  onOpenReport: (report: FileReport) => void;
}

type StatTone = VerdictTone | 'teal';

const QUEUE_PRIORITY: ScanStatus[] = ['scanning', 'uploading', 'queued'];

function isActiveItem(item: ScanItem): boolean {
  return item.status === 'queued' || item.status === 'uploading' || item.status === 'scanning';
}

function dominantQueueStatus(items: ScanItem[]): ScanStatus | null {
  return QUEUE_PRIORITY.find((status) => items.some((item) => item.status === status)) ?? null;
}

function threatCaption(historyCount: number, threatCount: number, t: TFunction): string {
  if (historyCount === 0) return t('noScans');
  if (threatCount === 0) return t('historyAllClear');
  return t('ofScans', { count: historyCount });
}

function threatToneFor(historyCount: number, threatCount: number): StatTone {
  if (threatCount > 0) return 'danger';
  if (historyCount > 0) return 'success';
  return 'muted';
}

function WatchScope({ live }: { live: boolean }) {
  return (
    <span className={`watch-scope${live ? ' is-live' : ''}`} aria-hidden="true">
      <span className="watch-scope-sweep" />
      <Icon name="shield" />
    </span>
  );
}

function PulseCopy({
  eyebrow,
  verdict,
  file,
  meta,
  cta,
  live,
}: {
  eyebrow: string;
  verdict: string;
  file: string;
  meta?: { detections: string; time: string };
  cta?: string;
  live: boolean;
}) {
  return (
    <>
      <WatchScope live={live} />
      <span className="watch-pulse-copy">
        <span className="eyebrow">{eyebrow}</span>
        <strong className="watch-pulse-verdict">{verdict}</strong>
        <span className="watch-pulse-file" title={file}>
          {file}
        </span>
        {meta ? (
          <span className="watch-pulse-meta">
            <b className="mono">{meta.detections}</b>
            <span aria-hidden="true">·</span>
            <span>{meta.time}</span>
          </span>
        ) : null}
        {cta ? (
          <span className="watch-pulse-cta">
            {cta}
            <Icon name="arrow" />
          </span>
        ) : null}
      </span>
    </>
  );
}

function WatchStat({
  label,
  value,
  caption,
  tone,
  icon,
  live,
  onClick,
}: {
  label: string;
  value: number;
  caption: string;
  tone: StatTone;
  icon: string;
  live?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`watch-stat tone-${tone}`} onClick={onClick}>
      <span className="watch-stat-top">
        <span className="watch-stat-label">
          {live ? <span className="watch-live" aria-hidden="true" /> : null}
          {label}
        </span>
        <span className="watch-stat-icon">
          <Icon name={icon} />
        </span>
      </span>
      <strong className="watch-stat-value">{value}</strong>
      <span className="watch-stat-caption">{caption}</span>
    </button>
  );
}

export function WatchBoard({ items, history, onOpenQueue, onOpenHistory, onOpenReport }: WatchBoardProps) {
  const { t } = useTranslation();
  const latest = history[0];
  const activeCount = items.filter(isActiveItem).length;
  const flaggedCount = history.filter(
    (report) => report.verdict === 'malicious' || report.verdict === 'suspicious',
  ).length;
  const queueStatus = dominantQueueStatus(items);
  const pulseTone = latest ? verdictTone(latest.verdict) : 'muted';
  const live = activeCount > 0;

  return (
    <section className="watch-board" aria-label={t('overview')}>
      {latest ? (
        <button
          type="button"
          className={`watch-pulse tone-${pulseTone}`}
          onClick={() => onOpenReport(latest)}
          aria-label={`${t(latest.verdict)}: ${latest.name}`}
        >
          <PulseCopy
            eyebrow={t('latestSignal')}
            verdict={t(latest.verdict)}
            file={latest.name}
            meta={{
              detections: `${detectionCount(latest)}/${engineTotal(latest)}`,
              time: formatRelativeTime(latest.scannedAt),
            }}
            cta={t('pulseOpenReport')}
            live={live}
          />
        </button>
      ) : (
        <div className={`watch-pulse tone-${pulseTone}`}>
          <PulseCopy
            eyebrow={t('latestSignal')}
            verdict={t('pulseAwaiting')}
            file={t('pulseAwaitingCopy')}
            live={live}
          />
        </div>
      )}
      <WatchStat
        label={t('queue')}
        value={activeCount}
        caption={queueStatus ? t(queueStatus) : t('queueIdle')}
        tone={live ? 'teal' : 'muted'}
        icon="queue"
        live={live}
        onClick={onOpenQueue}
      />
      <WatchStat
        label={t('threatsFound')}
        value={flaggedCount}
        caption={threatCaption(history.length, flaggedCount, t)}
        tone={threatToneFor(history.length, flaggedCount)}
        icon="alert"
        onClick={onOpenHistory}
      />
    </section>
  );
}

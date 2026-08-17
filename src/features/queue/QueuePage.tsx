import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'motion/react';
import type { ScanItem } from '@/core/domain/types';
import { useAppStore } from '@/core/state/store';
import { Button } from '@/components/ui/Button';
import { DropSymbol, DropZone } from '@/components/ui/DropZone';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { PageTitle } from '@/components/ui/PageTitle';
import { QueueRow } from './QueueRow';

type FilterMode = 'all' | 'active' | 'queued' | 'completed' | 'failed';

interface QueuePageProps {
  items: ScanItem[];
  dragging: boolean;
  runScan: (item: ScanItem) => void;
  startAll: () => void;
  clearCompleted: () => void;
  clearQueue: () => void;
  onOpenDetails: (item: ScanItem) => void;
  pickPath: () => Promise<void>;
  setDragging: (dragging: boolean) => void;
}

const FILTERS: { value: FilterMode; labelKey: string; tone: string }[] = [
  { value: 'all', labelKey: 'queueFilterAll', tone: 'muted' },
  { value: 'active', labelKey: 'queueFilterActive', tone: 'teal' },
  { value: 'queued', labelKey: 'queued', tone: 'muted' },
  { value: 'completed', labelKey: 'completed', tone: 'success' },
  { value: 'failed', labelKey: 'failed', tone: 'danger' },
];

function isRunningItem(item: ScanItem): boolean {
  return item.status === 'uploading' || item.status === 'scanning';
}

function compareQueueItems(a: ScanItem, b: ScanItem): number {
  const runningDelta = Number(isRunningItem(b)) - Number(isRunningItem(a));
  if (runningDelta !== 0) return runningDelta;
  const byCreated = b.createdAt.localeCompare(a.createdAt);
  if (byCreated !== 0) return byCreated;
  return b.id.localeCompare(a.id);
}

function filterItems(items: ScanItem[], mode: FilterMode): ScanItem[] {
  switch (mode) {
    case 'active':
      return items.filter(isRunningItem);
    case 'queued':
      return items.filter((item) => item.status === 'queued');
    case 'completed':
      return items.filter((item) => item.status === 'completed');
    case 'failed':
      return items.filter((item) => item.status === 'failed');
    default:
      return items;
  }
}

function visibleQueueItems(items: ScanItem[], mode: FilterMode): ScanItem[] {
  return [...filterItems(items, mode)].sort(compareQueueItems);
}

export function QueuePage({
  items,
  dragging,
  runScan,
  startAll,
  clearCompleted,
  clearQueue,
  onOpenDetails,
  pickPath,
  setDragging,
}: QueuePageProps) {
  const { t } = useTranslation();
  const removeItem = useAppStore((state) => state.removeItem);
  const [filter, setFilter] = useState<FilterMode>('all');

  const counts = useMemo(
    () => ({
      all: items.length,
      active: items.filter(isRunningItem).length,
      queued: items.filter((item) => item.status === 'queued').length,
      completed: items.filter((item) => item.status === 'completed').length,
      failed: items.filter((item) => item.status === 'failed').length,
    }),
    [items],
  );

  const filtered = useMemo(() => visibleQueueItems(items, filter), [items, filter]);
  const hasStartable = counts.queued + counts.failed > 0;
  const hasFinished = counts.completed + counts.failed > 0;
  const hasAny = items.length > 0;

  return (
    <div className="screen queue-screen">
      <PageTitle
        title={t('queueTitle')}
        subtitle={t('queueSubtitle')}
        action={
          <div className="button-row">
            <Button variant="quiet" icon="trash" onClick={clearQueue} disabled={!hasAny}>
              {t('clearQueue')}
            </Button>
            <Button icon="shield" onClick={startAll} disabled={!hasStartable}>
              {t('startScan')}
            </Button>
          </div>
        }
      />

      <div className="queue-toolbar">
        <div className="segment-group queue-filter" role="tablist" aria-label={t('queue')}>
          {FILTERS.map((option) => {
            const count = counts[option.value];
            const isSelected = filter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`segment tone-${option.tone}${isSelected ? ' selected' : ''}`}
                onClick={() => setFilter(option.value)}
              >
                <span>{t(option.labelKey)}</span>
                <b>{count}</b>
              </button>
            );
          })}
        </div>
        <div className="button-row">
          <Button variant="outline" icon="upload" onClick={() => void pickPath()}>
            {t('chooseFile')}
          </Button>
        </div>
      </div>

      {hasFinished ? (
        <div className="queue-clear-row">
          <span className="queue-clear-hint">{t('queueClearHint', { count: counts.completed + counts.failed })}</span>
          <button type="button" className="link-button" onClick={clearCompleted}>
            <Icon name="trash" />
            {t('clearCompleted')}
          </button>
        </div>
      ) : null}

      {!hasAny ? (
        <DropZone className="surface queue-empty" dragging={dragging} setDragging={setDragging}>
          <DropSymbol locked={dragging} />
          <h3>{dragging ? t('dropHoverTitle') : t('queueEmptyTitle')}</h3>
          <p>{dragging ? t('dropHoverCopy') : t('queueEmptyCopy')}</p>
          <div className="button-row">
            <Button icon="upload" onClick={() => void pickPath()}>
              {t('chooseFile')}
            </Button>
          </div>
        </DropZone>
      ) : filtered.length === 0 ? (
        <EmptyState title={t('queueFilterEmptyTitle')} copy={t('queueFilterEmptyCopy')} />
      ) : (
        <div className="queue-list">
          <AnimatePresence mode="popLayout" initial={false}>
            {filtered.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                onRunScan={runScan}
                onOpenDetails={onOpenDetails}
                onRemove={removeItem}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'motion/react';
import type { FileReport } from '@/core/domain/types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FileReportRow } from '@/components/ui/FileReportRow';
import { Icon } from '@/components/ui/Icon';
import { PageTitle } from '@/components/ui/PageTitle';
import { countReportsByVerdict, groupReportsByDay, queryHistory, type HistoryFilter } from './historyQuery';

const FILTERS: { value: HistoryFilter; labelKey: string; tone: string }[] = [
  { value: 'all', labelKey: 'all', tone: 'muted' },
  { value: 'malicious', labelKey: 'historyFilterMalicious', tone: 'danger' },
  { value: 'suspicious', labelKey: 'historyFilterSuspicious', tone: 'warning' },
  { value: 'clean', labelKey: 'historyFilterClean', tone: 'success' },
];

interface HistoryListPageProps {
  history: FileReport[];
  search: string;
  setSearch: (value: string) => void;
  filter: HistoryFilter;
  setFilter: (value: HistoryFilter) => void;
  onOpen: (report: FileReport) => void;
  onRemove: (report: FileReport) => void;
  onClear: () => void;
}

export function HistoryListPage({
  history,
  search,
  setSearch,
  filter,
  setFilter,
  onOpen,
  onRemove,
  onClear,
}: HistoryListPageProps) {
  const { t, i18n } = useTranslation();
  const counts = useMemo(() => countReportsByVerdict(history), [history]);
  const filtered = useMemo(() => queryHistory(history, filter, search), [filter, history, search]);
  const groups = useMemo(() => groupReportsByDay(filtered), [filtered]);
  const hasAny = history.length > 0;
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }), [i18n.language]);

  return (
    <div className="screen history-screen">
      <PageTitle
        title={t('historyTitle')}
        subtitle={t('historySubtitle')}
        action={
          <Button variant="quiet" icon="trash" onClick={onClear} disabled={!hasAny}>
            {t('clearHistory')}
          </Button>
        }
      />

      <div className="history-toolbar">
        <div className="segment-group queue-filter" role="tablist" aria-label={t('history')}>
          {FILTERS.map((option) => {
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
                <b>{counts[option.value]}</b>
              </button>
            );
          })}
        </div>
        <label className="search history-search">
          <Icon name="search" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
          />
        </label>
      </div>

      {!hasAny ? (
        <EmptyState title={t('noHistory')} copy={t('noHistoryCopy')} />
      ) : filtered.length === 0 ? (
        <EmptyState title={t('historyFilterEmptyTitle')} copy={t('historyFilterEmptyCopy')} />
      ) : (
        <div className="history-list">
          {groups.map((group) => (
            <section key={group.key} className="history-group">
              <h2 className="history-group-label">
                {group.kind === 'today'
                  ? t('historyToday')
                  : group.kind === 'yesterday'
                    ? t('historyYesterday')
                    : dateFormat.format(group.date)}
              </h2>
              <div className="history-group-rows">
                <AnimatePresence mode="popLayout" initial={false}>
                  {group.reports.map((report) => (
                    <FileReportRow key={report.itemId} report={report} onOpen={onOpen} onRemove={onRemove} />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

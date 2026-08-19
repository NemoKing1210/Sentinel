import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { FileReport } from '@/core/domain/types';
import { useFileExists } from '@/app/hooks/useFileExists';
import { useFileIcon } from '@/app/hooks/useFileIcon';
import { describePreset, useToast } from '@/app/hooks/useToast';
import { detectionCount, engineTotal, formatDateTime, formatSize } from '@/app/utils/format';
import { verdictTone } from '@/app/utils/verdict';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { fileIconName, Icon } from '@/components/ui/Icon';
import { StatusIcon } from '@/components/ui/StatusIcon';
import { openExternalUrl, openFolderContaining } from '@/core/native/api';
import { logError } from '@/core/logging';
import {
  engineCategoryIcon,
  engineCategoryLabelKey,
  enginePillTone,
  presentHashes,
  queryEngines,
  reportKind,
  statsSegments,
  type EngineFilter,
  type StatsKey,
} from './historyQuery';

const ENGINE_FILTERS: { value: EngineFilter; labelKey: string; tone: string }[] = [
  { value: 'all', labelKey: 'all', tone: 'muted' },
  { value: 'flagged', labelKey: 'engineFilterFlagged', tone: 'danger' },
  { value: 'clean', labelKey: 'engineFilterClean', tone: 'success' },
  { value: 'unsupported', labelKey: 'engineFilterUnsupported', tone: 'muted' },
];

const STAT_LABEL: Record<StatsKey, string> = {
  malicious: 'malicious',
  suspicious: 'suspicious',
  undetected: 'undetected',
  harmless: 'harmless',
};

const engineCardTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;

interface HistoryReportPageProps {
  report: FileReport;
  onBack: () => void;
  onRemove: (report: FileReport) => void;
}

export function HistoryReportPage({ report, onBack, onRemove }: HistoryReportPageProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [engineQuery, setEngineQuery] = useState('');
  const [engineFilter, setEngineFilter] = useState<EngineFilter>('all');
  const kind = reportKind(report);
  const tone = verdictTone(report.verdict);
  const hashes = useMemo(() => presentHashes(report), [report]);
  const segments = useMemo(() => statsSegments(report), [report]);
  const engines = useMemo(
    () => queryEngines(report.engines, engineFilter, engineQuery),
    [engineFilter, engineQuery, report.engines],
  );
  const detections = detectionCount(report);
  const total = engineTotal(report);
  const nativeIcon = useFileIcon(report.path);
  const fileStillExists = useFileExists(report.path);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      onBack();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onBack]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(describePreset('hashCopied', t, { label }));
    } catch (error) {
      logError('history.copy_failed', { label, error: String(error) });
      showToast(describePreset('copyFailed', t));
    }
  };

  const openVt = async () => {
    try {
      await openExternalUrl(report.vtUrl);
    } catch (error) {
      logError('history.vt_open_failed', { error: String(error) });
      showToast(describePreset('vtOpenFailed', t));
    }
  };

  return (
    <div className="screen history-screen history-report-screen">
      <div className="history-report-nav">
        <Button variant="quiet" icon="back" onClick={onBack}>
          {t('historyBack')}
        </Button>
        <div className="button-row">
          {fileStillExists && report.path ? (
            <Button variant="quiet" icon="folder" onClick={() => void openFolderContaining(report.path!)}>
              {t('openFolder')}
            </Button>
          ) : null}
          <Button variant="outline" icon="external" onClick={() => void openVt()}>
            {t('openReport')}
          </Button>
          <Button variant="quiet" icon="trash" onClick={() => onRemove(report)}>
            {t('removeReport')}
          </Button>
        </div>
      </div>

      <Card className={`history-report-hero kind-${kind} tone-${tone}`}>
        <div className="history-report-heading">
          <span className="history-report-file-icon">
            {nativeIcon ? (
              <img className="history-report-native-icon" src={nativeIcon} alt="" />
            ) : (
              <Icon name={fileIconName(kind)} />
            )}
          </span>
          <div className="history-report-title">
            <span className="eyebrow">{t('report')}</span>
            <h1 title={report.name}>
              <a
                className="history-report-title-link"
                href={report.vtUrl}
                onClick={(event) => {
                  event.preventDefault();
                  void openVt();
                }}
              >
                {report.name}
                <Icon name="external" />
              </a>
            </h1>
            <small>
              {[report.type, report.size > 0 ? formatSize(report.size) : null, formatDateTime(report.scannedAt)]
                .filter(Boolean)
                .join(' · ')}
            </small>
          </div>
          <StatusIcon verdict={report.verdict} />
        </div>

        <div className={`history-verdict ${tone}`}>
          <div>
            <strong>{t(report.verdict)}</strong>
            <span>
              {detections} / {total} {t('detections')}
            </span>
          </div>
          <div className="history-stats-bar" aria-hidden={segments.length === 0}>
            {segments.length === 0 ? (
              <i className="history-stats-seg empty" />
            ) : (
              segments.map((segment) => (
                <i
                  key={segment.key}
                  className={`history-stats-seg ${segment.key}`}
                  style={{ flexGrow: segment.value }}
                />
              ))
            )}
          </div>
          <ul className="history-stats-legend">
            {segments.map((segment) => (
              <li key={segment.key}>
                <i className={`history-stats-dot ${segment.key}`} />
                <span>
                  {t(STAT_LABEL[segment.key])} · {segment.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {hashes.length > 0 ? (
        <Card className="history-report-section">
          <span className="eyebrow section-label">{t('metadata')}</span>
          <div className="history-hashes">
            {hashes.map((entry) => (
              <div key={entry.key} className="history-hash-row">
                <small>{t(entry.key)}</small>
                <code title={entry.value}>{entry.value}</code>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => void copy(entry.value, t(entry.key))}
                  aria-label={t('copy')}
                >
                  <Icon name="copy" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="history-report-section">
        <span className="eyebrow section-label">{t('engineResults')}</span>
        <div className="history-engine-toolbar">
          <div
            className="segment-group queue-filter history-engine-filter"
            role="tablist"
            aria-label={t('engineResults')}
          >
            {ENGINE_FILTERS.map((option) => {
              const isSelected = engineFilter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`segment tone-${option.tone}${isSelected ? ' selected' : ''}`}
                  onClick={() => setEngineFilter(option.value)}
                >
                  {t(option.labelKey)}
                </button>
              );
            })}
          </div>
          <label className="search history-search">
            <Icon name="search" />
            <input
              value={engineQuery}
              onChange={(event) => setEngineQuery(event.target.value)}
              placeholder={t('engineSearch')}
              aria-label={t('engineSearch')}
            />
          </label>
        </div>
        {engines.length === 0 ? (
          <div className="history-engine-empty">
            <strong>{t('engineFilterEmptyTitle')}</strong>
            <p>{t('engineFilterEmptyCopy')}</p>
          </div>
        ) : (
          <div className="engine-list history-engine-list">
            <AnimatePresence mode="popLayout" initial={false}>
              {engines.map((engine) => (
                <motion.div
                  layout
                  key={engine.name}
                  initial={{ opacity: 0, y: -14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={engineCardTransition}
                >
                  <span>{engine.name}</span>
                  <small className={`pill ${enginePillTone(engine.category)}`}>
                    <Icon name={engineCategoryIcon(engine.category)} />
                    {engine.result || t(engineCategoryLabelKey(engine.category))}
                  </small>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </Card>
    </div>
  );
}

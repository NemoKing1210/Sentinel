import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'motion/react';
import type { FileReport, ScanItem } from '@/core/domain/types';
import type { View } from '@/app/constants';
import { useRemoveReport } from '@/app/hooks/useRemoveReport';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DropSymbol, DropZone } from '@/components/ui/DropZone';
import { EmptyState } from '@/components/ui/EmptyState';
import { FileReportRow } from '@/components/ui/FileReportRow';
import { Icon } from '@/components/ui/Icon';
import { PageTitle } from '@/components/ui/PageTitle';
import { Switch } from '@/components/ui/Switch';
import { WatchBoard } from './WatchBoard';

interface DashboardPageProps {
  items: ScanItem[];
  history: FileReport[];
  dragging: boolean;
  hasApiKey: boolean;
  scanImmediately: boolean;
  setScanImmediately: (v: boolean) => void;
  setDragging: (v: boolean) => void;
  pickPath: () => Promise<void>;
  setView: (view: View) => void;
  setReport: (report: FileReport | null) => void;
}

export function DashboardPage({
  items,
  history,
  dragging,
  hasApiKey,
  scanImmediately,
  setScanImmediately,
  setDragging,
  pickPath,
  setView,
  setReport,
}: DashboardPageProps) {
  const { t } = useTranslation();
  const removeReport = useRemoveReport();
  const recent = history.slice(0, 5);
  const openReport = (report: FileReport) => {
    setReport(report);
    setView('history');
  };
  return (
    <div className="screen dashboard-screen">
      <PageTitle title={t('overview')} subtitle={t('overviewCopy')} />
      {!hasApiKey ? (
        <Card className="key-banner">
          <span className="key-banner-icon">
            <Icon name="key" />
          </span>
          <div className="key-banner-copy">
            <strong>{t('keyRequired')}</strong>
            <p>{t('statusNeedsKey')}</p>
          </div>
          <Button variant="quiet" icon="tune" onClick={() => setView('settings')}>
            {t('settings')}
          </Button>
        </Card>
      ) : null}
      <DropZone className="drop-card" dragging={dragging} setDragging={setDragging}>
        <DropSymbol locked={dragging} />
        <h2>{dragging ? t('dropHoverTitle') : t('dropTitle')}</h2>
        <p>{dragging ? t('dropHoverCopy') : t('dropCopy')}</p>
        <div className="button-row">
          <Button icon="upload" onClick={() => void pickPath()}>
            {t('chooseFile')}
          </Button>
        </div>
        <div className="drop-hints">
          <span>
            <Icon name="folder" />
            {t('folderArchive')}
          </span>
          <span>
            <Icon name="clock" />
            {t('warningLarge')}
          </span>
        </div>
        <div className="drop-actions">
          <Switch
            checked={scanImmediately}
            onChange={setScanImmediately}
            label={t('scanImmediately')}
            description={t('scanImmediatelyHint')}
            ariaLabel={t('scanImmediately')}
          />
        </div>
        <span className="drop-note">
          {t('publicApi')} · {hasApiKey ? t('statusReady') : t('statusNeedsKey')}
        </span>
      </DropZone>
      <WatchBoard
        items={items}
        history={history}
        onOpenQueue={() => setView('queue')}
        onOpenHistory={() => setView('history')}
        onOpenReport={openReport}
      />
      {recent.length > 0 ? (
        <section className="recent">
          <div className="recent-head">
            <div>
              <span className="eyebrow">{t('history')}</span>
              <h2>{t('recentScans')}</h2>
            </div>
            <Button variant="quiet" icon="arrow" onClick={() => setView('history')}>
              {t('seeAll')}
            </Button>
          </div>
          <div className="list">
            <AnimatePresence mode="popLayout" initial={false}>
              {recent.map((report) => (
                <FileReportRow
                  key={report.itemId}
                  report={report}
                  onOpen={openReport}
                  onRemove={(item) => void removeReport(item)}
                />
              ))}
            </AnimatePresence>
          </div>
        </section>
      ) : (
        <EmptyState title={t('noScans')} copy={t('noScansCopy')} />
      )}
    </div>
  );
}

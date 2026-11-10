import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScanItem } from '@/core/domain/types';
import { useAppStore } from '@/core/state/store';
import { confirmAction, openFolderContaining, pickFolder } from '@/core/native/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { PageTitle } from '@/components/ui/PageTitle';
import { createWatchRule, validateWatchDraft, type WatchRuleErrorKey } from './watchRules';
import { WatchFolderCard } from './WatchFolderCard';

const ACTIVE_STATUSES: ReadonlySet<ScanItem['status']> = new Set(['queued', 'waiting', 'uploading', 'scanning']);

export function WatchPage() {
  const { t } = useTranslation();
  const watchedFolders = useAppStore((state) => state.watchedFolders);
  const watchStatuses = useAppStore((state) => state.watchStatuses);
  const items = useAppStore((state) => state.items);
  const history = useAppStore((state) => state.history);
  const addWatchFolder = useAppStore((state) => state.addWatchFolder);
  const updateWatchFolder = useAppStore((state) => state.updateWatchFolder);
  const removeWatchFolder = useAppStore((state) => state.removeWatchFolder);
  const [errorKey, setErrorKey] = useState<WatchRuleErrorKey | null>(null);

  const lastScanByWatch = useMemo(() => {
    const result = new Map<string, string>();
    for (const report of history) {
      if (!report.watchId) continue;
      const current = result.get(report.watchId);
      if (!current || report.scannedAt > current) result.set(report.watchId, report.scannedAt);
    }
    return result;
  }, [history]);

  const addFolder = async () => {
    const [path] = await pickFolder();
    if (!path) return;
    const rule = createWatchRule(path, crypto.randomUUID());
    const error = validateWatchDraft(rule, useAppStore.getState().watchedFolders);
    if (error) {
      setErrorKey(error);
      return;
    }
    setErrorKey(null);
    addWatchFolder(rule);
  };

  const removeFolder = async (id: string, path: string) => {
    const confirmed = await confirmAction({
      title: t('watchRemoveTitle'),
      message: t('watchRemoveCopy', { path }),
      kind: 'warning',
      okLabel: t('watchRemove'),
    });
    if (confirmed) removeWatchFolder(id);
  };

  return (
    <div className="screen watch-screen">
      <PageTitle
        title={t('watchTitle')}
        subtitle={t('watchSubtitle')}
        action={
          <Button icon="folder" onClick={() => void addFolder()}>
            {t('watchAddFolder')}
          </Button>
        }
      />
      {errorKey ? <p className="watch-error">{t(errorKey)}</p> : null}
      {watchedFolders.length === 0 ? (
        <Card className="watch-empty">
          <span className="empty-mark">
            <Icon name="eye" size={32} />
          </span>
          <h3>{t('watchEmptyTitle')}</h3>
          <p>{t('watchEmptyCopy')}</p>
          <Button icon="folder" onClick={() => void addFolder()}>
            {t('watchAddFolder')}
          </Button>
        </Card>
      ) : (
        <div className="watch-list">
          {watchedFolders.map((rule) => (
            <WatchFolderCard
              key={rule.id}
              rule={rule}
              status={watchStatuses[rule.id]}
              activeCount={items.filter((item) => item.watchId === rule.id && ACTIVE_STATUSES.has(item.status)).length}
              lastScan={lastScanByWatch.get(rule.id)}
              onToggle={(enabled) => updateWatchFolder(rule.id, { enabled })}
              onOpenFolder={() => void openFolderContaining(rule.path)}
              onRemove={() => void removeFolder(rule.id, rule.path)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import type { WatchRule, WatchState, WatchStatus } from '@/core/domain/types';
import { watchFolderName } from '@/core/domain/watch';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Switch';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatRelativeTime } from '@/app/utils/format';
import { watchRuleSummary } from './watchRules';

const STATUS_KEYS: Record<WatchState, string> = {
  watching: 'watchStatusWatching',
  disabled: 'watchStatusDisabled',
  indexing: 'watchStatusIndexing',
  missing: 'watchStatusMissing',
  error: 'watchStatusError',
};

interface WatchFolderCardProps {
  rule: WatchRule;
  status?: WatchStatus;
  activeCount: number;
  lastScan?: string;
  onToggle: (enabled: boolean) => void;
  onOpenFolder: () => void;
  onRemove: () => void;
}

export function WatchFolderCard({
  rule,
  status,
  activeCount,
  lastScan,
  onToggle,
  onOpenFolder,
  onRemove,
}: WatchFolderCardProps) {
  const { t } = useTranslation();
  const state: WatchState = status?.state ?? (rule.enabled ? 'watching' : 'disabled');
  const summary = watchRuleSummary(rule, t);
  return (
    <Card className={`watch-card is-${state}`}>
      <div className="watch-card-head">
        <div className="watch-card-title">
          <strong>{watchFolderName(rule.path)}</strong>
          <Tooltip content={rule.path}>
            <span className="watch-path">{rule.path}</span>
          </Tooltip>
        </div>
        <Switch
          checked={rule.enabled}
          onChange={onToggle}
          ariaLabel={rule.enabled ? t('watchStatusWatching') : t('watchStatusDisabled')}
        />
      </div>
      <div className={`watch-status is-${state}`}>
        <span className="watch-status-dot" aria-hidden="true" />
        <span>{t(STATUS_KEYS[state])}</span>
        {status?.error ? <span className="watch-status-error">{status.error}</span> : null}
      </div>
      <ul className="watch-summary">
        {summary.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="watch-meta">
        <span>{activeCount > 0 ? t('watchQueueCount', { count: activeCount }) : t('watchNoActivity')}</span>
        {lastScan ? <span>{t('watchLastScan', { time: formatRelativeTime(lastScan) })}</span> : null}
      </div>
      <div className="watch-actions">
        <Button variant="outline" icon="folder" onClick={onOpenFolder}>
          {t('watchOpenFolder')}
        </Button>
        <Button variant="quiet" icon="trash" onClick={onRemove}>
          {t('watchRemove')}
        </Button>
      </div>
    </Card>
  );
}

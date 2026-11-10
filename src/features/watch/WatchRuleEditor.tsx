import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { WatchNotifyMode, WatchRule } from '@/core/domain/types';
import { WATCH_MAX_SETTLE_MS, WATCH_MIN_SETTLE_MS } from '@/core/domain/watch';
import { pickFolder } from '@/core/native/api';
import { Button } from '@/components/ui/Button';
import { Select, type SelectOption } from '@/components/ui/Select';
import { StepperInput } from '@/components/ui/StepperInput';
import { Switch } from '@/components/ui/Switch';
import { ExtensionChips } from './ExtensionChips';
import { bytesToSizeMegabytes, sizeMegabytesToBytes, validateWatchDraft } from './watchRules';

const DEPTH_VALUES = [1, 2, 3, 5, 10] as const;
const MAX_SIZE_MB = 650;

type DepthValue = `${number}` | 'all';

interface WatchRuleEditorProps {
  draft: WatchRule;
  others: WatchRule[];
  onChange: (next: WatchRule) => void;
  onSave: () => void;
  onCancel: () => void;
}

function depthOptions(rule: WatchRule, t: TFunction): SelectOption<DepthValue>[] {
  const depths = new Set<number>(DEPTH_VALUES);
  if (rule.maxDepth !== null) depths.add(rule.maxDepth);
  const options: SelectOption<DepthValue>[] = [...depths]
    .sort((a, b) => a - b)
    .map((depth) => ({ value: String(depth) as DepthValue, label: t('watchDepthValue', { count: depth }) }));
  options.push({ value: 'all', label: t('watchDepthAll') });
  return options;
}

export function WatchRuleEditor({ draft, others, onChange, onSave, onCancel }: WatchRuleEditorProps) {
  const { t } = useTranslation();
  const error = validateWatchDraft(draft, others);
  const depth: DepthValue = draft.maxDepth === null ? 'all' : (String(draft.maxDepth) as DepthValue);
  const notifyOptions: SelectOption<WatchNotifyMode>[] = [
    { value: 'all', label: t('watchNotifyAll') },
    { value: 'threats', label: t('watchNotifyThreats') },
    { value: 'none', label: t('watchNotifyNone') },
  ];

  const changePath = async () => {
    const [path] = await pickFolder();
    if (path) onChange({ ...draft, path });
  };

  return (
    <section className="watch-editor" aria-label={t('watchEditTitle')}>
      <h3>{t('watchEditTitle')}</h3>

      <div className="watch-field">
        <span className="watch-field-label">{t('watchFieldPath')}</span>
        <div className="watch-editor-path">
          <span className="watch-path" title={draft.path}>
            {draft.path}
          </span>
          <Button variant="outline" icon="folder" onClick={() => void changePath()}>
            {t('watchChangeFolder')}
          </Button>
        </div>
      </div>

      <Switch
        checked={draft.enabled}
        onChange={(enabled) => onChange({ ...draft, enabled })}
        label={t('watchFieldEnabled')}
      />

      <div className="watch-field">
        <span className="watch-field-label">{t('watchFieldDepth')}</span>
        <Select
          value={depth}
          options={depthOptions(draft, t)}
          onChange={(next) => onChange({ ...draft, maxDepth: next === 'all' ? null : Number(next) })}
          ariaLabel={t('watchFieldDepth')}
        />
      </div>

      <ExtensionChips
        values={draft.includeExtensions}
        onChange={(includeExtensions) => onChange({ ...draft, includeExtensions })}
        label={t('watchFieldInclude')}
        placeholder={t('watchExtensionsHint')}
      />

      <ExtensionChips
        values={draft.excludeExtensions}
        onChange={(excludeExtensions) => onChange({ ...draft, excludeExtensions })}
        label={t('watchFieldExclude')}
        placeholder={t('watchExtensionsHint')}
      />

      <div className="watch-field">
        <span className="watch-field-label">{t('watchFieldMaxSize')}</span>
        <StepperInput
          value={bytesToSizeMegabytes(draft.maxSizeBytes)}
          onChange={(megabytes) => onChange({ ...draft, maxSizeBytes: sizeMegabytesToBytes(megabytes) })}
          min={1}
          max={MAX_SIZE_MB}
          unit="MB"
          ariaLabel={t('watchFieldMaxSize')}
        />
      </div>

      <Switch
        checked={draft.ignoreHidden}
        onChange={(ignoreHidden) => onChange({ ...draft, ignoreHidden })}
        label={t('watchFieldIgnoreHidden')}
      />
      <Switch
        checked={draft.ignoreTemp}
        onChange={(ignoreTemp) => onChange({ ...draft, ignoreTemp })}
        label={t('watchFieldIgnoreTemp')}
      />
      <Switch
        checked={draft.scanMissedWhileClosed}
        onChange={(scanMissedWhileClosed) => onChange({ ...draft, scanMissedWhileClosed })}
        label={t('watchFieldMissed')}
      />

      <div className="watch-field">
        <span className="watch-field-label">{t('watchFieldNotify')}</span>
        <Select
          value={draft.notify}
          options={notifyOptions}
          onChange={(notify) => onChange({ ...draft, notify })}
          ariaLabel={t('watchFieldNotify')}
        />
      </div>

      <details className="watch-advanced">
        <summary>{t('watchAdvanced')}</summary>
        <div className="watch-field">
          <span className="watch-field-label">{t('watchFieldSettle')}</span>
          <StepperInput
            value={draft.settleMs}
            onChange={(settleMs) => onChange({ ...draft, settleMs })}
            min={WATCH_MIN_SETTLE_MS}
            max={WATCH_MAX_SETTLE_MS}
            step={100}
            unit="ms"
            ariaLabel={t('watchFieldSettle')}
          />
        </div>
      </details>

      {error ? <p className="watch-error">{t(error)}</p> : null}

      <div className="watch-editor-actions">
        <Button onClick={onSave} disabled={Boolean(error)}>
          {t('save')}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </section>
  );
}

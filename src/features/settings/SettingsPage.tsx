import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppSettings, Language, LogLevel, ReportOpenTarget } from '@/core/domain/types';
import {
  LANGUAGES,
  LOG_LEVELS,
  POLL_INTERVAL_MAX,
  POLL_INTERVAL_MIN,
  POLL_INTERVALS,
  SCAN_CONCURRENCY_MAX,
  SCAN_CONCURRENCY_MIN,
  SCAN_DELAY_MAX_SECONDS,
  SCAN_DELAY_MIN_SECONDS,
} from '@/app/constants';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { PageTitle } from '@/components/ui/PageTitle';
import { Select } from '@/components/ui/Select';
import { StepperInput } from '@/components/ui/StepperInput';
import { Switch } from '@/components/ui/Switch';
import { PROJECT_META } from '@/app/utils/packageMeta';

interface SettingsPageProps {
  settings: AppSettings;
  apiKey: string;
  showApiKey: boolean;
  toggleApiKey: () => Promise<void>;
  setApiKey: (v: string) => void;
  save: () => void;
  validate: () => void;
  setSettings: (v: Partial<AppSettings>) => void;
  supportsContextMenu: boolean;
  setContextMenuEnabled: (enabled: boolean) => Promise<void>;
  supportsAutostart: boolean;
  setAutostartEnabled: (enabled: boolean) => void;
  changeLanguage: (language: Language) => void;
  setLogLevel: (level: LogLevel) => Promise<void>;
  openLogDirectory: () => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
}

const REPOSITORY_DISPLAY = PROJECT_META.repositoryUrl
  .replace(/^https?:\/\/(www\.)?github\.com\//, '')
  .replace(/\.git$/, '');

const VT_API_KEY_URL = 'https://www.virustotal.com/gui/my-apikey';

/**
 * One Settings-style group: a section header directly above its cards, like the
 * Windows 11 Settings app (no description paragraph under the header).
 */
function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h2>{title}</h2>
      <div className="settings-list">{children}</div>
    </section>
  );
}

interface SettingsRowProps {
  icon: string;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** A single SettingsCard: leading icon, title/description, control on the right. */
function SettingsRow({ icon, title, description, children, className = '' }: SettingsRowProps) {
  return (
    <div className={`settings-row surface${className ? ` ${className}` : ''}`}>
      <span className="settings-row-icon">
        <Icon name={icon} size={20} />
      </span>
      <div className="settings-row-copy">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      {children ? <div className="settings-control">{children}</div> : null}
    </div>
  );
}

export function SettingsPage({
  settings,
  apiKey,
  showApiKey,
  toggleApiKey,
  setApiKey,
  save,
  validate,
  setSettings,
  supportsContextMenu,
  setContextMenuEnabled,
  supportsAutostart,
  setAutostartEnabled,
  changeLanguage,
  setLogLevel: changeLogLevel,
  openLogDirectory,
  openExternalUrl,
}: SettingsPageProps) {
  const { t } = useTranslation();
  return (
    <div className="screen settings-screen">
      <PageTitle title={t('settingsTitle')} subtitle={t('settingsSubtitle')} />
      <SettingsSection title={t('appearance')}>
        <SettingsRow icon="language" title={t('language')} description={t('languageHint')}>
          <Field label="">
            <Select<Language>
              value={settings.language}
              options={LANGUAGES.map((language) => ({
                value: language.value,
                label: language.label,
              }))}
              ariaLabel={t('language')}
              onChange={(language) => {
                setSettings({ language });
                changeLanguage(language);
              }}
            />
          </Field>
        </SettingsRow>
        <p className="settings-note">{t('appearanceHint')}</p>
      </SettingsSection>
      <SettingsSection title={t('apiAccess')}>
        <SettingsRow
          icon="key"
          title={t('apiKey')}
          description={
            <span className={`key-status ${settings.hasApiKey ? 'on' : ''}`}>
              {settings.hasApiKey ? t('apiKeyConfigured') : t('apiKeyNotConfigured')}
            </span>
          }
        >
          <Field label="">
            <div className="input-with-action">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={settings.hasApiKey ? '••••••••••••••••' : 'VT_API_KEY'}
              />
              <button
                type="button"
                className="field-action"
                onClick={() => void toggleApiKey()}
                aria-label={showApiKey ? t('hideApiKey') : t('showApiKey')}
              >
                <Icon name={showApiKey ? 'eyeOff' : 'eye'} />
              </button>
            </div>
          </Field>
        </SettingsRow>
        <div className="api-hint" role="note">
          <span className="api-hint-icon">
            <Icon name="info" />
          </span>
          <div className="api-hint-copy">
            <strong>{t('apiKeyHowToTitle')}</strong>
            <p>{t('apiKeyHowToBody')}</p>
          </div>
          <button type="button" className="api-hint-link" onClick={() => void openExternalUrl(VT_API_KEY_URL)}>
            {t('apiKeyGetAction')}
            <Icon name="external" />
          </button>
        </div>
        <div className="settings-actions">
          <Button variant="outline" icon="shield" onClick={validate}>
            {t('validate')}
          </Button>
          <Button icon="check" onClick={save}>
            {t('save')}
          </Button>
        </div>
      </SettingsSection>
      <SettingsSection title={t('scanSection')}>
        <Switch
          className="settings-row surface"
          icon="upload"
          checked={settings.scanImmediately}
          onChange={(value) => setSettings({ scanImmediately: value })}
          label={t('scanImmediately')}
          description={t('scanImmediatelyHint')}
        />
        <SettingsRow icon="clock" title={t('polling')} description={t('pollingHint')}>
          <div className="poll-stepper">
            <StepperInput
              value={settings.pollInterval}
              min={POLL_INTERVAL_MIN}
              max={POLL_INTERVAL_MAX}
              unit={t('sec')}
              ariaLabel={t('polling')}
              increaseLabel={t('increase')}
              decreaseLabel={t('decrease')}
              onChange={(value) => setSettings({ pollInterval: value })}
            />
            <div className="poll-presets" role="group" aria-label={t('pollingPresets')}>
              {POLL_INTERVALS.map((interval) => (
                <button
                  key={interval}
                  type="button"
                  className={`poll-preset${settings.pollInterval === interval ? ' selected' : ''}`}
                  title={`${interval} ${t('sec')}`}
                  onClick={() => setSettings({ pollInterval: interval })}
                >
                  {interval}
                </button>
              ))}
            </div>
          </div>
        </SettingsRow>
        <SettingsRow icon="bolt" title={t('scanConcurrency')} description={t('scanConcurrencyHint')}>
          <StepperInput
            value={settings.scanConcurrency}
            min={SCAN_CONCURRENCY_MIN}
            max={SCAN_CONCURRENCY_MAX}
            ariaLabel={t('scanConcurrency')}
            increaseLabel={t('increase')}
            decreaseLabel={t('decrease')}
            onChange={(value) => setSettings({ scanConcurrency: value })}
          />
        </SettingsRow>
        <SettingsRow icon="clock" title={t('scanDelay')} description={t('scanDelayHint')}>
          <StepperInput
            value={settings.scanDelaySeconds}
            min={SCAN_DELAY_MIN_SECONDS}
            max={SCAN_DELAY_MAX_SECONDS}
            unit={t('sec')}
            ariaLabel={t('scanDelay')}
            increaseLabel={t('increase')}
            decreaseLabel={t('decrease')}
            onChange={(value) => setSettings({ scanDelaySeconds: value })}
          />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title={t('reportsSection')}>
        <SettingsRow icon="history" title={t('reportOpenTarget')} description={t('reportOpenTargetHint')}>
          <Field label="">
            <Select<ReportOpenTarget>
              value={settings.reportOpenTarget}
              options={[
                { value: 'internal', label: t('reportOpenInternal') },
                { value: 'external', label: t('reportOpenExternal') },
              ]}
              ariaLabel={t('reportOpenTarget')}
              onChange={(reportOpenTarget) => setSettings({ reportOpenTarget })}
            />
          </Field>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title={t('notificationsSection')}>
        <Switch
          className="settings-row surface"
          icon="bell"
          checked={settings.notificationsEnabled}
          onChange={(value) => setSettings({ notificationsEnabled: value })}
          label={t('notificationsEnabled')}
          description={t('notificationsEnabledHint')}
        />
        <Switch
          className="settings-row surface"
          icon="info"
          disabled={!settings.notificationsEnabled}
          checked={settings.notifyOnCompleted}
          onChange={(value) => setSettings({ notifyOnCompleted: value })}
          label={t('notifyOnCompleted')}
          description={t('notifyOnCompletedHint')}
        />
        <Switch
          className="settings-row surface"
          icon="alert"
          disabled={!settings.notificationsEnabled}
          checked={settings.notifyOnFailed}
          onChange={(value) => setSettings({ notifyOnFailed: value })}
          label={t('notifyOnFailed')}
          description={t('notifyOnFailedHint')}
        />
      </SettingsSection>
      {supportsContextMenu && (
        <SettingsSection title={t('integrationSection')}>
          <Switch
            className="settings-row surface"
            icon="folderOpen"
            checked={settings.contextMenuEnabled}
            onChange={(value) => void setContextMenuEnabled(value)}
            label={t('contextMenu')}
            description={t('contextMenuHint')}
          />
        </SettingsSection>
      )}
      <SettingsSection title={t('systemSection')}>
        {supportsAutostart && (
          <Switch
            className="settings-row surface"
            icon="bolt"
            checked={settings.autostart}
            onChange={setAutostartEnabled}
            label={t('autostart')}
            description={t('autostartHint')}
          />
        )}
        <Switch
          className="settings-row surface"
          icon="minimize"
          checked={settings.closeToTray}
          onChange={(value) => setSettings({ closeToTray: value })}
          label={t('closeToTray')}
          description={t('closeToTrayHint')}
        />
        <Switch
          className="settings-row surface"
          icon="monitor"
          checked={settings.startMinimized}
          onChange={(value) => setSettings({ startMinimized: value })}
          label={t('startMinimized')}
          description={t('startMinimizedHint')}
        />
      </SettingsSection>
      <SettingsSection title={t('logging')}>
        <SettingsRow icon="doc" title={t('logLevel')} description={t('logLevelHint')}>
          <Field label="">
            <Select<LogLevel>
              value={settings.logLevel}
              options={LOG_LEVELS.map((level) => ({
                value: level,
                label: t(`log${level[0].toUpperCase()}${level.slice(1)}`),
              }))}
              ariaLabel={t('logLevel')}
              onChange={(level) => void changeLogLevel(level)}
            />
          </Field>
        </SettingsRow>
        <SettingsLink icon="folderOpen" title={t('openLogs')} onClick={() => void openLogDirectory()} />
      </SettingsSection>
      <SettingsSection title={t('about')}>
        <div className="about-identity surface">
          <span className="about-mark">
            <Icon name="shield" size={24} />
          </span>
          <div className="about-identity-copy">
            <strong>{t('appName')}</strong>
            <span>{t('appSubtitle')}</span>
          </div>
          <div className="about-identity-meta">
            <span className="about-chip" title={t('version')}>
              {PROJECT_META.version}
            </span>
            <span className="about-chip" title={t('license')}>
              {PROJECT_META.license}
            </span>
          </div>
        </div>
        <p className="about-copy">{t('aboutDescription')}</p>
        <SettingsLink
          icon="person"
          title={t('author')}
          value={PROJECT_META.authorName}
          onClick={() => void openExternalUrl(PROJECT_META.authorUrl)}
        />
        <SettingsLink
          icon="code"
          title={t('repository')}
          value={REPOSITORY_DISPLAY}
          onClick={() => void openExternalUrl(PROJECT_META.repositoryUrl)}
        />
        <SettingsLink
          icon="alert"
          title={t('issues')}
          value={t('issuesAction')}
          onClick={() => void openExternalUrl(PROJECT_META.issuesUrl)}
        />
      </SettingsSection>
    </div>
  );
}

interface SettingsLinkProps {
  icon?: string;
  title: string;
  value?: string;
  onClick: () => void;
}

/** A navigational settings card with a chevron, like the clickable rows in Settings. */
function SettingsLink({ icon, title, value, onClick }: SettingsLinkProps) {
  return (
    <button
      type="button"
      className="settings-link surface"
      onClick={onClick}
      aria-label={value ? `${title}: ${value}` : title}
    >
      {icon ? (
        <span className="settings-row-icon">
          <Icon name={icon} size={20} />
        </span>
      ) : null}
      <span className="settings-link-copy">
        <strong>{title}</strong>
        {value ? <span>{value}</span> : null}
      </span>
      <span className="settings-link-chevron" aria-hidden="true">
        <Icon name="chevronRight" size={16} />
      </span>
    </button>
  );
}

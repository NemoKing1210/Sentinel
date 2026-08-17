import type { CSSProperties, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import CNFlag from 'country-flag-icons/react/3x2/CN';
import DEFlag from 'country-flag-icons/react/3x2/DE';
import ESFlag from 'country-flag-icons/react/3x2/ES';
import FRFlag from 'country-flag-icons/react/3x2/FR';
import PTFlag from 'country-flag-icons/react/3x2/PT';
import RUFlag from 'country-flag-icons/react/3x2/RU';
import USFlag from 'country-flag-icons/react/3x2/US';
import type { AppSettings, Language, LanguageFlag, LogLevel } from '@/core/domain/types';
import {
  ACCENT_COLORS,
  LANGUAGES,
  LOG_LEVELS,
  POLL_INTERVAL_MAX,
  POLL_INTERVAL_MIN,
  POLL_INTERVALS,
  THEME_MODES,
} from '@/app/constants';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { PageTitle } from '@/components/ui/PageTitle';
import { Select } from '@/components/ui/Select';
import { StepperInput } from '@/components/ui/StepperInput';
import { Switch } from '@/components/ui/Switch';
import { PROJECT_META } from '@/app/utils/packageMeta';

const LANGUAGE_FLAG_ICONS: Record<LanguageFlag, ReactElement> = {
  us: <USFlag className="flag-icon" aria-hidden="true" />,
  ru: <RUFlag className="flag-icon" aria-hidden="true" />,
  es: <ESFlag className="flag-icon" aria-hidden="true" />,
  de: <DEFlag className="flag-icon" aria-hidden="true" />,
  fr: <FRFlag className="flag-icon" aria-hidden="true" />,
  pt: <PTFlag className="flag-icon" aria-hidden="true" />,
  cn: <CNFlag className="flag-icon" aria-hidden="true" />,
};

interface SettingsPageProps {
  settings: AppSettings;
  apiKey: string;
  showApiKey: boolean;
  toggleApiKey: () => Promise<void>;
  setApiKey: (v: string) => void;
  save: () => void;
  validate: () => void;
  setSettings: (v: Partial<AppSettings>) => void;
  changeLanguage: (language: Language) => void;
  setLogLevel: (level: LogLevel) => Promise<void>;
  openLogDirectory: () => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
}

const REPOSITORY_DISPLAY = PROJECT_META.repositoryUrl
  .replace(/^https?:\/\/(www\.)?github\.com\//, '')
  .replace(/\.git$/, '');

export function SettingsPage({
  settings,
  apiKey,
  showApiKey,
  toggleApiKey,
  setApiKey,
  save,
  validate,
  setSettings,
  changeLanguage,
  setLogLevel: changeLogLevel,
  openLogDirectory,
  openExternalUrl,
}: SettingsPageProps) {
  const { t } = useTranslation();
  return (
    <div className="screen settings-screen">
      <PageTitle title={t('settingsTitle')} subtitle={t('settingsSubtitle')} />
      <Card className="settings-card">
        <div className="settings-card-head">
          <span className="settings-card-icon">
            <Icon name="brush" />
          </span>
          <div>
            <h3>{t('appearance')}</h3>
            <p>{t('appearanceHint')}</p>
          </div>
        </div>
        <div className="settings-list">
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>{t('accentColor')}</strong>
              <span>{t('accentColorHint')}</span>
            </div>
            <div className="settings-control">
              <div className="accent-swatches" role="radiogroup" aria-label={t('accentColor')}>
                {ACCENT_COLORS.map((option) => {
                  const label = t(`accent${option.value[0].toUpperCase()}${option.value.slice(1)}`);
                  const isSelected = settings.accent === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={label}
                      title={label}
                      className={`accent-swatch${isSelected ? ' selected' : ''}`}
                      style={
                        {
                          '--swatch': option.dark.teal,
                          '--swatch-deep': option.dark.tealDeep,
                          '--on-swatch': option.dark.onTeal,
                        } as CSSProperties
                      }
                      onClick={() => setSettings({ accent: option.value })}
                    >
                      {isSelected ? <Icon name="check" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>{t('theme')}</strong>
              <span>{t('themeHint')}</span>
            </div>
            <div className="settings-control">
              <div className="segment-group" role="radiogroup" aria-label={t('theme')}>
                {THEME_MODES.map((mode) => {
                  const isSelected = settings.theme === mode;
                  const icon = mode === 'system' ? 'monitor' : mode === 'light' ? 'sun' : 'moon';
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={`segment${isSelected ? ' selected' : ''}`}
                      onClick={() => setSettings({ theme: mode })}
                    >
                      <Icon name={icon} />
                      {t(mode)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>{t('language')}</strong>
              <span>{t('languageHint')}</span>
            </div>
            <div className="settings-control">
              <Field label="">
                <Select<Language>
                  value={settings.language}
                  options={LANGUAGES.map((language) => ({
                    value: language.value,
                    label: language.label,
                    prefix: LANGUAGE_FLAG_ICONS[language.flag],
                  }))}
                  ariaLabel={t('language')}
                  onChange={(language) => {
                    setSettings({ language });
                    changeLanguage(language);
                  }}
                />
              </Field>
            </div>
          </div>
        </div>
      </Card>
      <Card className="settings-card">
        <div className="settings-card-head">
          <span className="settings-card-icon">
            <Icon name="key" />
          </span>
          <div>
            <h3>{t('apiAccess')}</h3>
            <p>{t('apiKeyHint')}</p>
          </div>
        </div>
        <div className="settings-list">
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>{t('apiKey')}</strong>
              <span className={`key-status ${settings.hasApiKey ? 'on' : ''}`}>
                {settings.hasApiKey ? t('apiKeyConfigured') : t('apiKeyNotConfigured')}
              </span>
            </div>
            <div className="settings-control">
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
            </div>
          </div>
        </div>
        <div className="settings-actions">
          <Button variant="outline" icon="shield" onClick={validate}>
            {t('validate')}
          </Button>
          <Button icon="check" onClick={save}>
            {t('save')}
          </Button>
        </div>
      </Card>
      <Card className="settings-card">
        <div className="settings-card-head">
          <span className="settings-card-icon">
            <Icon name="bolt" />
          </span>
          <div>
            <h3>{t('scanSection')}</h3>
            <p>{t('scanningHint')}</p>
          </div>
        </div>
        <div className="settings-list">
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>{t('polling')}</strong>
              <span>{t('pollingHint')}</span>
            </div>
            <div className="settings-control">
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
            </div>
          </div>
        </div>
      </Card>
      <Card className="settings-card">
        <div className="settings-card-head">
          <span className="settings-card-icon">
            <Icon name="monitor" />
          </span>
          <div>
            <h3>{t('systemSection')}</h3>
            <p>{t('systemSectionHint')}</p>
          </div>
        </div>
        <div className="settings-list">
          <Switch
            className="settings-row"
            checked={settings.closeToTray}
            onChange={(value) => setSettings({ closeToTray: value })}
            label={t('closeToTray')}
            description={t('closeToTrayHint')}
          />
          <Switch
            className="settings-row"
            checked={settings.startMinimized}
            onChange={(value) => setSettings({ startMinimized: value })}
            label={t('startMinimized')}
            description={t('startMinimizedHint')}
          />
        </div>
      </Card>
      <Card className="settings-card">
        <div className="settings-card-head">
          <span className="settings-card-icon">
            <Icon name="doc" />
          </span>
          <div>
            <h3>{t('logging')}</h3>
            <p>{t('loggingHint')}</p>
          </div>
        </div>
        <div className="settings-list">
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>{t('logLevel')}</strong>
              <span>{t('logLevelHint')}</span>
            </div>
            <div className="settings-control">
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
            </div>
          </div>
        </div>
        <div className="settings-actions">
          <Button variant="outline" icon="folder" onClick={() => void openLogDirectory()}>
            {t('openLogs')}
          </Button>
        </div>
      </Card>
      <Card className="settings-card about-card">
        <div className="settings-card-head">
          <span className="settings-card-icon">
            <Icon name="info" />
          </span>
          <div>
            <h3>{t('about')}</h3>
            <p>{t('aboutHint')}</p>
          </div>
        </div>
        <div className="about-identity">
          <span className="about-mark">
            <Icon name="shield" />
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
        <div className="settings-list">
          <AboutLink
            label={t('author')}
            value={PROJECT_META.authorName}
            onClick={() => void openExternalUrl(PROJECT_META.authorUrl)}
          />
          <AboutLink
            label={t('repository')}
            value={REPOSITORY_DISPLAY}
            onClick={() => void openExternalUrl(PROJECT_META.repositoryUrl)}
          />
          <AboutLink
            label={t('issues')}
            value={t('issuesAction')}
            onClick={() => void openExternalUrl(PROJECT_META.issuesUrl)}
          />
        </div>
      </Card>
    </div>
  );
}

function AboutLink({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" className="about-link" onClick={onClick} aria-label={`${label}: ${value}`}>
      <span className="about-link-label">{label}</span>
      <span className="about-link-value">
        {value}
        <Icon name="external" />
      </span>
    </button>
  );
}

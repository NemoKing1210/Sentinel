import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react';
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
import {
  highlightSegments,
  searchSettings,
  type SettingsSearchItem,
  type SettingsSearchSection,
} from './settingsSearch';

interface SettingsPageProps {
  settings: AppSettings;
  apiKey: string;
  showApiKey: boolean;
  toggleApiKey: () => Promise<void>;
  setApiKey: (v: string) => void;
  save: () => void;
  validate: () => void;
  setSettings: (v: Partial<AppSettings>) => void;
  resetSettings: () => void;
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

/** Search tokens shared with every settings row so matches can be highlighted. */
const SearchTokensContext = createContext<readonly string[]>([]);

/** Renders `text` with literal query hits wrapped in a themed mark. */
function Highlight({ text }: { text: string }) {
  const tokens = useContext(SearchTokensContext);
  if (tokens.length === 0) return <>{text}</>;
  return (
    <>
      {highlightSegments(text, tokens).map((segment, index) =>
        segment.match ? (
          <mark key={index} className="settings-search-hit">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

/**
 * One Settings-style group: a section header directly above its cards, like the
 * Windows 11 Settings app (no description paragraph under the header).
 */
function SettingsSection({
  title,
  visible = true,
  children,
}: {
  title: string;
  visible?: boolean;
  children: ReactNode;
}) {
  if (!visible) return null;
  return (
    <section className="settings-section">
      <h2>
        <Highlight text={title} />
      </h2>
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
        <strong>
          <Highlight text={title} />
        </strong>
        {typeof description === 'string' ? (
          <span>
            <Highlight text={description} />
          </span>
        ) : description ? (
          <span>{description}</span>
        ) : null}
      </div>
      {children ? <div className="settings-control">{children}</div> : null}
    </div>
  );
}

type SettingsSwitchProps = Omit<ComponentProps<typeof Switch>, 'label' | 'description'> & {
  label: string;
  description?: string;
};

/** Switch whose copy participates in settings search highlighting. */
function SettingsSwitch({ label, description, ...rest }: SettingsSwitchProps) {
  return (
    <Switch
      {...rest}
      label={<Highlight text={label} />}
      description={description ? <Highlight text={description} /> : undefined}
    />
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
        <strong>
          <Highlight text={title} />
        </strong>
        {value ? (
          <span>
            <Highlight text={value} />
          </span>
        ) : null}
      </span>
      <span className="settings-link-chevron" aria-hidden="true">
        <Icon name="chevronRight" size={16} />
      </span>
    </button>
  );
}

interface SettingsSearchBarProps {
  query: string;
  count: number;
  onChange: (value: string) => void;
  onClear: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

/** Sticky search field for the Settings screen with count and clear affordances. */
function SettingsSearchBar({ query, count, onChange, onClear, inputRef }: SettingsSearchBarProps) {
  const { t } = useTranslation();
  return (
    <div className="settings-search">
      <div className="search">
        <Icon name="search" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            if (query) onClear();
            else event.currentTarget.blur();
          }}
          placeholder={t('settingsSearch')}
          aria-label={t('settingsSearch')}
          autoComplete="off"
          spellCheck={false}
        />
        {query ? (
          <button
            type="button"
            className="settings-search-clear"
            onClick={onClear}
            aria-label={t('settingsSearchClear')}
          >
            <Icon name="close" size={16} />
          </button>
        ) : (
          <kbd className="settings-search-kbd" aria-hidden="true">
            Ctrl F
          </kbd>
        )}
      </div>
      {query ? (
        <p className="settings-search-meta" role="status" aria-live="polite">
          {t('settingsSearchResults', { count })}
        </p>
      ) : null}
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
  resetSettings,
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
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const openSearch = () => {
        event.preventDefault();
        const input = searchInputRef.current;
        input?.focus();
        input?.select();
      };

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        openSearch();
        return;
      }
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !isTypingTarget(event.target)) {
        openSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const search = useMemo(() => {
    const sections: SettingsSearchSection[] = [
      {
        id: 'appearance',
        title: t('appearance'),
        description: t('appearanceHint'),
        keywords: ['theme', 'accent', 'color', 'design', 'language', 'locale'],
      },
      {
        id: 'apiAccess',
        title: t('apiAccess'),
        keywords: ['virustotal', 'api', 'key', 'token', 'credentials', 'access'],
      },
      {
        id: 'scanSection',
        title: t('scanSection'),
        description: t('scanningHint'),
        keywords: ['scan', 'scanning', 'upload', 'queue', 'files', 'virus'],
      },
      {
        id: 'reportsSection',
        title: t('reportsSection'),
        keywords: ['report', 'reports', 'open', 'history'],
      },
      {
        id: 'notificationsSection',
        title: t('notificationsSection'),
        description: t('notificationsSectionHint'),
        keywords: ['notifications', 'notify', 'alerts', 'toast'],
      },
      {
        id: 'integrationSection',
        title: t('integrationSection'),
        description: t('integrationSectionHint'),
        keywords: ['integration', 'explorer', 'context menu', 'shortcut', 'windows'],
      },
      {
        id: 'systemSection',
        title: t('systemSection'),
        description: t('systemSectionHint'),
        keywords: ['system', 'tray', 'startup', 'window', 'windows'],
      },
      {
        id: 'logging',
        title: t('logging'),
        description: t('loggingHint'),
        keywords: ['logs', 'logging', 'diagnostics', 'debug', 'errors'],
      },
      {
        id: 'reset',
        title: t('resetSection'),
        description: t('resetSettingsHint'),
        keywords: ['reset', 'default', 'defaults', 'restore', 'factory', 'clear', 'preferences'],
      },
      {
        id: 'about',
        title: t('about'),
        description: t('aboutDescription'),
        keywords: ['about', 'version', 'license', 'author', 'github', 'support'],
      },
    ];

    const items: SettingsSearchItem[] = [
      {
        id: 'language',
        section: 'appearance',
        title: t('language'),
        description: t('languageHint'),
        keywords: ['locale', 'i18n', 'translation', 'interface', ...LANGUAGES.map((language) => language.label)],
      },
      {
        id: 'apiKey',
        section: 'apiAccess',
        title: t('apiKey'),
        description: settings.hasApiKey ? t('apiKeyConfigured') : t('apiKeyNotConfigured'),
        keywords: [
          'virustotal',
          'api',
          'token',
          'keychain',
          'secure',
          'password',
          'validate',
          'connection',
          t('apiKeyHowToTitle'),
          t('apiKeyHowToBody'),
          t('validate'),
          t('save'),
        ],
      },
      {
        id: 'scanImmediately',
        section: 'scanSection',
        title: t('scanImmediately'),
        description: t('scanImmediatelyHint'),
        keywords: ['automatic', 'immediately', 'start', 'upload', 'queue'],
      },
      {
        id: 'polling',
        section: 'scanSection',
        title: t('polling'),
        description: t('pollingHint'),
        keywords: ['interval', 'frequency', 'seconds', 'refresh', 'status', t('sec')],
      },
      {
        id: 'scanConcurrency',
        section: 'scanSection',
        title: t('scanConcurrency'),
        description: t('scanConcurrencyHint'),
        keywords: ['parallel', 'simultaneous', 'threads', 'speed', 'concurrency'],
      },
      {
        id: 'scanDelay',
        section: 'scanSection',
        title: t('scanDelay'),
        description: t('scanDelayHint'),
        keywords: ['rate limit', 'throttle', 'pause', '429', 'quota', 'uploads'],
      },
      {
        id: 'reportOpenTarget',
        section: 'reportsSection',
        title: t('reportOpenTarget'),
        description: t('reportOpenTargetHint'),
        keywords: ['browser', 'internal', 'external', 'virustotal page', 'default browser', 'open'],
      },
      {
        id: 'notificationsEnabled',
        section: 'notificationsSection',
        title: t('notificationsEnabled'),
        description: t('notificationsEnabledHint'),
        keywords: ['toast', 'native', 'os', 'hidden', 'alerts'],
      },
      {
        id: 'notifyOnCompleted',
        section: 'notificationsSection',
        title: t('notifyOnCompleted'),
        description: t('notifyOnCompletedHint'),
        keywords: ['result', 'verdict', 'finished', 'complete', 'success'],
      },
      {
        id: 'notifyOnFailed',
        section: 'notificationsSection',
        title: t('notifyOnFailed'),
        description: t('notifyOnFailedHint'),
        keywords: ['error', 'failure', 'timeout', 'retry', 'problem'],
      },
      ...(supportsContextMenu
        ? [
            {
              id: 'contextMenu',
              section: 'integrationSection',
              title: t('contextMenu'),
              description: t('contextMenuHint'),
              keywords: ['explorer', 'right click', 'shell', 'shortcut', 'menu', 'windows'],
            },
          ]
        : []),
      ...(supportsAutostart
        ? [
            {
              id: 'autostart',
              section: 'systemSection',
              title: t('autostart'),
              description: t('autostartHint'),
              keywords: ['startup', 'login', 'sign in', 'windows', 'boot'],
            },
          ]
        : []),
      {
        id: 'closeToTray',
        section: 'systemSection',
        title: t('closeToTray'),
        description: t('closeToTrayHint'),
        keywords: ['tray', 'minimize', 'close', 'background', 'quit'],
      },
      {
        id: 'startMinimized',
        section: 'systemSection',
        title: t('startMinimized'),
        description: t('startMinimizedHint'),
        keywords: ['hidden', 'tray', 'startup', 'launch', 'minimized'],
      },
      {
        id: 'logLevel',
        section: 'logging',
        title: t('logLevel'),
        description: t('logLevelHint'),
        keywords: ['diagnostics', 'debug', 'error', 'verbose', 'level', 'logging'],
      },
      {
        id: 'openLogs',
        section: 'logging',
        title: t('openLogs'),
        keywords: ['folder', 'file', 'directory', 'diagnostics', 'jsonl', 'logs'],
      },
      {
        id: 'resetSettings',
        section: 'reset',
        title: t('resetSettings'),
        description: t('resetSettingsHint'),
        keywords: ['reset', 'default', 'defaults', 'restore', 'factory', 'preferences'],
      },
      {
        id: 'aboutApp',
        section: 'about',
        title: t('about'),
        description: t('aboutDescription'),
        keywords: [
          PROJECT_META.name,
          PROJECT_META.version,
          PROJECT_META.license,
          'about',
          'version',
          'license',
          t('appSubtitle'),
        ],
      },
      {
        id: 'author',
        section: 'about',
        title: t('author'),
        description: PROJECT_META.authorName,
        keywords: [PROJECT_META.authorName, 'github', 'developer', 'maintainer'],
      },
      {
        id: 'repository',
        section: 'about',
        title: t('repository'),
        description: REPOSITORY_DISPLAY,
        keywords: [REPOSITORY_DISPLAY, 'github', 'source', 'code', 'repo'],
      },
      {
        id: 'issues',
        section: 'about',
        title: t('issues'),
        description: t('issuesAction'),
        keywords: ['bug', 'feedback', 'support', 'github', 'problem'],
      },
    ];

    return searchSettings(sections, items, query);
  }, [query, t, settings.hasApiKey, supportsContextMenu, supportsAutostart]);

  const show = (id: string) => !search.active || search.items.has(id);
  const sectionVisible = (id: string) => !search.active || search.sections.has(id);
  const clearSearch = () => setQuery('');
  const handleQueryChange = (value: string) => {
    // Starting a new search should reveal the first results, even when the
    // field was focused with Ctrl+F from the bottom of a long page.
    if (value && !query) {
      searchInputRef.current?.closest('.manual-main')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setQuery(value);
  };
  const noMatches = search.active && search.count === 0;

  return (
    <SearchTokensContext.Provider value={search.tokens}>
      <div className="screen settings-screen">
        <PageTitle title={t('settingsTitle')} subtitle={t('settingsSubtitle')} />
        <SettingsSearchBar
          query={query}
          count={search.count}
          onChange={handleQueryChange}
          onClear={clearSearch}
          inputRef={searchInputRef}
        />
        {noMatches ? (
          <div className="settings-search-empty surface">
            <span className="settings-search-empty-icon">
              <Icon name="search" size={24} />
            </span>
            <h2>{t('settingsSearchEmptyTitle')}</h2>
            <p>{t('settingsSearchEmptyCopy')}</p>
            <Button variant="outline" icon="close" onClick={clearSearch}>
              {t('settingsSearchClear')}
            </Button>
          </div>
        ) : (
          <>
            <SettingsSection title={t('appearance')} visible={sectionVisible('appearance')}>
              {show('language') && (
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
              )}
              <p className="settings-note">{t('appearanceHint')}</p>
            </SettingsSection>
            <SettingsSection title={t('apiAccess')} visible={sectionVisible('apiAccess')}>
              {show('apiKey') && (
                <>
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
                    <button
                      type="button"
                      className="api-hint-link"
                      onClick={() => void openExternalUrl(VT_API_KEY_URL)}
                    >
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
                </>
              )}
            </SettingsSection>
            <SettingsSection title={t('scanSection')} visible={sectionVisible('scanSection')}>
              {show('scanImmediately') && (
                <SettingsSwitch
                  className="settings-row surface"
                  icon="upload"
                  checked={settings.scanImmediately}
                  onChange={(value) => setSettings({ scanImmediately: value })}
                  label={t('scanImmediately')}
                  description={t('scanImmediatelyHint')}
                />
              )}
              {show('polling') && (
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
              )}
              {show('scanConcurrency') && (
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
              )}
              {show('scanDelay') && (
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
              )}
            </SettingsSection>
            <SettingsSection title={t('reportsSection')} visible={sectionVisible('reportsSection')}>
              {show('reportOpenTarget') && (
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
              )}
            </SettingsSection>
            <SettingsSection title={t('notificationsSection')} visible={sectionVisible('notificationsSection')}>
              {show('notificationsEnabled') && (
                <SettingsSwitch
                  className="settings-row surface"
                  icon="bell"
                  checked={settings.notificationsEnabled}
                  onChange={(value) => setSettings({ notificationsEnabled: value })}
                  label={t('notificationsEnabled')}
                  description={t('notificationsEnabledHint')}
                />
              )}
              {show('notifyOnCompleted') && (
                <SettingsSwitch
                  className="settings-row surface"
                  icon="info"
                  disabled={!settings.notificationsEnabled}
                  checked={settings.notifyOnCompleted}
                  onChange={(value) => setSettings({ notifyOnCompleted: value })}
                  label={t('notifyOnCompleted')}
                  description={t('notifyOnCompletedHint')}
                />
              )}
              {show('notifyOnFailed') && (
                <SettingsSwitch
                  className="settings-row surface"
                  icon="alert"
                  disabled={!settings.notificationsEnabled}
                  checked={settings.notifyOnFailed}
                  onChange={(value) => setSettings({ notifyOnFailed: value })}
                  label={t('notifyOnFailed')}
                  description={t('notifyOnFailedHint')}
                />
              )}
            </SettingsSection>
            {supportsContextMenu && (
              <SettingsSection title={t('integrationSection')} visible={sectionVisible('integrationSection')}>
                {show('contextMenu') && (
                  <SettingsSwitch
                    className="settings-row surface"
                    icon="folderOpen"
                    checked={settings.contextMenuEnabled}
                    onChange={(value) => void setContextMenuEnabled(value)}
                    label={t('contextMenu')}
                    description={t('contextMenuHint')}
                  />
                )}
              </SettingsSection>
            )}
            <SettingsSection title={t('systemSection')} visible={sectionVisible('systemSection')}>
              {supportsAutostart && show('autostart') && (
                <SettingsSwitch
                  className="settings-row surface"
                  icon="bolt"
                  checked={settings.autostart}
                  onChange={setAutostartEnabled}
                  label={t('autostart')}
                  description={t('autostartHint')}
                />
              )}
              {show('closeToTray') && (
                <SettingsSwitch
                  className="settings-row surface"
                  icon="minimize"
                  checked={settings.closeToTray}
                  onChange={(value) => setSettings({ closeToTray: value })}
                  label={t('closeToTray')}
                  description={t('closeToTrayHint')}
                />
              )}
              {show('startMinimized') && (
                <SettingsSwitch
                  className="settings-row surface"
                  icon="monitor"
                  checked={settings.startMinimized}
                  onChange={(value) => setSettings({ startMinimized: value })}
                  label={t('startMinimized')}
                  description={t('startMinimizedHint')}
                />
              )}
            </SettingsSection>
            <SettingsSection title={t('logging')} visible={sectionVisible('logging')}>
              {show('logLevel') && (
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
              )}
              {show('openLogs') && (
                <SettingsLink icon="folderOpen" title={t('openLogs')} onClick={() => void openLogDirectory()} />
              )}
            </SettingsSection>
            <SettingsSection title={t('resetSection')} visible={sectionVisible('reset')}>
              {show('resetSettings') && (
                <SettingsRow icon="refresh" title={t('resetSettings')} description={t('resetSettingsHint')}>
                  <Button variant="outline" icon="refresh" onClick={resetSettings}>
                    {t('resetSettingsAction')}
                  </Button>
                </SettingsRow>
              )}
            </SettingsSection>
            <SettingsSection title={t('about')} visible={sectionVisible('about')}>
              {show('aboutApp') && (
                <>
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
                </>
              )}
              {show('author') && (
                <SettingsLink
                  icon="person"
                  title={t('author')}
                  value={PROJECT_META.authorName}
                  onClick={() => void openExternalUrl(PROJECT_META.authorUrl)}
                />
              )}
              {show('repository') && (
                <SettingsLink
                  icon="code"
                  title={t('repository')}
                  value={REPOSITORY_DISPLAY}
                  onClick={() => void openExternalUrl(PROJECT_META.repositoryUrl)}
                />
              )}
              {show('issues') && (
                <SettingsLink
                  icon="alert"
                  title={t('issues')}
                  value={t('issuesAction')}
                  onClick={() => void openExternalUrl(PROJECT_META.issuesUrl)}
                />
              )}
            </SettingsSection>
          </>
        )}
      </div>
    </SearchTokensContext.Provider>
  );
}

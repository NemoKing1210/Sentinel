import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { describePreset, useToast } from '@/app/hooks/useToast';
import {
  closeInternalBrowser,
  internalBrowserAction,
  isNativeRuntime,
  listenInternalBrowserLoad,
  openExternalUrl,
  openInternalBrowser,
  setInternalBrowserBounds,
  type InternalBrowserAction,
  type InternalBrowserBounds,
} from '@/core/native/api';
import { logError, logInfo } from '@/core/logging';

interface InternalBrowserPageProps {
  url: string;
  onClose: () => void;
}

/**
 * The page transition needs to settle before the native webview is measured
 * and attached, otherwise it is placed eight pixels off.
 */
const ATTACH_DELAY_MS = 190;

function displayAddress(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/**
 * In-app VirusTotal browser: the React toolbar lives in the main webview and
 * the page itself is a native child webview positioned over the empty frame.
 */
export function InternalBrowserPage({ url, onClose }: InternalBrowserPageProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const hostRef = useRef<HTMLDivElement>(null);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const native = isNativeRuntime();

  const measure = useCallback((): InternalBrowserBounds | null => {
    const host = hostRef.current;
    if (!host) return null;
    const rect = host.getBoundingClientRect();
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    };
  }, []);

  const close = useCallback(() => {
    void closeInternalBrowser();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!native || !url) return;
    let disposed = false;
    let frame: number | undefined;

    const attach = window.setTimeout(() => {
      const bounds = measure();
      if (!bounds) return;
      void openInternalBrowser(url, bounds)
        .then(() => {
          if (disposed) return;
          logInfo('browser.opened_ui', { url });
        })
        .catch((error) => {
          if (disposed) return;
          const message = String(error);
          setFailed(message);
          logError('browser.open_failed_ui', { error: message });
        });
    }, ATTACH_DELAY_MS);

    const observer = new ResizeObserver(() => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = measure();
        if (bounds) void setInternalBrowserBounds(bounds);
      });
    });
    if (hostRef.current) observer.observe(hostRef.current);

    return () => {
      disposed = true;
      window.clearTimeout(attach);
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      void closeInternalBrowser();
    };
  }, [measure, native, url]);

  useEffect(() => {
    if (!native) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    void listenInternalBrowserLoad((event) => {
      if (!active) return;
      setCurrentUrl(event.url);
      setLoading(event.phase === 'started');
    })
      .then((stop) => {
        if (active) unlisten = stop;
        else stop();
      })
      .catch((error) => logError('browser.listen_failed', { error: String(error) }));
    return () => {
      active = false;
      unlisten?.();
    };
  }, [native]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  const act = (action: InternalBrowserAction) => {
    if (action === 'reload') setLoading(true);
    void internalBrowserAction(action).catch((error) =>
      logError('browser.action_failed_ui', { action, error: String(error) }),
    );
  };

  const openExternal = async () => {
    try {
      await openExternalUrl(currentUrl);
      logInfo('browser.external_opened', { url: currentUrl });
    } catch (error) {
      logError('browser.external_open_failed', { error: String(error) });
      showToast(describePreset('vtOpenFailed', t));
    }
  };

  const fallbackVisible = !native || Boolean(failed);

  return (
    <div className="internal-browser-screen">
      <div className="internal-browser-bar">
        <Button variant="quiet" icon="close" onClick={close} ariaLabel={t('browserBackToReport')}>
          <span className="internal-browser-label">{t('browserBackToReport')}</span>
        </Button>
        <span className="internal-browser-divider" aria-hidden="true" />
        <div className="internal-browser-nav" role="group" aria-label={t('browserNavigation')}>
          <button
            type="button"
            className="icon-button"
            onClick={() => act('back')}
            aria-label={t('browserBack')}
            title={t('browserBack')}
            disabled={!native || Boolean(failed)}
          >
            <Icon name="back" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => act('forward')}
            aria-label={t('browserForward')}
            title={t('browserForward')}
            disabled={!native || Boolean(failed)}
          >
            <Icon name="arrow" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => act('reload')}
            aria-label={t('browserReload')}
            title={t('browserReload')}
            disabled={!native || Boolean(failed)}
          >
            <Icon name="refresh" />
          </button>
        </div>
        <div className="internal-browser-address" title={currentUrl} aria-label={t('browserAddress')}>
          <Icon name="shield" />
          <span>{displayAddress(currentUrl)}</span>
          {loading && !fallbackVisible ? <i className="spinner internal-browser-spinner" aria-hidden="true" /> : null}
        </div>
        <Button
          variant="outline"
          icon="external"
          onClick={() => void openExternal()}
          ariaLabel={t('browserOpenExternal')}
        >
          <span className="internal-browser-label">{t('browserOpenExternal')}</span>
        </Button>
      </div>

      <div className="internal-browser-frame">
        <div ref={hostRef} className="internal-browser-host" />
        {fallbackVisible ? (
          <div className="internal-browser-fallback" role="status">
            <Icon name="info" size={24} />
            <strong>{t(failed ? 'browserFailedTitle' : 'browserUnavailableTitle')}</strong>
            <p>{t(failed ? 'browserFailedCopy' : 'browserUnavailableCopy')}</p>
            <Button variant="outline" icon="external" onClick={() => void openExternal()}>
              {t('browserOpenExternal')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

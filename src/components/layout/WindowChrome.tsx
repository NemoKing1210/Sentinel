import { useEffect, useState, type MouseEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import logo from '@/assets/logo.png';
import { Icon } from '../ui/Icon';
import { Tooltip } from '../ui/Tooltip';

function currentWindow() {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return null;
  return getCurrentWindow();
}

interface WindowChromeProps {
  paneExpanded: boolean;
  onTogglePane: () => void;
  onBack?: () => void;
  backLabel?: string;
  navToggleRef?: RefObject<HTMLButtonElement | null>;
}

export function WindowChrome({ paneExpanded, onTogglePane, onBack, backLabel, navToggleRef }: WindowChromeProps) {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    const win = currentWindow();
    if (!win) return;
    let active = true;
    let unlistenResized: (() => void) | undefined;
    let unlistenFocus: (() => void) | undefined;

    const syncMaximized = () => {
      void win
        .isMaximized()
        .then((value) => {
          if (active) setMaximized(value);
        })
        .catch(() => undefined);
    };

    syncMaximized();
    void win
      .onResized(syncMaximized)
      .then((stop) => {
        if (active) unlistenResized = stop;
        else stop();
      })
      .catch(() => undefined);
    void win
      .onFocusChanged(({ payload }) => {
        if (active) setFocused(payload);
      })
      .then((stop) => {
        if (active) unlistenFocus = stop;
        else stop();
      })
      .catch(() => undefined);

    return () => {
      active = false;
      unlistenResized?.();
      unlistenFocus?.();
    };
  }, []);

  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, [role="button"]'));
  const startDragging = (event: MouseEvent<HTMLElement>) => {
    if (event.button === 0 && !isInteractiveTarget(event.target)) void currentWindow()?.startDragging();
  };
  const toggleMaximize = (event: MouseEvent<HTMLElement>) => {
    if (!isInteractiveTarget(event.target)) void currentWindow()?.toggleMaximize();
  };

  const maximizeLabel = maximized ? t('windowRestore') : t('windowMaximize');
  const backText = backLabel ?? t('historyBack');

  return (
    <header
      className={`window-chrome${focused ? '' : ' inactive'}`}
      onMouseDown={startDragging}
      onDoubleClick={toggleMaximize}
    >
      <Tooltip content={t('toggleNavigation')} placement="bottom">
        <button
          ref={navToggleRef}
          type="button"
          className="window-nav-toggle"
          aria-label={t('toggleNavigation')}
          aria-expanded={paneExpanded}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onTogglePane}
        >
          <Icon name="menu" size={16} />
        </button>
      </Tooltip>
      {onBack ? (
        <Tooltip content={backText} placement="bottom">
          <button
            type="button"
            className="window-back"
            aria-label={backText}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onBack}
          >
            <Icon name="back" size={16} />
          </button>
        </Tooltip>
      ) : null}
      <span className="window-title">
        <img src={logo} alt="" className="window-logo" width={16} height={16} draggable={false} />
        <span>Sentinel</span>
      </span>
      <div className="window-controls">
        <Tooltip content={t('windowMinimize')} placement="bottom">
          <button
            type="button"
            className="window-control"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => void currentWindow()?.minimize()}
            aria-label={t('windowMinimize')}
          >
            <Icon name="minimize" />
          </button>
        </Tooltip>
        <Tooltip content={maximizeLabel} placement="bottom">
          <button
            type="button"
            className="window-control"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => void currentWindow()?.toggleMaximize()}
            aria-label={maximizeLabel}
          >
            <Icon name={maximized ? 'restore' : 'maximize'} />
          </button>
        </Tooltip>
        <Tooltip content={t('windowClose')} placement="bottom">
          <button
            type="button"
            className="window-control close"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => void currentWindow()?.close()}
            aria-label={t('windowClose')}
          >
            <Icon name="close" />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}

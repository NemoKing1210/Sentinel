import type { MouseEvent } from 'react';
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
}

export function WindowChrome({ paneExpanded, onTogglePane }: WindowChromeProps) {
  const { t } = useTranslation();
  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, [role="button"]'));
  const startDragging = (event: MouseEvent<HTMLElement>) => {
    if (event.button === 0 && !isInteractiveTarget(event.target)) void currentWindow()?.startDragging();
  };
  const toggleMaximize = (event: MouseEvent<HTMLElement>) => {
    if (!isInteractiveTarget(event.target)) void currentWindow()?.toggleMaximize();
  };
  return (
    <header className="window-chrome" onMouseDown={startDragging} onDoubleClick={toggleMaximize}>
      <Tooltip content={t('toggleNavigation')} placement="bottom">
        <button
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
      <span className="window-title">
        <img src={logo} alt="" className="window-logo" width={16} height={16} draggable={false} />
        <span>Sentinel</span>
      </span>
      <div className="window-controls">
        <button
          type="button"
          className="window-control"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => void currentWindow()?.minimize()}
          aria-label={t('windowMinimize')}
        >
          <Icon name="minimize" />
        </button>
        <button
          type="button"
          className="window-control"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => void currentWindow()?.toggleMaximize()}
          aria-label={t('windowMaximize')}
        >
          <Icon name="maximize" />
        </button>
        <button
          type="button"
          className="window-control close"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => void currentWindow()?.close()}
          aria-label={t('windowClose')}
        >
          <Icon name="close" />
        </button>
      </div>
    </header>
  );
}

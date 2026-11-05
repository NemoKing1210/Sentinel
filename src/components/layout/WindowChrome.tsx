import { useEffect, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import logo from '@/assets/logo.png';
import { Tooltip } from '../ui/Tooltip';

function currentWindow() {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return null;
  return getCurrentWindow();
}

/**
 * Caption glyphs from Segoe Fluent Icons, the same codepoints WinUI uses.
 * They render at exactly 10×10 px with a 1 px stroke, unlike the SVG icon set.
 */
const CAPTION_GLYPHS = {
  minimize: '',
  maximize: '',
  restore: '',
  close: '',
} as const;

function CaptionGlyph({ name }: { name: keyof typeof CAPTION_GLYPHS }) {
  return (
    <span className="caption-glyph" aria-hidden="true">
      {CAPTION_GLYPHS[name]}
    </span>
  );
}

export function WindowChrome() {
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

  return (
    <header
      className={`window-chrome${focused ? '' : ' inactive'}`}
      onMouseDown={startDragging}
      onDoubleClick={toggleMaximize}
    >
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
            <CaptionGlyph name="minimize" />
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
            <CaptionGlyph name={maximized ? 'restore' : 'maximize'} />
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
            <CaptionGlyph name="close" />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}

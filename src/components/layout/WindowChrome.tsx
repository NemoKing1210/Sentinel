import type { MouseEvent } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { View } from '@/app/constants';
import logo from '@/assets/logo.png';
import { Icon } from '../ui/Icon';

export interface NavItem {
  id: View;
  label: string;
  icon: string;
  count?: number;
}

export function WindowChrome({ nav, view, setView }: { nav: NavItem[]; view: View; setView: (view: View) => void }) {
  const nativeWindow = getCurrentWindow();
  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, [role="button"]'));
  const startDragging = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button === 0 && !isInteractiveTarget(event.target)) void nativeWindow.startDragging();
  };
  const toggleMaximize = (event: MouseEvent<HTMLDivElement>) => {
    if (!isInteractiveTarget(event.target)) void nativeWindow.toggleMaximize();
  };
  return (
    <div className="window-chrome" onMouseDown={startDragging} onDoubleClick={toggleMaximize}>
      <span className="window-title">
        <img src={logo} alt="" className="window-logo" width={22} height={22} draggable={false} />
        Sentinel
      </span>
      <nav className="window-nav">
        {nav.map((item) => (
          <button
            type="button"
            className={view === item.id ? 'nav-link active' : 'nav-link'}
            key={item.id}
            onClick={() => setView(item.id)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {item.count ? <b>{item.count}</b> : null}
          </button>
        ))}
      </nav>
      <div className="window-controls">
        <button
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => void nativeWindow.minimize()}
          aria-label="Minimize"
        >
          <Icon name="minimize" />
        </button>
        <button
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => void nativeWindow.toggleMaximize()}
          aria-label="Maximize"
        >
          <Icon name="maximize" />
        </button>
        <button
          onMouseDown={(event) => event.stopPropagation()}
          className="close"
          onClick={() => void nativeWindow.close()}
          aria-label="Close"
        >
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}

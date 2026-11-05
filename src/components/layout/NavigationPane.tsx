import { useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { View } from '@/app/constants';
import { nextNavIndex, type NavigationKey, type NavigationMode } from '@/app/utils/navigation';
import { Icon } from '../ui/Icon';
import { Tooltip } from '../ui/Tooltip';

export interface NavItem {
  id: View;
  label: string;
  icon: string;
  count?: number;
}

export interface NavigationPaneProps {
  nav: NavItem[];
  view: View;
  setView: (view: View) => void;
  mode: NavigationMode;
  open: boolean;
  onNavigate?: () => void;
}

const NAV_KEYS: NavigationKey[] = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

function isNavigationKey(key: string): key is NavigationKey {
  return (NAV_KEYS as string[]).includes(key);
}

export function NavigationPane({ nav, view, setView, mode, open, onNavigate }: NavigationPaneProps) {
  const { t } = useTranslation();
  const primary = nav.filter((item) => item.id !== 'settings');
  const secondary = nav.filter((item) => item.id === 'settings');
  const items = [...primary, ...secondary];

  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const currentIndex = Math.max(
    0,
    items.findIndex((item) => item.id === view),
  );
  const [focusOverride, setFocusOverride] = useState<{ view: View; index: number } | null>(null);
  const focusIndex = focusOverride?.view === view ? focusOverride.index : currentIndex;
  const setFocusIndex = (index: number) => setFocusOverride({ view, index });

  const className = ['nav-pane', mode, open ? 'open' : 'closed', mode !== 'expanded' && open ? 'overlay' : '']
    .filter(Boolean)
    .join(' ');

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!isNavigationKey(event.key)) return;
    event.preventDefault();
    const next = nextNavIndex(focusIndex, event.key, items.length);
    setFocusIndex(next);
    itemRefs.current[next]?.focus();
  };

  const select = (id: View) => {
    setView(id);
    onNavigate?.();
  };

  const renderItem = (item: NavItem, index: number) => {
    const active = view === item.id;
    const button = (
      <button
        ref={(element) => {
          itemRefs.current[index] = element;
        }}
        type="button"
        className={active ? 'nav-link active' : 'nav-link'}
        onClick={() => select(item.id)}
        onFocus={() => setFocusIndex(index)}
        tabIndex={index === focusIndex ? 0 : -1}
        aria-current={active ? 'page' : undefined}
        aria-label={item.label}
      >
        <span className="nav-icon">
          <Icon name={item.icon} size={20} />
          {!open && item.count ? <span className="nav-badge-dot" aria-hidden="true" /> : null}
        </span>
        <span className="nav-label">{item.label}</span>
        {open && item.count ? <b>{item.count}</b> : null}
      </button>
    );

    return (
      <div className="nav-item" key={item.id}>
        {open ? (
          button
        ) : (
          <Tooltip content={item.label} placement="right">
            {button}
          </Tooltip>
        )}
      </div>
    );
  };

  return (
    <nav className={className} aria-label={t('appName')} onKeyDown={handleKeyDown}>
      <div className="nav-group">{primary.map((item) => renderItem(item, items.indexOf(item)))}</div>
      <div className="nav-spacer" />
      <div className="nav-divider" aria-hidden="true" />
      <div className="nav-group">{secondary.map((item) => renderItem(item, items.indexOf(item)))}</div>
    </nav>
  );
}

import { useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import type { View } from '@/app/constants';
import { nextNavIndex, type NavigationKey } from '@/app/utils/navigation';
import { Icon } from '../ui/Icon';

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
}

const NAV_KEYS: NavigationKey[] = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

/** Fluent 167 ms slide for the WinUI selection indicator. */
const INDICATOR_TRANSITION = { duration: 0.167, ease: [0.1, 0.9, 0.2, 1] } as const;

function isNavigationKey(key: string): key is NavigationKey {
  return (NAV_KEYS as string[]).includes(key);
}

export function NavigationPane({ nav, view, setView }: NavigationPaneProps) {
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

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!isNavigationKey(event.key)) return;
    event.preventDefault();
    const next = nextNavIndex(focusIndex, event.key, items.length);
    setFocusIndex(next);
    itemRefs.current[next]?.focus();
  };

  const renderItem = (item: NavItem, index: number) => {
    const active = view === item.id;

    return (
      <div className="nav-item" key={item.id}>
        <button
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          type="button"
          className={active ? 'nav-link active' : 'nav-link'}
          onClick={() => setView(item.id)}
          onFocus={() => setFocusIndex(index)}
          tabIndex={index === focusIndex ? 0 : -1}
          aria-current={active ? 'page' : undefined}
          aria-label={item.label}
        >
          {active ? (
            <motion.span
              layoutId="nav-selection-indicator"
              className="nav-selection-indicator"
              transition={INDICATOR_TRANSITION}
              aria-hidden="true"
            />
          ) : null}
          <span className="nav-icon">
            <Icon name={item.icon} size={16} />
          </span>
          <span className="nav-label">{item.label}</span>
          {item.count ? <b>{item.count}</b> : null}
        </button>
      </div>
    );
  };

  return (
    <nav className="nav-pane" aria-label={t('appName')} onKeyDown={handleKeyDown}>
      <div className="nav-group">{primary.map((item) => renderItem(item, items.indexOf(item)))}</div>
      <div className="nav-spacer" />
      <div className="nav-divider" aria-hidden="true" />
      <div className="nav-group">{secondary.map((item) => renderItem(item, items.indexOf(item)))}</div>
    </nav>
  );
}

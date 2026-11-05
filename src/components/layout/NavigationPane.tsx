import { useTranslation } from 'react-i18next';
import type { View } from '@/app/constants';
import { Icon } from '../ui/Icon';

export interface NavItem {
  id: View;
  label: string;
  icon: string;
  count?: number;
}

interface NavigationPaneProps {
  nav: NavItem[];
  view: View;
  setView: (view: View) => void;
}

function NavButton({ item, active, onSelect }: { item: NavItem; active: boolean; onSelect: (view: View) => void }) {
  return (
    <button
      type="button"
      className={active ? 'nav-link active' : 'nav-link'}
      onClick={() => onSelect(item.id)}
      aria-current={active ? 'page' : undefined}
      title={item.label}
    >
      <Icon name={item.icon} />
      <span className="nav-label">{item.label}</span>
      {item.count ? <b>{item.count}</b> : null}
    </button>
  );
}

export function NavigationPane({ nav, view, setView }: NavigationPaneProps) {
  const { t } = useTranslation();
  const primary = nav.filter((item) => item.id !== 'settings');
  const secondary = nav.filter((item) => item.id === 'settings');

  return (
    <nav className="nav-pane" aria-label={t('appName')}>
      <div className="nav-group">
        {primary.map((item) => (
          <NavButton key={item.id} item={item} active={view === item.id} onSelect={setView} />
        ))}
      </div>
      <div className="nav-spacer" />
      <div className="nav-divider" aria-hidden="true" />
      <div className="nav-group">
        {secondary.map((item) => (
          <NavButton key={item.id} item={item} active={view === item.id} onSelect={setView} />
        ))}
      </div>
    </nav>
  );
}

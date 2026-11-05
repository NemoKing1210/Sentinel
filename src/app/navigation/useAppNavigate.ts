import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { View } from '@/app/constants';
import { reportPath, ROUTES, viewPath } from './routes';

export interface AppNavigation {
  goToView: (view: View) => void;
  openReport: (itemId: string) => void;
  backToHistory: () => void;
}

/**
 * Semantic navigation for the app shell. Features use this instead of reaching
 * into Zustand for a `view` flag, so the URL is the single source of truth.
 */
export function useAppNavigate(): AppNavigation {
  const navigate = useNavigate();
  const location = useLocation();
  const searchRef = useRef(location.search);

  useEffect(() => {
    searchRef.current = location.search;
  }, [location.search]);

  const goToView = useCallback(
    (view: View) => {
      // Opening History from a report keeps the list filters it was opened with.
      navigate({ pathname: viewPath(view), search: view === 'history' ? searchRef.current : '' });
    },
    [navigate],
  );

  const openReport = useCallback(
    (itemId: string) => {
      // Keep History filters in the URL so Back restores the list as it was left.
      // The ref keeps delayed callbacks (toasts, notifications) on the latest URL.
      navigate({ pathname: reportPath(itemId), search: searchRef.current });
    },
    [navigate],
  );

  const backToHistory = useCallback(() => {
    navigate({ pathname: ROUTES.history, search: searchRef.current });
  }, [navigate]);

  return useMemo(() => ({ goToView, openReport, backToHistory }), [backToHistory, goToView, openReport]);
}

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { View } from '@/app/constants';
import { browserPath, reportPath, ROUTES, viewPath } from './routes';

export interface AppNavigation {
  goToView: (view: View) => void;
  openReport: (itemId: string) => void;
  backToHistory: () => void;
  openBrowser: (itemId: string, url: string) => void;
  backToReport: (itemId: string, search: string) => void;
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

  const openBrowser = useCallback(
    (itemId: string, url: string) => {
      // Keep the list filters that opened the report so closing the browser
      // returns to the same report, and Back restores the list.
      const params = new URLSearchParams({ url });
      if (searchRef.current) params.set('back', searchRef.current);
      navigate({ pathname: browserPath(itemId), search: params.toString() });
    },
    [navigate],
  );

  const backToReport = useCallback(
    (itemId: string, search: string) => {
      navigate({ pathname: reportPath(itemId), search });
    },
    [navigate],
  );

  return useMemo(
    () => ({ goToView, openReport, backToHistory, openBrowser, backToReport }),
    [backToHistory, backToReport, goToView, openBrowser, openReport],
  );
}

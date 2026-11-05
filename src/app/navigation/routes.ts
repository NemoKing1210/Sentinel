import type { View } from '@/app/constants';

/**
 * URL routes for the four primary views. A scan report is a nested route under
 * History: `/history/:itemId`. Keeping the paths in one place lets navigation,
 * shortcuts, the tray menu, and notifications all agree on the same URLs.
 */
export const ROUTES = {
  dashboard: '/dashboard',
  queue: '/queue',
  history: '/history',
  settings: '/settings',
} as const satisfies Record<View, string>;

/** Derived from ROUTES so adding a view without a path is a type error. */
const VIEW_ORDER = Object.keys(ROUTES) as View[];

export function viewPath(view: View): string {
  return ROUTES[view];
}

export function reportPath(itemId: string): string {
  return `${ROUTES.history}/${encodeURIComponent(itemId)}`;
}

/** Resolves the primary view for a location such as `/history/abc` → `history`. */
export function resolveView(pathname: string): View | null {
  const [segment] = pathname.split('/').filter(Boolean);
  return VIEW_ORDER.find((view) => view === segment) ?? null;
}

/** Extracts the report id from `/history/:itemId`, or `null` for the list. */
export function reportIdFromPath(pathname: string): string | null {
  const [, view, itemId] = pathname.split('/');
  if (view !== 'history' || !itemId) return null;
  try {
    return decodeURIComponent(itemId);
  } catch {
    return itemId;
  }
}

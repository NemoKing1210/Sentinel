export type NavigationMode = 'expanded' | 'compact' | 'minimal';
export type NavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

export const NAV_EXPANDED_MIN_WIDTH = 1008;
export const NAV_COMPACT_MIN_WIDTH = 641;

export function navigationModeForWidth(width: number): NavigationMode {
  if (width >= NAV_EXPANDED_MIN_WIDTH) return 'expanded';
  if (width >= NAV_COMPACT_MIN_WIDTH) return 'compact';
  return 'minimal';
}

export function nextNavIndex(current: number, key: NavigationKey, count: number): number {
  if (count <= 0) return 0;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown') return (current + 1) % count;
  return (current - 1 + count) % count;
}

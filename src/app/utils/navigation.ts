export type NavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

export function nextNavIndex(current: number, key: NavigationKey, count: number): number {
  if (count <= 0) return 0;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown') return (current + 1) % count;
  return (current - 1 + count) % count;
}

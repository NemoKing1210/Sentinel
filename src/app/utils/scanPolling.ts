export const MIN_POLL_INTERVAL_MS = 1000;
export const MAX_POLL_INTERVAL_MS = 60000;
export const DEFAULT_POLL_INTERVAL_MS = 5000;
export const DEFAULT_SCAN_TIMEOUT_MS = 5 * 60 * 1000;

export type AnalysisPhase = 'pending' | 'completed' | 'failed';

/** The Settings value is seconds; the poll loop works in milliseconds. */
export function normalizePollInterval(seconds: number): number {
  const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : DEFAULT_POLL_INTERVAL_MS;
  return Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, Math.round(milliseconds)));
}

export function pollAttempts(intervalMs: number, timeoutMs: number): number {
  const interval = Number.isFinite(intervalMs)
    ? Math.max(MIN_POLL_INTERVAL_MS, Math.round(intervalMs))
    : DEFAULT_POLL_INTERVAL_MS;
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_SCAN_TIMEOUT_MS;
  // The first check is immediate; one more attempt means the last sleep still
  // lands inside the budget instead of one interval before it.
  return Math.max(1, Math.floor(timeout / interval) + 1);
}

export function analysisPhase(status: unknown): AnalysisPhase {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  return 'pending';
}

/** Upload is 35%; polling fills the remaining 40–95% band. */
export function pollProgress(attempt: number, attempts: number): number {
  if (!Number.isFinite(attempts) || attempts <= 0) return 95;
  const ratio = Math.min(1, Math.max(0, attempt / attempts));
  return Math.round(40 + 55 * ratio);
}

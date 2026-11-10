import type { ScanItem } from '../../core/domain/types.ts';
import type { ScanError } from '../../core/native/scanError.ts';

export const SCAN_RETRY_LIMIT = 3;
export const SCAN_RETRY_DELAYS = [30, 60, 120];
const MAX_RETRY_DELAY_SECONDS = 3600;

/** After a successful upload only the poll needs to resume; otherwise submit again. */
export function scanResumePhase(item: Pick<ScanItem, 'analysisId'>): 'submit' | 'poll' {
  return item.analysisId ? 'poll' : 'submit';
}

function originRank(item: ScanItem): number {
  return item.origin === 'watch' ? 1 : 0;
}

/** Next item the scheduler may start: queued, auto-start, manual before watch, oldest first. */
export function selectNextScan(items: ScanItem[]): ScanItem | null {
  const candidates = items.filter((item) => item.status === 'queued' && item.autoStart === true);
  if (candidates.length === 0) return null;
  const [next] = [...candidates].sort((a, b) => {
    const byOrigin = originRank(a) - originRank(b);
    if (byOrigin !== 0) return byOrigin;
    return a.createdAt.localeCompare(b.createdAt);
  });
  return next;
}

/** Retry delay for a failed attempt, honouring VirusTotal's Retry-After when present. */
export function retryDelaySeconds(error: ScanError, attempt: number): number {
  const retryAfter = error.retryAfterSecs;
  const seconds = retryAfter && retryAfter > 0 ? retryAfter : (SCAN_RETRY_DELAYS[attempt - 1] ?? 120);
  return Math.min(MAX_RETRY_DELAY_SECONDS, Math.max(1, Math.round(seconds)));
}

/** Milliseconds left before the next automatic start, 0 when the pause has already passed. */
export function nextStartWaitMs(lastStartedAt: number | undefined, now: number, delaySeconds: number): number {
  if (lastStartedAt === undefined) return 0;
  return Math.max(0, lastStartedAt + delaySeconds * 1000 - now);
}

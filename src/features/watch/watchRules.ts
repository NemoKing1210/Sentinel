import type { TFunction } from 'i18next';
import type { Verdict, WatchRule } from '../../core/domain/types';
import {
  DEFAULT_WATCH_RULE,
  normalizeExtension,
  WATCH_MAX_SIZE_BYTES,
  watchPathsOverlap,
} from '../../core/domain/watch.ts';
import { formatSize } from '../../app/utils/format.ts';

export type WatchRuleErrorKey =
  'watchErrorPathMissing' | 'watchErrorDuplicate' | 'watchErrorOverlap' | 'watchErrorSize' | 'watchErrorDepth';

const MAX_WATCH_DEPTH = 64;

export function createWatchRule(path: string, id: string): WatchRule {
  return { ...DEFAULT_WATCH_RULE, id, path };
}

export function normalizeExtensionList(values: string[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    const extension = normalizeExtension(value);
    if (extension && !result.includes(extension)) result.push(extension);
  }
  return result;
}

export function parseExtensionInput(raw: string): string[] {
  return normalizeExtensionList(raw.split(/[,\s]+/));
}

export function isOverlappingPath(a: string, b: string): boolean {
  return watchPathsOverlap(a, b);
}

/** Returns the first problem with a draft rule, or null when it can be saved. */
export function validateWatchDraft(rule: WatchRule, others: WatchRule[]): WatchRuleErrorKey | null {
  if (!rule.path.trim()) return 'watchErrorPathMissing';
  if (others.some((other) => other.id === rule.id)) return 'watchErrorDuplicate';
  if (others.some((other) => isOverlappingPath(other.path, rule.path))) return 'watchErrorOverlap';
  if (rule.maxDepth !== null && (rule.maxDepth < 1 || rule.maxDepth > MAX_WATCH_DEPTH)) {
    return 'watchErrorDepth';
  }
  if (
    rule.minSizeBytes < 0 ||
    rule.minSizeBytes > rule.maxSizeBytes ||
    rule.maxSizeBytes < 1 ||
    rule.maxSizeBytes > WATCH_MAX_SIZE_BYTES
  ) {
    return 'watchErrorSize';
  }
  return null;
}

export function shouldNotifyWatch(rule: WatchRule, verdict: Verdict): boolean {
  if (rule.notify === 'none') return false;
  if (rule.notify === 'all') return true;
  return verdict === 'malicious' || verdict === 'suspicious';
}

export function watchRuleSummary(rule: WatchRule, t: TFunction): string[] {
  const extensions =
    rule.includeExtensions.length > 0
      ? t('watchSummaryOnly', { extensions: rule.includeExtensions.join(', ') })
      : rule.excludeExtensions.length > 0
        ? t('watchSummaryExcept', { extensions: rule.excludeExtensions.join(', ') })
        : t('watchSummaryAllExtensions');
  const depth =
    rule.maxDepth === null ? t('watchSummaryUnlimitedDepth') : t('watchSummaryDepth', { depth: rule.maxDepth });
  const size = t('watchSummaryMaxSize', { size: formatSize(rule.maxSizeBytes) });
  const missed = rule.scanMissedWhileClosed ? t('watchSummaryMissedOn') : t('watchSummaryMissedOff');
  return [extensions, depth, size, missed];
}

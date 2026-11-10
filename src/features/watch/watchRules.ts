import type { TFunction } from 'i18next';
import type { WatchRule } from '../../core/domain/types';
import {
  DEFAULT_WATCH_RULE,
  normalizeExtension,
  shouldNotifyWatch,
  WATCH_MAX_SIZE_BYTES,
  watchPathsOverlap,
} from '../../core/domain/watch.ts';
import { formatSize } from '../../app/utils/format.ts';

export { shouldNotifyWatch };

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

const BYTES_PER_MEGABYTE = 1024 * 1024;

export function sizeMegabytesToBytes(megabytes: number): number {
  return megabytes * BYTES_PER_MEGABYTE;
}

/** Converts a byte limit to the whole megabytes shown in the editor, never below 1. */
export function bytesToSizeMegabytes(bytes: number): number {
  return Math.max(1, Math.round(bytes / BYTES_PER_MEGABYTE));
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

export function watchRuleSummary(rule: WatchRule, t: TFunction): string[] {
  const extensions =
    rule.includeExtensions.length > 0
      ? t('watchExtensionsOnly', { list: rule.includeExtensions.join(', ') })
      : rule.excludeExtensions.length > 0
        ? t('watchExtensionsExcept', { list: rule.excludeExtensions.join(', ') })
        : t('watchExtensionsAll');
  const depth = rule.maxDepth === null ? t('watchDepthAll') : t('watchDepthValue', { count: rule.maxDepth });
  const size = t('watchMaxSize', { size: formatSize(rule.maxSizeBytes) });
  const missed = rule.scanMissedWhileClosed ? t('watchMissedOn') : t('watchMissedOff');
  return [extensions, depth, size, missed];
}

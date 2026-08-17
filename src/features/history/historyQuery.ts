import type { EngineResult, FileKind, FileReport } from '@/core/domain/types';
import { detectFileKind } from '@/app/utils/fileKind';

export type HistoryFilter = 'all' | 'malicious' | 'suspicious' | 'clean';
export type EngineFilter = 'all' | 'flagged' | 'clean' | 'unsupported';
export type HashKey = 'sha256' | 'sha1' | 'md5';
export type StatsKey = keyof FileReport['stats'];

export interface HistoryDayGroup {
  key: string;
  kind: 'today' | 'yesterday' | 'date';
  date: Date;
  reports: FileReport[];
}

export interface HashEntry {
  key: HashKey;
  value: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const ENGINE_RANK: Record<string, number> = {
  malicious: 0,
  suspicious: 1,
  undetected: 2,
  harmless: 3,
  'type-unsupported': 4,
};
const ENGINE_RANK_FALLBACK = 5;

export function reportKind(report: FileReport): FileKind {
  return report.fileKind ?? detectFileKind(report.name);
}

export function matchesHistorySearch(report: FileReport, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [report.name, report.sha256, report.sha1, report.md5, report.type].some((value) =>
    value.toLowerCase().includes(needle),
  );
}

export function filterReportsByVerdict(reports: FileReport[], filter: HistoryFilter): FileReport[] {
  if (filter === 'all') return reports;
  return reports.filter((report) => report.verdict === filter);
}

export function countReportsByVerdict(reports: FileReport[]): Record<HistoryFilter, number> {
  return reports.reduce(
    (counts, report) => {
      counts.all += 1;
      if (report.verdict === 'malicious' || report.verdict === 'suspicious' || report.verdict === 'clean') {
        counts[report.verdict] += 1;
      }
      return counts;
    },
    { all: 0, malicious: 0, suspicious: 0, clean: 0 } satisfies Record<HistoryFilter, number>,
  );
}

export function queryHistory(reports: FileReport[], filter: HistoryFilter, query: string): FileReport[] {
  return filterReportsByVerdict(reports, filter).filter((report) => matchesHistorySearch(report, query));
}

export function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function groupReportsByDay(reports: FileReport[], now = new Date()): HistoryDayGroup[] {
  const today = startOfLocalDay(now);
  const groups = new Map<string, HistoryDayGroup>();
  const order: string[] = [];

  for (const report of reports) {
    const scanned = new Date(report.scannedAt);
    const day = Number.isFinite(scanned.getTime()) ? startOfLocalDay(scanned) : today;
    const diff = today - day;
    let kind: HistoryDayGroup['kind'] = 'date';
    let key = `date-${day}`;
    if (diff === 0) {
      kind = 'today';
      key = 'today';
    } else if (diff === DAY_MS) {
      kind = 'yesterday';
      key = 'yesterday';
    }

    const existing = groups.get(key);
    if (existing) {
      existing.reports.push(report);
      continue;
    }
    groups.set(key, { key, kind, date: new Date(day), reports: [report] });
    order.push(key);
  }

  return order.map((key) => groups.get(key)).filter((group): group is HistoryDayGroup => Boolean(group));
}

export function presentHashes(report: FileReport): HashEntry[] {
  return (
    [
      { key: 'sha256', value: report.sha256 },
      { key: 'sha1', value: report.sha1 },
      { key: 'md5', value: report.md5 },
    ] satisfies HashEntry[]
  ).filter((entry) => entry.value.trim().length > 0);
}

export function sortEngines(engines: EngineResult[]): EngineResult[] {
  return [...engines].sort((left, right) => {
    const rank = (ENGINE_RANK[left.category] ?? ENGINE_RANK_FALLBACK) - (ENGINE_RANK[right.category] ?? ENGINE_RANK_FALLBACK);
    if (rank !== 0) return rank;
    return left.name.localeCompare(right.name);
  });
}

export function filterEngines(engines: EngineResult[], filter: EngineFilter, query: string): EngineResult[] {
  const needle = query.trim().toLowerCase();
  return engines.filter((engine) => {
    if (filter === 'flagged' && engine.category !== 'malicious' && engine.category !== 'suspicious') return false;
    if (filter === 'clean' && engine.category !== 'undetected' && engine.category !== 'harmless') return false;
    if (filter === 'unsupported' && engine.category !== 'type-unsupported') return false;
    if (!needle) return true;
    const result = engine.result?.toLowerCase() ?? '';
    return engine.name.toLowerCase().includes(needle) || result.includes(needle);
  });
}

export function queryEngines(engines: EngineResult[], filter: EngineFilter, query: string): EngineResult[] {
  return sortEngines(filterEngines(engines, filter, query));
}

export function engineCategoryLabelKey(category: EngineResult['category']): string {
  if (category === 'type-unsupported') return 'typeUnsupported';
  return category;
}

export function enginePillTone(category: EngineResult['category']): string {
  if (category === 'malicious') return 'malicious';
  if (category === 'suspicious') return 'suspicious';
  if (category === 'harmless') return 'harmless';
  return 'muted';
}

export function engineCategoryIcon(category: EngineResult['category']): string {
  if (category === 'malicious') return 'danger';
  if (category === 'suspicious') return 'alert';
  if (category === 'harmless') return 'success';
  if (category === 'undetected') return 'success';
  return 'info';
}

export function statsSegments(report: FileReport): Array<{ key: StatsKey; value: number }> {
  const keys: StatsKey[] = ['malicious', 'suspicious', 'undetected', 'harmless'];
  return keys.map((key) => ({ key, value: report.stats[key] })).filter((segment) => segment.value > 0);
}

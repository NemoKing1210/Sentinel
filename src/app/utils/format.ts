import type { FileReport } from '@/core/domain/types';

export function formatSize(bytes: number): string {
  if (bytes > 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes > 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes > 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${Math.max(0, bytes)} B`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} d ago`;
  return new Date(iso).toLocaleDateString();
}

export function detectionCount(report: FileReport): number {
  return report.stats.malicious + report.stats.suspicious;
}

export function engineTotal(report: FileReport): number {
  return Object.values(report.stats).reduce((sum, value) => sum + value, 0);
}

import type { Verdict } from '@/core/domain/types';

export type VerdictTone = 'danger' | 'warning' | 'success' | 'muted';

export function verdictTone(verdict?: Verdict): VerdictTone {
  if (verdict === 'malicious') return 'danger';
  if (verdict === 'suspicious') return 'warning';
  if (verdict === 'clean') return 'success';
  return 'muted';
}

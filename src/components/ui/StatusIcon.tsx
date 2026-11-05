import type { Verdict } from '@/core/domain/types';
import { verdictTone } from '@/app/utils/verdict';
import { Icon } from './Icon';

export function StatusIcon({ verdict }: { verdict?: Verdict }) {
  const icon = verdict === 'malicious' || verdict === 'suspicious' ? 'alert' : verdict === 'clean' ? 'check' : 'info';
  return (
    <span className={`verdict-icon ${verdictTone(verdict)}`}>
      <Icon name={icon} size={20} />
    </span>
  );
}

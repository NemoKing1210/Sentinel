import type { Verdict } from '@/core/domain/types';
import { verdictTone } from '@/app/utils/verdict';
import { Icon } from './Icon';

export function StatusIcon({ verdict }: { verdict?: Verdict }) {
  return (
    <span className={`verdict-icon ${verdictTone(verdict)}`}>
      <Icon name={verdict === 'malicious' || verdict === 'suspicious' ? 'alert' : 'check'} />
    </span>
  );
}

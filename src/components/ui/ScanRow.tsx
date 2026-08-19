import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { FileKind, ScanStatus } from '@/core/domain/types';
import { fileIconName, Icon } from './Icon';

const rowTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;

interface ScanRowProps {
  name: string;
  kind: FileKind;
  tone: string;
  meta: string;
  summary?: ReactNode;
  extra?: ReactNode;
  actions: ReactNode;
  status?: ScanStatus;
  onOpen?: () => void;
}

export function ScanRow({ name, kind, tone, meta, summary, extra, actions, status, onOpen }: ScanRowProps) {
  const className = ['surface scan-row', `tone-${tone}`, `kind-${kind}`, status ? `status-${status}` : '']
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <div className="scan-row-icon">
        <Icon name={fileIconName(kind)} />
      </div>
      <div className="scan-row-main">
        <strong className="scan-row-name" title={name}>
          {name}
        </strong>
        <small className="scan-row-meta">{meta}</small>
        {summary ? <small className="scan-row-summary">{summary}</small> : null}
        {extra}
      </div>
    </>
  );

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: -14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={rowTransition}
      className={className}
    >
      {onOpen ? (
        <button type="button" className="scan-row-open" onClick={onOpen}>
          {body}
        </button>
      ) : (
        <div className="scan-row-open is-static">{body}</div>
      )}
      <div className="scan-row-actions">{actions}</div>
    </motion.section>
  );
}

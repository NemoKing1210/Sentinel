import type { ReactNode } from 'react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      {label ? <span>{label}</span> : null}
      {children}
    </label>
  );
}

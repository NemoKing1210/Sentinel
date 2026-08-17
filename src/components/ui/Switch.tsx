import type { ReactNode } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  ariaLabel,
  disabled = false,
  className,
}: SwitchProps) {
  const hasCopy = Boolean(label || description);
  const classes = ['switch-field'];
  if (disabled) classes.push('disabled');
  if (className) classes.push(className);

  return (
    <label className={classes.join(' ')}>
      {hasCopy ? (
        <span className="switch-copy">
          {label ? <strong>{label}</strong> : null}
          {description ? <span>{description}</span> : null}
        </span>
      ) : null}
      <span className="switch-control">
        <input
          type="checkbox"
          role="switch"
          className="switch-input"
          checked={checked}
          disabled={disabled}
          aria-label={hasCopy ? undefined : ariaLabel}
          onChange={(event) => onChange(event.target.checked)}
          onKeyDown={(event) => {
            if (disabled || event.key !== 'Enter') return;
            event.preventDefault();
            onChange(!checked);
          }}
        />
        <span className="switch" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
      </span>
    </label>
  );
}
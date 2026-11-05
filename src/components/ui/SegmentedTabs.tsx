import { motion } from 'motion/react';

/** Fluent motion used across route and selection transitions. */
const INDICATOR_TRANSITION = { duration: 0.167, ease: [0.1, 0.9, 0.2, 1] } as const;

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  tone?: string;
  count?: number;
}

interface SegmentedTabsProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Unique per control: the underline animates between tabs sharing this id. */
  layoutId: string;
  ariaLabel: string;
  className?: string;
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  ariaLabel,
  className,
}: SegmentedTabsProps<T>) {
  return (
    <div className={['segment-group', className].filter(Boolean).join(' ')} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`segment tone-${option.tone ?? 'muted'}${selected ? ' selected' : ''}`}
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
            {option.count !== undefined ? <b>{option.count}</b> : null}
            {selected ? (
              <motion.span
                layoutId={layoutId}
                className="segment-indicator"
                transition={INDICATOR_TRANSITION}
                aria-hidden="true"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

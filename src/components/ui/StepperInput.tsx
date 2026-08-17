import { useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Icon } from './Icon';

interface StepperInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  ariaLabel?: string;
  increaseLabel?: string;
  decreaseLabel?: string;
}

export function StepperInput({
  value,
  onChange,
  min = 1,
  max = 60,
  step = 1,
  unit,
  ariaLabel,
  increaseLabel = 'Increase',
  decreaseLabel = 'Decrease',
}: StepperInputProps) {
  const [text, setText] = useState(String(value));
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    setText(String(value));
  }

  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  const commit = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    onChange(clamp(Number.isNaN(parsed) ? value : parsed));
  };

  const stepBy = (delta: number) => onChange(clamp(value + delta));

  return (
    <div className="stepper" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className="stepper-btn"
        aria-label={decreaseLabel}
        title={decreaseLabel}
        onClick={() => stepBy(-step)}
        disabled={value <= min}
      >
        <Icon name="minus" />
      </button>
      <div className="stepper-value">
        <input
          type="text"
          inputMode="numeric"
          value={text}
          aria-label={ariaLabel}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw !== '' && !/^\d{1,2}$/.test(raw)) return;
            setText(raw);
          }}
          onBlur={() => commit(text)}
          onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit(text);
              event.currentTarget.blur();
            }
          }}
        />
        {unit ? <span className="stepper-unit">{unit}</span> : null}
      </div>
      <button
        type="button"
        className="stepper-btn"
        aria-label={increaseLabel}
        title={increaseLabel}
        onClick={() => stepBy(step)}
        disabled={value >= max}
      >
        <Icon name="plus" />
      </button>
    </div>
  );
}

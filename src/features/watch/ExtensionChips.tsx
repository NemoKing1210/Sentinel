import { useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/ui/Icon';
import { parseExtensionInput } from './watchRules';

interface ExtensionChipsProps {
  values: string[];
  onChange: (values: string[]) => void;
  label: string;
  placeholder?: string;
}

export function ExtensionChips({ values, onChange, label, placeholder }: ExtensionChipsProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (raw: string) => {
    const additions = parseExtensionInput(raw).filter((extension) => !values.includes(extension));
    if (additions.length > 0) onChange([...values, ...additions]);
    setText('');
  };

  const remove = (extension: string) => onChange(values.filter((value) => value !== extension));

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add(text);
      return;
    }
    if (event.key === 'Backspace' && text === '' && values.length > 0) {
      event.preventDefault();
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className="watch-extensions">
      <span className="watch-field-label">{label}</span>
      <div className="ext-chip-list" onClick={() => inputRef.current?.focus()}>
        {values.map((extension) => (
          <span className="ext-chip" key={extension}>
            {extension}
            <button
              type="button"
              className="ext-chip-remove"
              aria-label={`${t('watchRemove')} ${extension}`}
              onClick={() => remove(extension)}
            >
              <Icon name="close" size={16} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="ext-chip-input"
          value={text}
          placeholder={placeholder}
          aria-label={label}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(text)}
        />
      </div>
    </div>
  );
}

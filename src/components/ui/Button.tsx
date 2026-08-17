import type { ReactNode } from 'react';
import { Icon } from './Icon';

type ButtonVariant = 'primary' | 'quiet' | 'outline';

interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  icon?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  ariaLabel?: string;
}

export function Button({
  children,
  variant = 'primary',
  icon,
  onClick,
  type = 'button',
  disabled = false,
  ariaLabel,
}: ButtonProps) {
  return (
    <button type={type} className={`button ${variant}`} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

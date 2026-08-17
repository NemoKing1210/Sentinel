import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActiveToast } from '@/app/hooks/useToast';
import { Icon } from '@/components/ui/Icon';

interface ToastProps {
  toast: ActiveToast;
  onDismiss: (id: string) => void;
}

const LEAVE_ANIMATION_MS = 220;

function Toast({ toast, onDismiss }: ToastProps) {
  const { t } = useTranslation();
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (leaving || paused) return undefined;
    const timer = setTimeout(() => setLeaving(true), toast.duration);
    return () => clearTimeout(timer);
  }, [leaving, paused, toast.duration]);

  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(() => onDismiss(toast.id), LEAVE_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [leaving, onDismiss, toast.id]);

  const tone =
    toast.level === 'success'
      ? 'success'
      : toast.level === 'warn'
        ? 'warning'
        : toast.level === 'error'
          ? 'danger'
          : 'info';

  const fallbackIcon =
    tone === 'success' ? 'success' : tone === 'warning' ? 'alert' : tone === 'danger' ? 'danger' : 'info';

  return (
    <div
      className={`toast-card toast-${tone}${leaving ? ' leaving' : ''}${paused ? ' paused' : ''}`}
      role={toast.level === 'error' || toast.level === 'warn' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={`toast-icon toast-icon-${tone}`}>
        <Icon name={toast.icon ?? fallbackIcon} />
      </span>
      <div className="toast-body">
        <strong className="toast-title">{toast.title}</strong>
        {toast.description ? <span className="toast-description">{toast.description}</span> : null}
      </div>
      <div className="toast-actions">
        {toast.action ? (
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              toast.action?.onClick();
              setLeaving(true);
            }}
          >
            {toast.action.label}
          </button>
        ) : null}
        <button
          type="button"
          className="toast-close"
          onClick={() => setLeaving(true)}
          aria-label={t('toast.dismiss')}
        >
          <Icon name="close" />
        </button>
      </div>
      <span
        className="toast-progress"
        style={{ animationDuration: `${toast.duration}ms` }}
        aria-hidden="true"
      />
    </div>
  );
}

interface ToastContainerProps {
  toasts: ActiveToast[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

type Placement = 'top' | 'bottom' | 'right';

interface TooltipProps {
  content: string;
  children: ReactElement;
  placement?: Placement;
}

interface TooltipPosition {
  left: number;
  top: number;
  transform: string;
}

const SHOW_DELAY_MS = 400;
const GAP_PX = 8;

export function Tooltip({ content, children, placement = 'top' }: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setPosition(null);
  }, [clearTimer]);

  const show = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (placement === 'bottom') {
      setPosition({ left: rect.left + rect.width / 2, top: rect.bottom + GAP_PX, transform: 'translate(-50%, 0)' });
    } else if (placement === 'right') {
      setPosition({
        left: rect.right + GAP_PX,
        top: rect.top + rect.height / 2,
        transform: 'translateY(-50%)',
      });
    } else {
      setPosition({ left: rect.left + rect.width / 2, top: rect.top - GAP_PX, transform: 'translate(-50%, -100%)' });
    }
  }, [placement]);

  useEffect(() => clearTimer, [clearTimer]);

  useEffect(() => {
    if (!position) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [position, hide]);

  const handlePointerEnter = () => {
    clearTimer();
    timerRef.current = window.setTimeout(show, SHOW_DELAY_MS);
  };

  const handleFocus = () => {
    clearTimer();
    show();
  };

  const portalRoot = typeof document === 'undefined' ? null : document.querySelector('.manual-app');

  return (
    <>
      <span
        ref={anchorRef}
        className="tooltip-anchor"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={hide}
        onFocus={handleFocus}
        onBlur={hide}
      >
        {children}
      </span>
      {position && portalRoot
        ? createPortal(
            <span
              className="tooltip"
              role="tooltip"
              style={{ left: position.left, top: position.top, transform: position.transform }}
            >
              {content}
            </span>,
            portalRoot,
          )
        : null}
    </>
  );
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Icon } from './Icon';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  prefix?: ReactNode;
}

interface SelectProps<T extends string> {
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

type Placement = 'down' | 'up';

interface MenuLayout {
  placement: Placement;
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

const MENU_GAP = 6;
const MENU_OPTION_HEIGHT = 42;
const MENU_PADDING = 12;
const MENU_MAX_HEIGHT = 264;
const MENU_MIN_HEIGHT = 120;

function isTriggerOffscreen(rect: DOMRect): boolean {
  return rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth;
}

function getSelectPortalRoot(from: HTMLElement | null): HTMLElement {
  return from?.closest('.manual-app') ?? document.body;
}

function measureMenuLayout(trigger: HTMLElement, optionCount: number): MenuLayout {
  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP;
  const spaceAbove = rect.top - MENU_GAP;
  const estimatedHeight = Math.min(MENU_MAX_HEIGHT, optionCount * MENU_OPTION_HEIGHT + MENU_PADDING);
  const placeUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
  const available = placeUp ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(MENU_MIN_HEIGHT, Math.min(MENU_MAX_HEIGHT, available - 8));

  return {
    placement: placeUp ? 'up' : 'down',
    left: rect.left,
    width: rect.width,
    maxHeight,
    ...(placeUp ? { bottom: window.innerHeight - rect.top + MENU_GAP } : { top: rect.bottom + MENU_GAP }),
  };
}

export function Select<T extends string>({ value, options, onChange, ariaLabel }: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuLayout, setMenuLayout] = useState<MenuLayout | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement>(() => document.body);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);

  const updateMenuLayout = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    if (isTriggerOffscreen(rect)) {
      setOpen(false);
      return;
    }
    setMenuLayout(measureMenuLayout(trigger, options.length));
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    setPortalRoot(getSelectPortalRoot(rootRef.current));
    updateMenuLayout();
  }, [open, updateMenuLayout]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', updateMenuLayout);
    window.addEventListener('scroll', updateMenuLayout, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', updateMenuLayout);
      window.removeEventListener('scroll', updateMenuLayout, true);
    };
  }, [open, updateMenuLayout]);

  const openMenu = () => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    updateMenuLayout();
    setOpen(true);
  };
  const closeMenu = () => setOpen(false);
  const toggleMenu = () => (open ? closeMenu() : openMenu());

  const select = (option: SelectOption<T>) => {
    onChange(option.value);
    setOpen(false);
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openMenu();
        else setActiveIndex((index) => Math.min(index + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openMenu();
        else setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) {
          const active = options[activeIndex];
          if (active) select(active);
        } else {
          openMenu();
        }
        break;
      case 'Escape':
        closeMenu();
        break;
    }
  };

  const selected = options.find((option) => option.value === value);
  const menuStyle: CSSProperties | undefined = menuLayout
    ? {
        left: menuLayout.left,
        width: menuLayout.width,
        maxHeight: menuLayout.maxHeight,
        top: menuLayout.top,
        bottom: menuLayout.bottom,
      }
    : undefined;

  const menu =
    open && menuLayout
      ? createPortal(
          <div
            className={`select-menu select-menu-${menuLayout.placement}`}
            role="listbox"
            aria-label={ariaLabel}
            ref={menuRef}
            style={menuStyle}
          >
            {options.map((option, index) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`select-option${option.value === value ? ' selected' : ''}${
                  index === activeIndex ? ' active' : ''
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(option)}
              >
                <span className="select-option-label">
                  {option.prefix ? <span className="select-prefix">{option.prefix}</span> : null}
                  {option.label}
                </span>
                {option.value === value ? <Icon name="check" /> : null}
              </button>
            ))}
          </div>,
          portalRoot,
        )
      : null;

  return (
    <div className="select" ref={rootRef}>
      <button
        type="button"
        className={`select-trigger${open ? ' open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        ref={triggerRef}
        onClick={toggleMenu}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="select-trigger-label">
          {selected?.prefix ? <span className="select-prefix">{selected.prefix}</span> : null}
          {selected?.label ?? ''}
        </span>
        <Icon name="chevron" />
      </button>
      {menu}
    </div>
  );
}

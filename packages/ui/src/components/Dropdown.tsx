import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@edunet/ui/lib/utils';

export interface DropdownItem {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
  ariaLabel?: string;
}

/** Keyboard-accessible dropdown menu: Enter/Space opens, Escape closes,
 *  arrow keys navigate, focus returns to the trigger on close. */
export const Dropdown: React.FC<DropdownProps> = ({ trigger, items, align = 'right', ariaLabel }) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, items.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      const item = items[activeIndex];
      if (item && !item.disabled) {
        item.onSelect();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
  };

  return (
    <div ref={rootRef} className="relative inline-block" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 mt-1 min-w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              aria-disabled={item.disabled || undefined}
              onClick={() => {
                if (item.disabled) return;
                item.onSelect();
                setOpen(false);
                triggerRef.current?.focus();
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                'block w-full text-left px-4 py-2 text-sm',
                item.disabled
                  ? 'text-gray-400 cursor-not-allowed'
                  : item.destructive
                    ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30'
                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800',
                index === activeIndex && !item.disabled && 'bg-gray-100 dark:bg-gray-800',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

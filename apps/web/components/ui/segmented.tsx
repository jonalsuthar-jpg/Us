'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface Option<T extends string> {
  value: T;
  label: ReactNode;
}

/**
 * A row of mutually exclusive choices on an inset track. Arrow keys move
 * between options (radiogroup semantics), so it works without a mouse.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
  size = 'md',
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-control bg-paper-sunken p-1', className)}>
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            name={name}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
              if (!step) return;
              e.preventDefault();
              const next = options[(i + step + options.length) % options.length]!;
              onChange(next.value);
              (e.currentTarget.parentElement?.children[options.indexOf(next)] as HTMLElement | undefined)?.focus();
            }}
            className={cn(
              'flex-1 whitespace-nowrap rounded-[9px] font-medium transition-[background-color,color,box-shadow] duration-quick',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
              size === 'sm' ? 'px-3 py-1.5 text-small' : 'px-4 py-2 text-small sm:text-body',
              selected ? 'bg-paper-raised text-ink shadow-[0_1px_2px_rgba(36,25,51,0.12)]' : 'text-ink-soft hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A small toggleable pill — for quick picks and filters. */
export function Chip({
  selected,
  onClick,
  children,
  className,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-small transition-colors duration-quick',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
        selected ? 'border-ink/30 bg-paper-raised text-ink' : 'border-paper-edge text-ink-soft hover:border-ink/25 hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

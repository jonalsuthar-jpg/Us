import type { PartnerSlot } from '@us/shared';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { SLOT_BG } from './tones';

/** The rose button in a section's corner that opens its add form. */
export function AddPill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button onClick={onClick}>
      <Plus className="h-4 w-4" strokeWidth={2.4} /> {label}
    </Button>
  );
}

/** Small caps heading over a group. */
export function GroupLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-micro font-semibold uppercase tracking-[0.08em] text-ink-soft">{children}</h3>
      {right}
    </div>
  );
}

/** A partner's initial in their colour. */
export function Initial({ slot, name, size = 30 }: { slot: PartnerSlot; name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', SLOT_BG[slot])}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

/** A thin progress ring, 0–1. Track uses currentColor at low opacity. */
export function Ring({ value, color, size = 36, stroke = 4 }: { value: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} aria-hidden className="text-ink">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeOpacity={0.1} strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${Math.max(0, Math.min(1, value)) * len} ${len}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-[stroke-dasharray] duration-300"
      />
    </svg>
  );
}

/** A two-colour split bar, `left` (0–1) in the first colour. */
export function SplitBar({ left, leftColor, rightColor, height = 8 }: { left: number; leftColor: string; rightColor: string; height?: number }) {
  return (
    <div className="flex overflow-hidden rounded-full bg-paper-sunken" style={{ height }}>
      <span className="transition-[width] duration-300" style={{ width: `${Math.round(left * 100)}%`, backgroundColor: leftColor }} />
      <span className="flex-1" style={{ backgroundColor: rightColor }} />
    </div>
  );
}

/** Choice pill with a wash when picked. */
export function Pick({ selected, onClick, children, className }: { selected: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-small transition-colors duration-quick',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
        selected ? 'border-plum-400 bg-plum-50 font-semibold text-ink' : 'border-paper-edge bg-paper-raised font-medium text-ink-soft hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

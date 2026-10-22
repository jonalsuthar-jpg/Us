'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * One series of daily counts as thin bars on a shared baseline. Each bar shows
 * its day and value on hover or focus; a hidden table carries the same numbers
 * for screen readers.
 */
export function BarChart({
  title,
  points,
  unit,
  barClass = 'bg-plum-500',
}: {
  title: string;
  points: { day: string; value: number }[];
  unit: string;
  barClass?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((n, p) => n + p.value, 0);
  const label = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const active = hover === null ? null : points[hover];

  return (
    <figure className="rounded-sheet border border-paper-edge bg-paper-raised p-5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-small font-medium text-ink">{title}</span>
        <span className="text-micro text-ink-muted" aria-live="polite">
          {active ? `${label(active.day)} · ${active.value} ${unit}` : `${total} ${unit} in ${points.length} days`}
        </span>
      </figcaption>
      <div className="relative mt-4 h-32" onMouseLeave={() => setHover(null)}>
        {/* Recessive guide at the top value. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-paper-edge" aria-hidden />
        <span className="pointer-events-none absolute -top-2 right-0 bg-paper-raised pl-1 text-[10px] leading-none text-ink-muted" aria-hidden>
          {max}
        </span>
        <div className="flex h-full items-end gap-[2px] border-b border-ink/15" aria-hidden>
          {points.map((p, i) => (
            <button
              key={p.day}
              type="button"
              tabIndex={-1}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              className="flex h-full flex-1 items-end focus:outline-none"
            >
              <span
                className={cn('block w-full rounded-t-[4px] transition-opacity', barClass, hover !== null && hover !== i && 'opacity-50')}
                style={{ height: p.value ? `${Math.max(3, (p.value / max) * 100)}%` : 0 }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-ink-muted" aria-hidden>
        <span>{points[0] && label(points[0].day)}</span>
        <span>{points.at(-1) && label(points.at(-1)!.day)}</span>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <th scope="row">{label(p.day)}</th>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

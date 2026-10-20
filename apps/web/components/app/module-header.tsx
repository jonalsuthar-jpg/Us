import { moduleById, type ModuleId } from '@us/shared';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const MODULE_ACCENT: Record<ModuleId, { wash: string; ink: string; sheet: 'rose' | 'teal' | 'plum' | 'gold' | 'sage' }> = {
  talk: { wash: 'bg-rose-100', ink: 'text-rose-700', sheet: 'rose' },
  connect: { wash: 'bg-teal-100', ink: 'text-teal-700', sheet: 'teal' },
  plan: { wash: 'bg-plum-100', ink: 'text-plum-600', sheet: 'plum' },
  memory: { wash: 'bg-gold-100', ink: 'text-gold-700', sheet: 'gold' },
  growth: { wash: 'bg-sage-100', ink: 'text-sage-700', sheet: 'sage' },
};

/** Title + tagline for a live module, with the module's colour as a soft wash. */
export function ModuleHeader({ id, children }: { id: ModuleId; children?: ReactNode }) {
  const mod = moduleById(id);
  const accent = MODULE_ACCENT[id];
  return (
    <header className="relative flex flex-wrap items-end justify-between gap-6">
      <span aria-hidden className={cn('absolute -left-10 -top-10 h-40 w-40 rounded-full opacity-70 blur-2xl', accent.wash)} />
      <div className="relative">
        <h1 className="font-display text-[40px] leading-[1.05] text-ink sm:text-[52px]">{mod.title}</h1>
        <p className="mt-3 max-w-xl text-balance font-display text-lead font-light italic text-ink-soft">{mod.tagline}</p>
      </div>
      {children ? <div className="relative">{children}</div> : null}
    </header>
  );
}

/** A quiet, centred note for when a list has nothing in it yet. */
export function EmptyNote({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-sheet border border-dashed border-paper-edge px-6 py-10 text-center">
      <p className="font-display text-lead italic text-ink">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-sm text-small text-ink-soft">{children}</div> : null}
    </div>
  );
}

/** Inline error line for forms and loads. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-small text-rose-700">
      {children}
    </p>
  );
}

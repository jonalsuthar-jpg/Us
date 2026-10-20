'use client';

import { moduleById, type ModuleId } from '@us/shared';
import { useCouple } from '@us/shared/react';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { MobileSettingsLink } from './app-shell';
import { MODULE_ACCENT } from './module-header';

/**
 * Placeholder for a module that isn't built yet. It already shows the
 * private/shared boundary of every planned feature, so the privacy model is
 * visible from day one. The schema + RLS for these features exist in
 * supabase/migrations/*_future_phases.sql.
 */
export function ModulePlaceholder({ id }: { id: ModuleId }) {
  const mod = moduleById(id);
  const { partner } = useCouple();
  const accent = MODULE_ACCENT[id];

  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-10 sm:py-16">
      <header className="relative">
        <span aria-hidden className={cn('absolute -left-10 -top-10 h-40 w-40 rounded-full opacity-70 blur-2xl', accent.wash)} />
        <MobileSettingsLink className="absolute right-0 top-0" />
        <p className={cn('relative text-small font-medium', accent.ink)}>Coming in phase {mod.phase}</p>
        <h1 className="relative mt-2 font-display text-[40px] leading-[1.05] text-ink sm:text-[52px]">{mod.title}</h1>
        <p className="relative mt-4 max-w-xl text-balance font-display text-lead font-light italic text-ink-soft">
          {mod.tagline}
        </p>
      </header>

      <ul className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {mod.features.map((f, i) => (
          <li key={f.title}>
            <Sheet tone={i === 0 ? 'note' : 'inset'} accent={i === 0 ? accent.sheet : 'none'} pad="md" className="h-full">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-heading text-ink">{f.title}</h2>
              </div>
              <p className="mt-2 text-small text-ink-soft">{f.blurb}</p>
              <PrivacyBadge privacy={f.privacy} partnerName={partner.display_name} className="mt-4" />
            </Sheet>
          </li>
        ))}
      </ul>
    </div>
  );
}

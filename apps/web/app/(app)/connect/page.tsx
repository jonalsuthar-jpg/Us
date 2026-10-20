'use client';

import { moduleById } from '@us/shared';
import { useCouple } from '@us/shared/react';
import { ModuleHeader } from '@/components/app/module-header';
import { DailyQuestion } from '@/components/connect/daily-question';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Sheet } from '@/components/ui/sheet';

// TODO(phase-3): Fight Translator (Edge Function supabase/functions/fight-translator), Future Letters, Inside Jokes.
// Their tables and RLS are ready (20261022000000_connect.sql).
export default function ConnectPage() {
  const { partner } = useCouple();
  const soon = moduleById('connect').features.filter((f) => f.soon);

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-10 sm:py-14">
      <ModuleHeader id="connect" />
      <DailyQuestion />

      <section aria-labelledby="coming" className="space-y-4">
        <h2 id="coming" className="font-display text-heading text-ink">
          Coming to Connect
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {soon.map((f) => (
            <li key={f.title}>
              <Sheet tone="inset" pad="md" className="h-full">
                <h3 className="font-display text-lead text-ink">{f.title}</h3>
                <p className="mt-2 text-small text-ink-soft">{f.blurb}</p>
                <PrivacyBadge privacy={f.privacy} partnerName={partner.display_name} className="mt-4" />
              </Sheet>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

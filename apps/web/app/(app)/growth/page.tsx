'use client';

import { partnerNudges } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { HeartHandshake } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ModuleHeader } from '@/components/app/module-header';
import { GrowthGoals } from '@/components/growth/goals';
import { GrowthLoveLanguages } from '@/components/growth/love-languages';
import { GrowthMood } from '@/components/growth/mood';
import { GrowthWorries } from '@/components/growth/worries';
import { buttonStyles } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';

type Tab = 'goals' | 'mood' | 'worries' | 'love';

const TABS: { value: Tab; label: string }[] = [
  { value: 'goals', label: 'Goals' },
  { value: 'mood', label: 'Check in' },
  { value: 'worries', label: 'Worries' },
  { value: 'love', label: 'Love languages' },
];

export default function GrowthPage() {
  const { sb, partner } = useCouple();
  const [tab, setTab] = useState<Tab>('goals');
  // Refreshes when my partner asks for a nudge (see GrowthMood) — timestamps only.
  const nudges = useCoupleData('growth:nudges', () => partnerNudges(sb), [sb]);
  const latest = nudges.data?.[0];

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-10 sm:py-14">
      <ModuleHeader id="growth" />

      {latest && (
        <Sheet tone="note" accent="sage" pad="md" className="flex flex-wrap items-center gap-4">
          <HeartHandshake className="h-6 w-6 shrink-0 text-sage-700" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-display text-lead text-ink">{partner.display_name} could use a little extra care today.</p>
            <p className="text-small text-ink-soft">
              They asked for a nudge {new Date(latest).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}. That’s all
              you’ll see — the rest is theirs.
            </p>
          </div>
          <Link href="/talk" className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
            Send them a message
          </Link>
        </Sheet>
      )}

      <Segmented label="Growth section" options={TABS} value={tab} onChange={setTab} className="w-full sm:w-auto" />
      {tab === 'goals' && <GrowthGoals />}
      {tab === 'mood' && <GrowthMood />}
      {tab === 'worries' && <GrowthWorries />}
      {tab === 'love' && <GrowthLoveLanguages />}
    </div>
  );
}

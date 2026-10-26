'use client';

import { dailyState, filterDaily, fromDateKey, type DailyEntry, type DailyFilter } from '@us/shared';
import { useCouple } from '@us/shared/react';
import { ArrowLeft, CheckCheck, ChevronLeft, ChevronRight, Hourglass, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { EmptyNote, ErrorNote } from '@/components/app/module-header';
import { Avatar } from '@/components/ui/avatar';
import { Dialog } from '@/components/ui/dialog';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { dayLabel, useDaily } from './daily-question';

const FILTERS: { id: DailyFilter; label: (partner: string) => string }[] = [
  { id: 'all', label: () => 'All' },
  { id: 'both', label: () => 'Both answered' },
  { id: 'theirs', label: () => 'Waiting on me' },
  { id: 'mine', label: (p) => `Waiting on ${p}` },
];

/** Every day we've answered, by month, searchable; tap one to read both answers. */
export function AnswersArchive() {
  const daily = useDaily();
  const { me, partner, mySlot, partnerSlot } = useCouple();
  const [filter, setFilter] = useState<DailyFilter>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  // Today belongs here too once either of us has answered it.
  const entries = useMemo(() => {
    const d = daily.data;
    if (!d) return [];
    return dailyState(d.today) === 'ask' ? d.past : [d.today, ...d.past];
  }, [daily.data]);
  const shown = useMemo(() => filterDaily(entries, filter, query), [entries, filter, query]);
  const months = useMemo(() => {
    const out: { key: string; label: string; items: DailyEntry[] }[] = [];
    for (const e of shown) {
      const key = e.for_date.slice(0, 7);
      let g = out.at(-1);
      if (g?.key !== key) {
        g = { key, label: fromDateKey(e.for_date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), items: [] };
        out.push(g);
      }
      g.items.push(e);
    }
    return out;
  }, [shown]);

  const index = open ? shown.findIndex((e) => e.question_id === open) : -1;
  const current = index >= 0 ? shown[index]! : null;
  const since = entries.at(-1)?.for_date;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:px-10 sm:py-12">
      <Link href="/connect" className="inline-flex items-center gap-1.5 rounded text-small text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Connect
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display text-[40px] leading-[1.05] text-ink">Our answers</h1>
          <p className="mt-2 font-serif text-lead font-light italic text-ink-soft">A little archive of the two of you.</p>
        </div>
        {daily.data ? (
          <dl className="flex flex-wrap gap-2.5">
            <Stat label="Streak" value={`${daily.data.streak} ${daily.data.streak === 1 ? 'day' : 'days'}`} tone="bg-gold-50 text-gold-700" />
            <Stat label="Both answered" value={String(daily.data.together)} tone="bg-teal-50 text-teal-700" />
            {since ? <Stat label="Since" value={fromDateKey(since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} tone="bg-plum-50 text-plum-600" /> : null}
          </dl>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-12 min-w-0 flex-[1_1_280px] items-center gap-2.5 rounded-control border border-paper-edge bg-paper-raised px-3.5 text-ink-muted focus-within:ring-2 focus-within:ring-gold-400">
          <Search className="h-4 w-4 shrink-0" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions and answers"
            aria-label="Search questions and answers"
            className="min-w-0 flex-1 bg-transparent text-body text-ink placeholder:text-ink-muted focus:outline-none"
          />
        </label>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'h-10 rounded-full border px-4 text-small font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                filter === f.id ? 'border-teal-600 bg-teal-600 text-white' : 'border-paper-edge bg-paper-raised text-ink-soft hover:text-ink',
              )}
            >
              {f.label(partner.display_name)}
            </button>
          ))}
        </div>
      </div>

      {daily.error && !daily.data ? <ErrorNote>{daily.error}</ErrorNote> : null}
      {!daily.data && !daily.error ? (
        <ul className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i}>
              <Sheet tone="inset" className="h-40 animate-pulse" />
            </li>
          ))}
        </ul>
      ) : null}
      {daily.data && entries.length === 0 ? (
        <EmptyNote title="Just getting started">Answer today’s question and it starts your archive.</EmptyNote>
      ) : null}
      {daily.data && entries.length > 0 && shown.length === 0 ? <EmptyNote title="Nothing matches that">Try another word, or show everything.</EmptyNote> : null}

      {months.map((g) => (
        <section key={g.key} aria-labelledby={`m-${g.key}`} className="space-y-3">
          <h2 id={`m-${g.key}`} className="pt-2 text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {g.label}
          </h2>
          <ul className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((e) => (
              <li key={e.question_id}>
                <button
                  type="button"
                  onClick={() => setOpen(e.question_id)}
                  className="flex h-full w-full flex-col gap-3 rounded-[20px] border border-paper-edge bg-paper-raised p-5 text-left shadow-[0_1px_0_rgba(36,25,51,0.04),0_12px_32px_-18px_rgba(36,25,51,0.28)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                >
                  <span className="text-micro text-ink-muted">{dayLabel(e.for_date)}</span>
                  <span className="flex-1 font-serif text-lead text-ink">{e.prompt}</span>
                  <StateBadge entry={e} partnerName={partner.display_name} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Dialog open={!!current} onOpenChange={(o) => !o && setOpen(null)} title={current ? dayLabel(current.for_date, true) : ''} className="sm:w-[min(92vw,560px)]">
        {current ? (
          <div className="space-y-5">
            <h3 className="font-serif text-[26px] leading-tight text-ink">{current.prompt}</h3>
            <StateBadge entry={current} partnerName={partner.display_name} />
            <div className="space-y-3">
              <Bubble who="You" slot={mySlot} name={me.display_name} side="left">
                {current.my_answer ?? <span className="italic text-ink-muted">You didn’t answer this one.</span>}
              </Bubble>
              <Bubble who={partner.display_name} slot={partnerSlot} name={partner.display_name} side="right">
                {current.partner_answer ?? (
                  <span className="inline-flex items-center gap-1.5 italic text-ink-muted">
                    <Hourglass className="h-3.5 w-3.5" aria-hidden />
                    {current.partner_answered ? 'Answered. It stays hidden, since you didn’t.' : 'Didn’t answer'}
                  </span>
                )}
              </Bubble>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={index <= 0}
                onClick={() => setOpen(shown[index - 1]!.question_id)}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-control bg-paper-sunken text-small font-medium text-ink hover:bg-paper-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden /> Newer
              </button>
              <button
                type="button"
                disabled={index >= shown.length - 1}
                onClick={() => setOpen(shown[index + 1]!.question_id)}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-control bg-paper-sunken text-small font-medium text-ink hover:bg-paper-edge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 disabled:opacity-40"
              >
                Older <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={cn('rounded-2xl px-4 py-3', tone)}>
      <dt className="text-micro">{label}</dt>
      <dd className="mt-0.5 font-display text-heading text-ink">{value}</dd>
    </div>
  );
}

function StateBadge({ entry, partnerName }: { entry: DailyEntry; partnerName: string }) {
  const s = dailyState(entry);
  const look =
    s === 'revealed'
      ? { cls: 'bg-teal-50 text-teal-700', text: 'Both answered', Icon: CheckCheck }
      : s === 'nudge'
        ? { cls: 'bg-gold-50 text-gold-700', text: `${partnerName} answered · yours unlocks it`, Icon: Hourglass }
        : { cls: 'bg-plum-50 text-plum-600', text: 'Only you answered', Icon: Hourglass };
  return (
    <span className={cn('inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-micro font-semibold', look.cls)}>
      <look.Icon className="h-3.5 w-3.5" aria-hidden />
      {look.text}
    </span>
  );
}

function Bubble({ who, slot, name, side, children }: { who: string; slot: 'a' | 'b'; name: string; side: 'left' | 'right'; children: React.ReactNode }) {
  return (
    <figure className={cn('m-0 space-y-2 rounded-[20px] p-4', slot === 'a' ? 'bg-rose-50' : 'bg-teal-50', side === 'left' ? 'rounded-bl-md' : 'rounded-br-md')}>
      <figcaption className={cn('flex items-center gap-2 text-micro font-semibold', slot === 'a' ? 'text-rose-700' : 'text-teal-700')}>
        <Avatar name={name} slot={slot} size="sm" className="[&>span]:h-6 [&>span]:w-6 [&>span]:ring-0 [&>span]:ring-offset-0" />
        {who}
      </figcaption>
      <p className="whitespace-pre-wrap text-body text-ink">{children}</p>
    </figure>
  );
}

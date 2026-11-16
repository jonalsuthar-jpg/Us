'use client';

import {
  addDays,
  daysUntil,
  decisionCategories,
  formatEventTime,
  formatMoney,
  laborBalance,
  LISTS,
  LIST_NAMES,
  listDecisionOptions,
  listExpenses,
  listItems,
  listLabor,
  listUpcoming,
  planActivity,
  settleUp,
  shortAgo,
  toDateKey,
  whenLabel,
  type FeatureKey,
} from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { CalendarDays, ChevronRight, Dices, HeartHandshake, ListChecks, Plus, ReceiptText, Wallet, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { GroupLabel, Initial, SplitBar } from './bits';
import { KIND_STYLE, SLOT_FILL, TONE, type Tone } from './tones';

export type PlanSection = 'calendar' | 'lists' | 'decide' | 'labour' | 'costs';
/** What's open: a section, maybe straight into its add form, maybe on one Decide list. */
export type PlanOpen = { section: PlanSection; adding?: boolean; category?: string };

export const PLAN_SECTIONS: Record<PlanSection, { title: string; feature: FeatureKey }> = {
  calendar: { title: 'Calendar', feature: 'calendar' },
  lists: { title: 'Lists', feature: 'lists' },
  decide: { title: 'Decide', feature: 'decide' },
  labour: { title: 'Share the load', feature: 'labour' },
  costs: { title: 'Money', feature: 'costs' },
};

const LABOUR_DAYS = 30;

/** One calm screen: a live line from every part of Plan, each a click away. */
export function PlanHub({ sections, onOpen }: { sections: PlanSection[]; onOpen: (o: PlanOpen) => void }) {
  const ctx = useCouple();
  const { sb, couple, partner, mySlot, partnerSlot } = ctx;
  const on = (s: PlanSection) => sections.includes(s);
  const today = toDateKey(new Date());
  const since = toDateKey(addDays(new Date(), -LABOUR_DAYS));
  const [adding, setAdding] = useState(false);

  // Same topics (and slices) as the sections, so caches and live updates are shared.
  const upcoming = useCoupleData('plan:calendar', () => (on('calendar') ? listUpcoming(sb, couple.id, new Date(new Date().setHours(0, 0, 0, 0)), 12) : Promise.resolve([])), [sb, couple.id, 'upcoming', today, on('calendar')]);
  const items = useCoupleData('plan:lists', () => (on('lists') ? listItems(sb, couple.id) : Promise.resolve([])), [sb, couple.id]);
  const expenses = useCoupleData('plan:costs', () => (on('costs') ? listExpenses(sb, couple.id) : Promise.resolve([])), [sb, couple.id]);
  const options = useCoupleData('plan:decisions', () => (on('decide') ? listDecisionOptions(sb, couple.id) : Promise.resolve([])), [sb, couple.id]);
  const labor = useCoupleData('plan:labour', () => (on('labour') ? listLabor(sb, couple.id, since) : Promise.resolve([])), [sb, couple.id, since]);

  const events = upcoming.data ?? [];
  const next = events[0];
  const week = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));
  const dots = new Map<string, string[]>();
  for (const e of events) {
    const k = toDateKey(new Date(e.starts_at));
    dots.set(k, [...(dots.get(k) ?? []), SLOT_FILL[e.created_by === ctx.me.id ? mySlot : partnerSlot]]);
  }
  const open = (items.data ?? []).filter((i) => !i.done_at);
  const openBy = LIST_NAMES.map((n) => ({ n, count: open.filter((i) => i.list === n).length })).filter((x) => x.count);
  const balance = settleUp(expenses.data ?? [], couple).find((b) => b.debtor) ?? null;
  const iOwe = balance?.debtor === mySlot;
  const firstCat = decisionCategories(options.data ?? [])[0];
  const optionCount = (options.data ?? []).filter((o) => o.category === firstCat).length;
  const lb = laborBalance(labor.data ?? [], couple);
  const myShare = mySlot === 'a' ? lb.aShare : 1 - lb.aShare;
  const feed = planActivity(ctx, { items: items.data, expenses: expenses.data, labor: labor.data }, 5);
  const NextIcon = next ? KIND_STYLE[next.kind ?? 'other'].Icon : null;

  const cards: { s: PlanSection; node: ReactNode }[] = [];
  if (on('lists'))
    cards.push({
      s: 'lists',
      node: (
        <HubCard tone="teal" Icon={ListChecks} label="Lists" onClick={() => onOpen({ section: 'lists' })}>
          <p className="font-display text-[26px] leading-tight text-ink">{open.length ? `${open.length} open` : 'All done'}</p>
          <p className="whitespace-pre-line text-micro text-ink-soft">
            {openBy.length ? openBy.slice(0, 2).map((x) => `${LISTS[x.n].title} · ${x.count}`).join('\n') : 'Add the next thing'}
          </p>
        </HubCard>
      ),
    });
  if (on('costs'))
    cards.push({
      s: 'costs',
      node: (
        <HubCard tone="rose" wash Icon={Wallet} label={balance ? (iOwe ? `You owe ${partner.display_name}` : `${partner.display_name} owes you`) : 'Money'} onClick={() => onOpen({ section: 'costs' })}>
          <p className={cn('font-display text-[26px] leading-tight', balance ? (iOwe ? 'text-rose-700' : 'text-teal-700') : 'text-ink')}>
            {balance ? formatMoney(balance.amount_cents, balance.currency) : 'All square'}
          </p>
          <p className="text-micro text-ink-soft">{balance ? 'Settle up anytime' : 'Log a shared cost'}</p>
        </HubCard>
      ),
    });
  if (on('decide'))
    cards.push({
      s: 'decide',
      node: (
        <button
          type="button"
          onClick={() => onOpen({ section: 'decide' })}
          className="flex h-full min-h-[160px] w-full flex-col items-start gap-2.5 rounded-sheet bg-plum-800 p-5 text-left transition-transform duration-quick hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-gold-200">
            <Dices className="h-5 w-5" />
          </span>
          <span className="text-small text-paper/70">{firstCat ? `Can’t pick ${firstCat.toLowerCase()}?` : 'Can’t decide?'}</span>
          <span className="font-serif text-[24px] italic leading-tight text-gold-200">Spin for it</span>
          <span className="text-micro text-paper/70">{firstCat ? `${optionCount} options ready` : 'Make a list to spin'}</span>
        </button>
      ),
    });
  if (on('labour'))
    cards.push({
      s: 'labour',
      node: (
        <HubCard tone="sage" Icon={HeartHandshake} label="Share the load" onClick={() => onOpen({ section: 'labour' })}>
          <p className="font-serif text-[22px] italic leading-tight text-ink">
            {!lb.total ? 'Notice something' : myShare >= 0.4 && myShare <= 0.6 ? 'Pretty even' : myShare > 0.6 ? 'You’re carrying more' : `${partner.display_name} is carrying more`}
          </p>
          {lb.total ? (
            <div className="w-full space-y-1">
              <SplitBar left={myShare} leftColor={SLOT_FILL[mySlot]} rightColor={SLOT_FILL[partnerSlot]} />
              <p className="flex justify-between text-micro text-ink-soft">
                <span>You {Math.round(myShare * 100)}</span>
                <span>
                  {partner.display_name} {100 - Math.round(myShare * 100)}
                </span>
              </p>
            </div>
          ) : (
            <p className="text-micro text-ink-soft">A balance, never a scoreboard</p>
          )}
        </HubCard>
      ),
    });

  const quick: { s: PlanSection; tone: Tone; Icon: LucideIcon; title: string; sub: string }[] = [
    { s: 'calendar', tone: 'rose', Icon: CalendarDays, title: 'Plan something', sub: 'A date, a trip, a birthday' },
    { s: 'lists', tone: 'teal', Icon: ListChecks, title: 'Add to a list', sub: 'Groceries, watch, read' },
    { s: 'costs', tone: 'gold', Icon: ReceiptText, title: 'Log a cost', sub: 'Split it in seconds' },
    { s: 'labour', tone: 'sage', Icon: HeartHandshake, title: 'Notice something', sub: 'Thank them for a chore' },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        {on('calendar') ? (
          <button
            type="button"
            onClick={() => onOpen({ section: 'calendar' })}
            className="block w-full space-y-4 rounded-sheet border border-paper-edge bg-paper-raised p-5 text-left transition-shadow duration-quick hover:shadow-[0_12px_32px_-18px_rgba(36,25,51,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            <GroupLabel right={<ChevronRight className="h-4 w-4 text-ink-muted" />}>This week</GroupLabel>
            <div className="grid grid-cols-7">
              {week.map((d, i) => {
                const k = toDateKey(d);
                return (
                  <div key={k} className="flex flex-col items-center gap-1">
                    <span className="text-micro text-ink-muted">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                    <span className={cn('flex h-9 w-9 items-center justify-center rounded-full text-small', i === 0 ? 'bg-rose-600 font-semibold text-white' : 'font-medium text-ink')}>{d.getDate()}</span>
                    <span className="flex h-1.5 gap-0.5">
                      {(dots.get(k) ?? []).slice(0, 3).map((color, j) => (
                        <span key={j} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
            {next && NextIcon ? (
              <div className="flex items-center gap-4 rounded-2xl bg-plum-800 px-4 py-3.5 text-paper">
                <span className="flex h-[52px] w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-white/10">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gold-200">{new Date(next.starts_at).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                  <span className="text-[20px] font-bold leading-6">{new Date(next.starts_at).getDate()}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-micro font-medium text-gold-200">Next up · {whenLabel(daysUntil(toDateKey(new Date(next.starts_at)))).toLowerCase()}</span>
                  <span className="mt-0.5 block truncate text-lead font-semibold">{next.title}</span>
                  <span className="mt-0.5 block text-micro text-paper/70">
                    {formatEventTime(next)} · {next.created_by === ctx.me.id ? 'you planned it' : `${partner.display_name} planned it`}
                  </span>
                </span>
                <NextIcon className="h-6 w-6 shrink-0 text-gold-200" />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-paper-edge px-4 py-3.5">
                <p className="font-serif text-lead italic text-ink">Nothing planned yet.</p>
                <p className="text-small text-ink-soft">Click to plan something together.</p>
              </div>
            )}
          </button>
        ) : null}

        {cards.length ? (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {cards.map(({ s, node }, i) => (
              <div key={s} className={cn(cards.length % 2 === 1 && i === cards.length - 1 && 'col-span-2 xl:col-span-1')}>
                {node}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <aside className="space-y-4">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-control border border-dashed border-plum-300 text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          <Plus className="h-4 w-4" /> Add something
        </button>
        {feed.length ? (
          <section className="space-y-1">
            <GroupLabel>Lately</GroupLabel>
            <ul>
              {feed.map((f) => (
                <li key={f.id} className="flex items-center gap-3 border-b border-paper-edge py-2.5">
                  <Initial slot={f.mine ? mySlot : partnerSlot} name={f.mine ? ctx.me.display_name : partner.display_name} />
                  <span className="min-w-0 flex-1 text-small text-ink">{f.text}</span>
                  <span className="shrink-0 text-micro text-ink-muted">{shortAgo(f.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </aside>

      <Dialog open={adding} onOpenChange={setAdding} title="Add something">
        <div className="grid grid-cols-2 gap-3">
          {quick
            .filter((q) => on(q.s))
            .map((q) => (
              <button
                key={q.s}
                type="button"
                onClick={() => {
                  setAdding(false);
                  onOpen({ section: q.s, adding: q.s !== 'lists' });
                }}
                className={cn('flex flex-col items-start gap-2 rounded-sheet p-4 text-left transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400', TONE[q.tone].wash)}
              >
                <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl bg-paper-raised', TONE[q.tone].ink)}>
                  <q.Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="font-semibold text-ink">{q.title}</span>
                <span className="text-micro text-ink-soft">{q.sub}</span>
              </button>
            ))}
        </div>
      </Dialog>
    </div>
  );
}

function HubCard({ tone, Icon, label, wash, onClick, children }: { tone: Tone; Icon: LucideIcon; label: string; wash?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-full min-h-[160px] w-full flex-col items-start gap-2.5 rounded-sheet p-5 text-left transition-transform duration-quick hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
        wash ? TONE[tone].wash : 'border border-paper-edge bg-paper-raised',
      )}
    >
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', wash ? 'bg-paper-raised' : TONE[tone].wash, TONE[tone].ink)}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="w-full truncate text-small text-ink-soft">{label}</span>
      {children}
    </button>
  );
}

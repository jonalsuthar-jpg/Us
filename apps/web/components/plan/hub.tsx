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
import { CalendarDays, ChevronRight, Dices, Heart, HeartHandshake, ListChecks, Plus, ReceiptText, Wallet, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { BagArt, Burst, CoinsArt, DinnerArt, WheelArt } from './art';
import { Initial, SplitBar } from './bits';
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
        <HubCard
          className="bg-gradient-to-br from-[#EFE8FB] to-[#F8F4FE] dark:from-plum-50 dark:to-paper-raised"
          Icon={ListChecks}
          iconTone="text-plum-600"
          art={<BagArt className="absolute -bottom-2 right-1 h-[104px] w-[104px]" />}
          onClick={() => onOpen({ section: 'lists' })}
        >
          <span className="text-body font-semibold text-ink">Lists</span>
          <span className="font-display text-[30px] font-extrabold leading-9 text-ink">{open.length ? `${open.length} open` : 'All done'}</span>
          <span className="whitespace-pre-line text-small leading-5 text-ink-soft">
            {openBy.length ? openBy.slice(0, 2).map((x) => `${LISTS[x.n].title} · ${x.count}`).join('\n') : 'Add the next thing'}
          </span>
        </HubCard>
      ),
    });
  if (on('costs'))
    cards.push({
      s: 'costs',
      node: (
        <HubCard
          className="bg-gradient-to-br from-[#FFE1EA] to-[#FFF1F5] dark:from-rose-50 dark:to-paper-raised"
          Icon={Wallet}
          iconTone="text-rose-600"
          art={<CoinsArt className="absolute -bottom-1 -right-1 h-[92px] w-[118px]" />}
          onClick={() => onOpen({ section: 'costs' })}
        >
          <span className="text-body font-semibold text-ink">{balance ? (iOwe ? `You owe ${partner.display_name}` : `${partner.display_name} owes you`) : 'Money'}</span>
          <span className={cn('font-display text-[30px] font-extrabold leading-9', balance ? (iOwe ? 'text-rose-600' : 'text-teal-700') : 'text-ink')}>
            {balance ? formatMoney(balance.amount_cents, balance.currency) : 'All square'}
          </span>
          <span className={cn('mt-1 inline-flex h-10 items-center rounded-full px-5 text-small font-extrabold shadow-[0_10px_20px_-12px_rgba(196,29,85,0.9)]', balance ? 'bg-rose-600 text-white' : 'bg-paper-raised text-rose-700')}>
            {balance ? 'Settle up' : 'Log a cost'}
          </span>
        </HubCard>
      ),
    });
  if (on('decide'))
    cards.push({
      s: 'decide',
      node: (
        <HubCard
          className="bg-gradient-to-br from-[#4E3A7A] to-[#2E2148] text-white"
          Icon={Dices}
          iconTone="text-white"
          iconWash="bg-white/15"
          art={<WheelArt className="absolute -bottom-2 -right-1 h-[92px] w-[84px] sm:h-[118px] sm:w-[108px]" />}
          onClick={() => onOpen({ section: 'decide' })}
        >
          <span className="text-body text-white/85">{firstCat ? `Can’t pick ${firstCat.toLowerCase()}?` : 'Can’t decide?'}</span>
          <span className="font-serif text-[30px] italic leading-9 text-gold-300">Spin for it</span>
          <span className="text-small text-white/75">{firstCat ? `${optionCount} ${optionCount === 1 ? 'option' : 'options'} ready` : 'Make a list to spin'}</span>
        </HubCard>
      ),
    });
  if (on('labour'))
    cards.push({
      s: 'labour',
      node: (
        <HubCard
          className="bg-gradient-to-br from-[#DDF5EF] to-[#F1FBF8] dark:from-teal-50 dark:to-paper-raised"
          Icon={Heart}
          iconTone="text-teal-600"
          art={<Burst className="absolute right-5 top-[72px] h-6 w-6" />}
          wide
          onClick={() => onOpen({ section: 'labour' })}
        >
          <span className="text-body font-semibold text-ink">Share the load</span>
          <span className="font-serif text-[28px] italic leading-9 text-ink">
            {!lb.total ? 'Notice something' : myShare >= 0.4 && myShare <= 0.6 ? 'Pretty even' : myShare > 0.6 ? 'You’re carrying more' : `${partner.display_name} carries more`}
          </span>
          {lb.total ? (
            <span className="mt-1 block w-full space-y-1.5">
              <SplitBar left={myShare} leftColor={SLOT_FILL[mySlot]} rightColor={SLOT_FILL[partnerSlot]} height={10} />
              <span className="flex justify-between text-small text-ink-soft">
                <span>You {Math.round(myShare * 100)}%</span>
                <span>
                  {partner.display_name} {100 - Math.round(myShare * 100)}%
                </span>
              </span>
            </span>
          ) : (
            <span className="text-small text-ink-soft">A balance, never a scoreboard</span>
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
    <div className="space-y-5">
      {on('calendar') ? (
        <section className="rounded-[30px] bg-paper-raised p-4 shadow-[0_24px_50px_-30px_rgba(63,44,102,0.55)] sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2.5 font-display text-[22px] font-extrabold text-ink">
              <CalendarDays className="h-6 w-6 text-plum-600" aria-hidden />
              This week
            </h2>
            <button type="button" onClick={() => onOpen({ section: 'calendar' })} className="inline-flex items-center gap-0.5 text-body font-bold text-rose-600 hover:text-rose-700">
              Calendar <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <button type="button" onClick={() => onOpen({ section: 'calendar' })} className="mt-4 grid w-full grid-cols-7 gap-1.5 sm:gap-3" aria-label="Open calendar">
            {week.map((d, i) => {
              const k = toDateKey(d);
              return (
                <span key={k} className="flex flex-col items-center gap-2">
                  <span className="text-small font-semibold text-ink-soft">{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
                  <span
                    className={cn(
                      'flex h-11 w-full max-w-[52px] items-center justify-center rounded-[14px] text-[17px] font-bold',
                      i === 0 ? 'bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[0_8px_16px_-8px_rgba(196,29,85,0.9)]' : 'bg-paper-raised text-ink shadow-[0_4px_12px_-6px_rgba(36,25,51,0.35)] ring-1 ring-paper-edge',
                    )}
                  >
                    {d.getDate()}
                  </span>
                  <span className="flex h-2 gap-1">
                    {(dots.get(k) ?? []).slice(0, 3).map((color, j) => (
                      <span key={j} className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    ))}
                  </span>
                </span>
              );
            })}
          </button>
          {next && NextIcon ? (
            <button
              type="button"
              onClick={() => onOpen({ section: 'calendar' })}
              className="relative mt-4 flex w-full items-center gap-4 overflow-hidden rounded-[22px] bg-gradient-to-r from-[#3A2A5E] to-[#4B3468] px-4 py-4 text-left text-white"
            >
              {next.kind === 'date' || next.kind === 'other' || !next.kind ? (
                <DinnerArt className="pointer-events-none absolute -right-2 bottom-0 h-full w-[46%] opacity-90" />
              ) : (
                <NextIcon className="pointer-events-none absolute right-6 top-1/2 h-14 w-14 -translate-y-1/2 text-gold-300/60" aria-hidden />
              )}
              <span className="relative flex h-[68px] w-16 shrink-0 flex-col items-center justify-center rounded-[16px] bg-white/10">
                <span className="text-small font-bold uppercase text-gold-300">{new Date(next.starts_at).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span className="text-[26px] font-extrabold leading-7">{new Date(next.starts_at).getDate()}</span>
              </span>
              <span aria-hidden className="relative h-12 w-px shrink-0 bg-white/20" />
              <span className="relative min-w-0 flex-1 pr-[30%]">
                <span className="block text-small font-semibold text-gold-300">Next up · {whenLabel(daysUntil(toDateKey(new Date(next.starts_at)))).toLowerCase()}</span>
                <span className="mt-0.5 block truncate text-[20px] font-extrabold">{next.title}</span>
                <span className="mt-0.5 block truncate text-small text-white/75">
                  {formatEventTime(next)} · {next.created_by === ctx.me.id ? 'you planned it' : `${partner.display_name} planned it`}
                </span>
              </span>
            </button>
          ) : (
            <button type="button" onClick={() => onOpen({ section: 'calendar', adding: true })} className="mt-4 block w-full rounded-[22px] border-2 border-dashed border-paper-edge px-4 py-4 text-left">
              <span className="block font-serif text-lead italic text-ink">Nothing planned yet.</span>
              <span className="text-small text-ink-soft">Plan something together.</span>
            </button>
          )}
        </section>
      ) : null}

      {cards.length ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {cards.map(({ s, node }, i) => (
            <div key={s} className={cn(cards.length % 2 === 1 && i === cards.length - 1 && 'col-span-2')}>
              {node}
            </div>
          ))}
        </div>
      ) : null}

      <section className="space-y-3 pt-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 font-display text-[22px] font-extrabold text-ink">
            <span aria-hidden className="h-6 w-1 rounded-full bg-rose-500" />
            Lately
          </h2>
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add something"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[0_14px_28px_-12px_rgba(196,29,85,0.9)] transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            <Plus className="h-7 w-7" strokeWidth={2.6} />
          </button>
        </div>
        {feed.length ? (
          <ul className="space-y-2">
            {feed.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-full bg-paper-raised py-2.5 pl-2.5 pr-5 shadow-[0_8px_20px_-16px_rgba(36,25,51,0.6)] ring-1 ring-paper-edge">
                <Initial slot={f.mine ? mySlot : partnerSlot} name={f.mine ? ctx.me.display_name : partner.display_name} size={32} />
                <span className="min-w-0 flex-1 truncate text-small text-ink">{f.text}</span>
                <span className="shrink-0 text-micro text-ink-muted">{shortAgo(f.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-full bg-paper-raised px-5 py-3 text-small text-ink-soft ring-1 ring-paper-edge">What you both do in Plan shows up here.</p>
        )}
      </section>

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

/** One of the four illustrated cards: an icon tile, words, a picture in the corner. */
function HubCard({
  className,
  Icon,
  iconTone,
  iconWash = 'bg-paper-raised',
  art,
  wide,
  onClick,
  children,
}: {
  className: string;
  Icon: LucideIcon;
  iconTone: string;
  iconWash?: string;
  art: ReactNode;
  /** Words may run the full width (the split bar). */
  wide?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative isolate flex h-full min-h-[214px] w-full flex-col items-start gap-1 overflow-hidden rounded-[26px] p-4 text-left shadow-[0_18px_36px_-26px_rgba(63,44,102,0.6)] ring-1 ring-white/60 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 dark:ring-paper-edge sm:p-5',
        className,
      )}
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {art}
      </span>
      <span className={cn('mb-2 flex h-11 w-11 items-center justify-center rounded-[14px] shadow-[0_6px_14px_-8px_rgba(36,25,51,0.5)]', iconWash, iconTone)}>
        <Icon className="h-6 w-6" />
      </span>
      <span className={cn('flex flex-col gap-0.5', wide ? 'w-full' : 'max-w-[78%]')}>{children}</span>
    </button>
  );
}

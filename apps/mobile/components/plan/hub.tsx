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
import { CalendarDays, ChevronRight, Dices, HeartHandshake, ListChecks, Plus, ReceiptText, Wallet } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { cn } from '../ui/cn';
import { FormSheet } from '../ui/form-sheet';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';
import { GroupLabel, Initial, SplitBar } from './bits';
import { KIND_STYLE, SLOT_FILL, TONE, toneIcon, type Tone } from './tones';

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

/** One calm screen: a live line from every part of Plan, each a tap away. */
export function PlanHub({ sections, onOpen }: { sections: PlanSection[]; onOpen: (o: PlanOpen) => void }) {
  const ctx = useCouple();
  const { sb, couple, partner, mySlot, partnerSlot } = ctx;
  const c = usePalette();
  const on = (s: PlanSection) => sections.includes(s);
  const today = toDateKey(new Date());
  const since = toDateKey(addDays(new Date(), -LABOUR_DAYS));
  const [adding, setAdding] = useState(false);

  // Same topics (and slices) as the sections, so their caches and live updates are shared.
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
  const categories = decisionCategories(options.data ?? []);
  const firstCat = categories[0];
  const optionCount = (options.data ?? []).filter((o) => o.category === firstCat).length;
  const lb = laborBalance(labor.data ?? [], couple);
  const myShare = mySlot === 'a' ? lb.aShare : 1 - lb.aShare;
  const feed = planActivity(ctx, { items: items.data, expenses: expenses.data, labor: labor.data });

  const cards: { s: PlanSection; node: ReactNode }[] = [];
  if (on('lists'))
    cards.push({
      s: 'lists',
      node: (
        <HubCard tone="teal" Icon={ListChecks} label="Lists" onPress={() => onOpen({ section: 'lists' })}>
          <Display className="text-[24px] leading-[30px]">{open.length ? `${open.length} open` : 'All done'}</Display>
          <Text className="text-micro text-ink-soft" numberOfLines={2}>
            {openBy.length ? openBy.slice(0, 2).map((x) => `${LISTS[x.n].title} · ${x.count}`).join('\n') : 'Add the next thing'}
          </Text>
        </HubCard>
      ),
    });
  if (on('costs'))
    cards.push({
      s: 'costs',
      node: (
        <HubCard tone="rose" Icon={Wallet} label={balance ? (iOwe ? `You owe ${partner.display_name}` : `${partner.display_name} owes you`) : 'Money'} wash onPress={() => onOpen({ section: 'costs' })}>
          <Display className={cn('text-[24px] leading-[30px]', balance && (iOwe ? 'text-rose-700' : 'text-teal-700'))}>
            {balance ? formatMoney(balance.amount_cents, balance.currency) : 'All square'}
          </Display>
          <Text className="text-micro text-ink-soft">{balance ? 'Tap to settle up' : 'Log a shared cost'}</Text>
        </HubCard>
      ),
    });
  if (on('decide'))
    cards.push({
      s: 'decide',
      node: (
        <Pressable accessibilityRole="button" onPress={() => onOpen({ section: 'decide' })} className="min-h-[150px] gap-2.5 rounded-sheet bg-plum-800 p-4 active:opacity-90">
          <View className="h-9 w-9 items-center justify-center rounded-xl bg-white/10">
            <Dices size={20} color="#FFD98A" />
          </View>
          <Text className="text-small text-paper/70">{firstCat ? `Can’t pick ${firstCat.toLowerCase()}?` : 'Can’t decide?'}</Text>
          <Display italic className="text-[22px] leading-[28px] text-gold-200">
            Spin for it
          </Display>
          <Text className="text-micro text-paper/70">{firstCat ? `${optionCount} options ready` : 'Make a list to spin'}</Text>
        </Pressable>
      ),
    });
  if (on('labour'))
    cards.push({
      s: 'labour',
      node: (
        <HubCard tone="sage" Icon={HeartHandshake} label="Share the load" onPress={() => onOpen({ section: 'labour' })}>
          <Display italic className="text-[20px] leading-[26px]">
            {!lb.total ? 'Notice something' : myShare >= 0.4 && myShare <= 0.6 ? 'Pretty even' : myShare > 0.6 ? 'You’re carrying more' : `${partner.display_name} is carrying more`}
          </Display>
          {lb.total ? (
            <View className="gap-1">
              <SplitBar left={myShare} leftColor={SLOT_FILL[mySlot]} rightColor={SLOT_FILL[partnerSlot]} />
              <View className="flex-row justify-between">
                <Text className="text-micro text-ink-soft">You {Math.round(myShare * 100)}</Text>
                <Text className="text-micro text-ink-soft">
                  {partner.display_name} {100 - Math.round(myShare * 100)}
                </Text>
              </View>
            </View>
          ) : (
            <Text className="text-micro text-ink-soft">A balance, never a scoreboard</Text>
          )}
        </HubCard>
      ),
    });

  const quick: { s: PlanSection; tone: Tone; Icon: typeof Plus; title: string; sub: string }[] = [
    { s: 'calendar', tone: 'rose', Icon: CalendarDays, title: 'Plan something', sub: 'A date, a trip, a birthday' },
    { s: 'lists', tone: 'teal', Icon: ListChecks, title: 'Add to a list', sub: 'Groceries, watch, read' },
    { s: 'costs', tone: 'gold', Icon: ReceiptText, title: 'Log a cost', sub: 'Split it in seconds' },
    { s: 'labour', tone: 'sage', Icon: HeartHandshake, title: 'Notice something', sub: 'Thank them for a chore' },
  ];

  return (
    <View className="gap-4">
      {on('calendar') ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Open calendar" onPress={() => onOpen({ section: 'calendar' })} className="gap-3 rounded-sheet border border-paper-edge bg-paper-raised p-4 active:bg-paper-sunken">
          <GroupLabel right={<ChevronRight size={18} color={c.inkMuted} />}>This week</GroupLabel>
          <View className="flex-row">
            {week.map((d, i) => {
              const k = toDateKey(d);
              return (
                <View key={k} className="flex-1 items-center gap-1">
                  <Text className="text-micro text-ink-muted">{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</Text>
                  <View className={cn('h-9 w-9 items-center justify-center rounded-full', i === 0 && 'bg-rose-600')}>
                    <Text className={cn('text-small', i === 0 ? 'font-sans-semibold text-white' : 'font-sans-medium')}>{d.getDate()}</Text>
                  </View>
                  <View className="h-1.5 flex-row gap-0.5">
                    {(dots.get(k) ?? []).slice(0, 3).map((color, j) => (
                      <View key={j} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
          {next ? (
            <View className="flex-row items-center gap-3.5 rounded-2xl bg-plum-800 px-4 py-3.5">
              <View className="h-[52px] w-12 items-center justify-center rounded-xl bg-white/10">
                <Text className="font-sans-semibold text-[10px] uppercase tracking-[0.8px] text-gold-200">
                  {new Date(next.starts_at).toLocaleDateString(undefined, { weekday: 'short' })}
                </Text>
                <Text className="font-sans-bold text-[20px] leading-[24px] text-paper">{new Date(next.starts_at).getDate()}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-micro font-sans-medium text-gold-200">Next up · {whenLabel(daysUntil(toDateKey(new Date(next.starts_at)))).toLowerCase()}</Text>
                <Text numberOfLines={1} className="mt-0.5 font-sans-semibold text-lead text-paper">
                  {next.title}
                </Text>
                <Text className="mt-0.5 text-micro text-paper/70">
                  {formatEventTime(next)} · {next.created_by === ctx.me.id ? 'you planned it' : `${partner.display_name} planned it`}
                </Text>
              </View>
              {(() => {
                const K = KIND_STYLE[next.kind ?? 'other'].Icon;
                return <K size={22} color="#FFD98A" />;
              })()}
            </View>
          ) : (
            <View className="rounded-2xl border border-dashed border-paper-edge px-4 py-3.5">
              <Display italic className="text-lead">
                Nothing planned yet.
              </Display>
              <Text className="text-small text-ink-soft">Tap to plan something together.</Text>
            </View>
          )}
        </Pressable>
      ) : null}

      {cards.length ? (
        <View className="flex-row flex-wrap justify-between gap-y-3">
          {cards.map(({ s, node }, i) => (
            <View key={s} className={cards.length % 2 === 1 && i === cards.length - 1 ? 'w-full' : 'w-[48.5%]'}>
              {node}
            </View>
          ))}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => setAdding(true)}
        className="h-12 flex-row items-center justify-center gap-2 rounded-control border border-dashed border-plum-300 active:bg-paper-sunken"
      >
        <Plus size={18} color={c.inkSoft} />
        <Text className="font-sans-medium text-ink-soft">Add something</Text>
      </Pressable>

      {feed.length ? (
        <View className="gap-1">
          <GroupLabel>Lately</GroupLabel>
          {feed.map((f) => (
            <View key={f.id} className="flex-row items-center gap-3 border-b border-paper-edge py-2.5">
              <Initial slot={f.mine ? mySlot : partnerSlot} name={f.mine ? ctx.me.display_name : partner.display_name} />
              <Text numberOfLines={2} className="flex-1 text-small">
                {f.text}
              </Text>
              <Text className="text-micro text-ink-muted">{shortAgo(f.at)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <FormSheet open={adding} title="Add something" onClose={() => setAdding(false)}>
        <View className="flex-row flex-wrap justify-between gap-y-3">
          {quick
            .filter((q) => on(q.s))
            .map((q) => (
              <Pressable
                key={q.s}
                accessibilityRole="button"
                onPress={() => {
                  setAdding(false);
                  onOpen({ section: q.s, adding: q.s !== 'lists' });
                }}
                className={cn('w-[48.5%] gap-2 rounded-sheet p-4 active:opacity-80', TONE[q.tone].wash)}
              >
                <View className="h-9 w-9 items-center justify-center rounded-xl bg-paper-raised">
                  <q.Icon size={18} color={toneIcon(c, q.tone)} />
                </View>
                <Text className="font-sans-semibold">{q.title}</Text>
                <Text className="text-micro text-ink-soft">{q.sub}</Text>
              </Pressable>
            ))}
        </View>
      </FormSheet>
    </View>
  );
}

function HubCard({
  tone,
  Icon,
  label,
  wash,
  onPress,
  children,
}: {
  tone: Tone;
  Icon: typeof Plus;
  label: string;
  wash?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={cn('min-h-[150px] gap-2.5 rounded-sheet p-4 active:opacity-85', wash ? TONE[tone].wash : 'border border-paper-edge bg-paper-raised')}
    >
      <View className={cn('h-9 w-9 items-center justify-center rounded-xl', wash ? 'bg-paper-raised' : TONE[tone].wash)}>
        <Icon size={20} color={toneIcon(c, tone)} />
      </View>
      <Text className="text-small text-ink-soft" numberOfLines={1}>
        {label}
      </Text>
      {children}
    </Pressable>
  );
}

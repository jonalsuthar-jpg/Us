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
import { CalendarDays, ChevronRight, Dices, Heart, HeartHandshake, ListChecks, Plus, ReceiptText, Wallet } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { cn } from '../ui/cn';
import { FormSheet } from '../ui/form-sheet';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';
import { BagArt, Burst, CoinsArt, DinnerArt, GradientView, WheelArt } from './art';
import { Initial, SplitBar } from './bits';
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

  const shadow = { shadowColor: '#3F2C66', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 4 };

  const cards: { s: PlanSection; node: ReactNode }[] = [];
  if (on('lists'))
    cards.push({
      s: 'lists',
      node: (
        <HubCard from={c.scheme === 'dark' ? '#241933' : '#EFE8FB'} to={c.scheme === 'dark' ? '#19141D' : '#F8F4FE'} Icon={ListChecks} iconColor={c.onPlum} art={<BagArt size={96} />} onPress={() => onOpen({ section: 'lists' })}>
          <Text className="font-sans-semibold text-body">Lists</Text>
          <Text className="font-sans-bold text-[28px] leading-[34px]">{open.length ? `${open.length} open` : 'All done'}</Text>
          <Text className="text-small leading-5 text-ink-soft" numberOfLines={2}>
            {openBy.length ? openBy.slice(0, 2).map((x) => `${LISTS[x.n].title} · ${x.count}`).join('\n') : 'Add the next thing'}
          </Text>
        </HubCard>
      ),
    });
  if (on('costs'))
    cards.push({
      s: 'costs',
      node: (
        <HubCard from={c.scheme === 'dark' ? '#3B1424' : '#FFE1EA'} to={c.scheme === 'dark' ? '#19141D' : '#FFF1F5'} Icon={Wallet} iconColor={c.roseStrong} art={<CoinsArt width={112} height={88} />} onPress={() => onOpen({ section: 'costs' })}>
          <Text className="font-sans-semibold text-body" numberOfLines={1}>
            {balance ? (iOwe ? `You owe ${partner.display_name}` : `${partner.display_name} owes you`) : 'Money'}
          </Text>
          <Text className={cn('font-sans-bold text-[28px] leading-[34px]', balance && (iOwe ? 'text-rose-600' : 'text-teal-700'))} numberOfLines={1} adjustsFontSizeToFit>
            {balance ? formatMoney(balance.amount_cents, balance.currency) : 'All square'}
          </Text>
          <View className={cn('mt-1 h-9 self-start justify-center rounded-full px-4', balance ? 'bg-rose-600' : 'bg-paper-raised')}>
            <Text className={cn('font-sans-bold text-small', balance ? 'text-white' : 'text-rose-700')}>{balance ? 'Settle up' : 'Log a cost'}</Text>
          </View>
        </HubCard>
      ),
    });
  if (on('decide'))
    cards.push({
      s: 'decide',
      node: (
        <HubCard from="#4E3A7A" to="#2E2148" Icon={Dices} iconColor="#fff" iconWash="bg-white/15" art={<WheelArt width={78} height={84} />} onPress={() => onOpen({ section: 'decide' })}>
          <Text className="text-body text-white/85">{firstCat ? `Can’t pick ${firstCat.toLowerCase()}?` : 'Can’t decide?'}</Text>
          <Display italic className="text-[24px] leading-[30px] text-gold-300">
            Spin for it
          </Display>
          <Text className="text-small text-white/75">{firstCat ? `${optionCount} ${optionCount === 1 ? 'option' : 'options'} ready` : 'Make a list to spin'}</Text>
        </HubCard>
      ),
    });
  if (on('labour'))
    cards.push({
      s: 'labour',
      node: (
        <HubCard from={c.scheme === 'dark' ? '#0C2B28' : '#DDF5EF'} to={c.scheme === 'dark' ? '#19141D' : '#F1FBF8'} Icon={Heart} iconColor={c.onTeal} art={<Burst />} artAt="burst" wide onPress={() => onOpen({ section: 'labour' })}>
          <Text className="font-sans-semibold text-body">Share the load</Text>
          <Display italic className="text-[24px] leading-[31px]">
            {!lb.total ? 'Notice something' : myShare >= 0.4 && myShare <= 0.6 ? 'Pretty even' : myShare > 0.6 ? 'You’re carrying more' : `${partner.display_name} carries more`}
          </Display>
          {lb.total ? (
            <View className="mt-1 gap-1.5">
              <SplitBar left={myShare} leftColor={SLOT_FILL[mySlot]} rightColor={SLOT_FILL[partnerSlot]} height={10} />
              <View className="flex-row justify-between">
                <Text className="text-small text-ink-soft">You {Math.round(myShare * 100)}%</Text>
                <Text className="text-small text-ink-soft">
                  {partner.display_name} {100 - Math.round(myShare * 100)}%
                </Text>
              </View>
            </View>
          ) : (
            <Text className="text-small text-ink-soft">A balance, never a scoreboard</Text>
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
  const NextIcon = next ? KIND_STYLE[next.kind ?? 'other'].Icon : null;

  return (
    <View className="gap-4">
      {on('calendar') ? (
        <View className="rounded-[30px] bg-paper-raised p-4" style={shadow}>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <CalendarDays size={22} color={c.onPlum} />
              <Text className="font-sans-bold text-[20px]">This week</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => onOpen({ section: 'calendar' })} hitSlop={8} className="flex-row items-center">
              <Text className="font-sans-bold text-body text-rose-600">Calendar</Text>
              <ChevronRight size={18} color={c.roseStrong} />
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open calendar" onPress={() => onOpen({ section: 'calendar' })} className="mt-3 flex-row gap-1.5">
            {week.map((d, i) => {
              const k = toDateKey(d);
              return (
                <View key={k} className="flex-1 items-center gap-1.5">
                  <Text className="font-sans-semibold text-small text-ink-soft">{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</Text>
                  <View
                    className={cn('h-11 w-full items-center justify-center rounded-[13px]', i === 0 ? 'bg-rose-600' : 'border border-paper-edge bg-paper-raised')}
                    style={i === 0 ? { shadowColor: '#C41D55', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 } : undefined}
                  >
                    <Text className={cn('font-sans-bold text-[16px]', i === 0 && 'text-white')}>{d.getDate()}</Text>
                  </View>
                  <View className="h-2 flex-row gap-1">
                    {(dots.get(k) ?? []).slice(0, 3).map((color, j) => (
                      <View key={j} className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    ))}
                  </View>
                </View>
              );
            })}
          </Pressable>
          {next && NextIcon ? (
            <Pressable accessibilityRole="button" onPress={() => onOpen({ section: 'calendar' })} className="mt-3">
              <GradientView from="#3A2A5E" to="#4B3468" radius={22} className="flex-row items-center gap-3.5 px-3.5 py-3.5">
                <View className="absolute bottom-0 right-0" pointerEvents="none">
                  {next.kind === 'date' || next.kind === 'other' || !next.kind ? <DinnerArt width={150} height={84} /> : <NextIcon size={48} color="rgba(252,194,79,0.6)" />}
                </View>
                <View className="h-[64px] w-[58px] items-center justify-center rounded-[16px] bg-white/10">
                  <Text className="font-sans-bold text-small uppercase text-gold-300">{new Date(next.starts_at).toLocaleDateString(undefined, { weekday: 'short' })}</Text>
                  <Text className="font-sans-bold text-[24px] leading-[28px] text-white">{new Date(next.starts_at).getDate()}</Text>
                </View>
                <View className="h-12 w-px bg-white/20" />
                <View className="flex-1 pr-16">
                  <Text className="font-sans-semibold text-small text-gold-300" numberOfLines={1}>
                    Next up · {whenLabel(daysUntil(toDateKey(new Date(next.starts_at)))).toLowerCase()}
                  </Text>
                  <Text className="mt-0.5 font-sans-bold text-[18px] text-white" numberOfLines={1}>
                    {next.title}
                  </Text>
                  <Text className="mt-0.5 text-small text-white/75" numberOfLines={1}>
                    {formatEventTime(next)} · {next.created_by === ctx.me.id ? 'you planned it' : `${partner.display_name} planned it`}
                  </Text>
                </View>
              </GradientView>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => onOpen({ section: 'calendar', adding: true })} className="mt-3 rounded-[22px] border-2 border-dashed border-paper-edge px-4 py-3.5">
              <Display italic className="text-lead">
                Nothing planned yet.
              </Display>
              <Text className="text-small text-ink-soft">Tap to plan something together.</Text>
            </Pressable>
          )}
        </View>
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

      <View className="gap-3 pt-1">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2.5">
            <View className="h-6 w-1 rounded-full bg-rose-500" />
            <Text className="font-sans-bold text-[20px]">Lately</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add something"
            onPress={() => setAdding(true)}
            className="h-14 w-14 items-center justify-center rounded-full bg-rose-600 active:scale-95"
            style={{ shadowColor: '#C41D55', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 6 }}
          >
            <Plus size={28} color="#fff" strokeWidth={2.6} />
          </Pressable>
        </View>
        {feed.length ? (
          feed.map((f) => (
            <View key={f.id} className="flex-row items-center gap-3 rounded-full border border-paper-edge bg-paper-raised py-2.5 pl-2.5 pr-4">
              <Initial slot={f.mine ? mySlot : partnerSlot} name={f.mine ? ctx.me.display_name : partner.display_name} />
              <Text numberOfLines={1} className="flex-1 text-small">
                {f.text}
              </Text>
              <Text className="text-micro text-ink-muted">{shortAgo(f.at)}</Text>
            </View>
          ))
        ) : (
          <View className="rounded-full border border-paper-edge bg-paper-raised px-5 py-3">
            <Text className="text-small text-ink-soft">What you both do in Plan shows up here.</Text>
          </View>
        )}
      </View>

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

/** One of the four illustrated cards: an icon tile, words, a picture in the corner. */
function HubCard({
  from,
  to,
  Icon,
  iconColor,
  iconWash = 'bg-paper-raised',
  art,
  artAt = 'corner',
  wide,
  onPress,
  children,
}: {
  from: string;
  to: string;
  Icon: typeof Plus;
  iconColor: string;
  iconWash?: string;
  art: ReactNode;
  artAt?: 'corner' | 'burst';
  wide?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        { borderRadius: 26, backgroundColor: to, shadowColor: '#3F2C66', shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      <GradientView from={from} to={to} radius={26} className="min-h-[206px] gap-1 p-4">
        <View pointerEvents="none" style={artAt === 'burst' ? { position: 'absolute', right: 16, top: 70 } : { position: 'absolute', right: -2, bottom: -4 }}>
          {art}
        </View>
        <View className={cn('mb-2 h-11 w-11 items-center justify-center rounded-[14px]', iconWash)}>
          <Icon size={22} color={iconColor} />
        </View>
        <View className={cn('gap-0.5', wide ? 'w-full' : 'w-[80%]')}>{children}</View>
      </GradientView>
    </Pressable>
  );
}

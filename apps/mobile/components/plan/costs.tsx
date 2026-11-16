import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addExpense,
  CURRENCIES,
  deleteExpense,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_ORDER,
  expensePosition,
  formatMoney,
  guessExpenseCategory,
  listExpenses,
  monthKey,
  monthSpend,
  parseAmount,
  pctForShare,
  settlementFor,
  settleUp,
  toDateKey,
  type CurrencyBalance,
  type Expense,
  type ExpenseCategory,
} from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { ArrowRight, Check, ChevronLeft, Delete } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { EmptyNote, ErrorNote } from '../module-screen';
import { Button } from '../ui/button';
import { cn } from '../ui/cn';
import { Field } from '../ui/field';
import { DateStepper, FormSheet } from '../ui/form-sheet';
import { usePalette } from '../ui/palette';
import { Segmented } from '../ui/segmented';
import { Display, Text } from '../ui/text';
import { AddPill, GroupLabel, Initial, Pick, SplitBar } from './bits';
import { CATEGORY_STYLE, SLOT_FILL, TONE, toneIcon } from './tones';

const LAST_CURRENCY = 'us:last-currency';
const METHODS = ['UPI', 'Cash', 'Bank transfer', 'Other'];

export function PlanCosts({ adding, onAdded }: { adding?: boolean; onAdded?: () => void }) {
  const ctx = useCouple();
  const { sb, couple, me, partner, mySlot, partnerSlot } = ctx;
  const c = usePalette();
  const expenses = useCoupleData('plan:costs', () => listExpenses(sb, couple.id), [sb, couple.id]);
  const list = expenses.data ?? [];
  const balances = settleUp(list, couple).filter((b) => b.debtor);
  const [sheet, setSheet] = useState<'add' | 'settle' | null>(null);
  const [filter, setFilter] = useState<ExpenseCategory | 'all'>('all');
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (adding) setSheet('add');
  }, [adding]);
  useEffect(() => {
    void AsyncStorage.getItem(LAST_CURRENCY).then(setSaved);
  }, []);

  const currency = balances[0]?.currency ?? list[0]?.currency ?? saved ?? 'INR';
  const main = balances.find((b) => b.currency === currency) ?? null;
  const month = monthSpend(list, monthKey(new Date()), currency, couple);
  const used = EXPENSE_CATEGORY_ORDER.filter((k) => list.some((e) => !e.is_settlement && (e.category ?? 'other') === k));
  const shown = list.filter((e) => filter === 'all' || (!e.is_settlement && (e.category ?? 'other') === filter));
  const groups = [...new Set(shown.map((e) => e.spent_on.slice(0, 7)))].map((m) => ({ m, rows: shown.filter((e) => e.spent_on.startsWith(m)) }));
  const close = () => {
    setSheet(null);
    if (adding) onAdded?.();
  };

  return (
    <View className="gap-5">
      <View className="items-center gap-3 rounded-sheet bg-rose-50 p-5">
        {main ? (
          <>
            <View className="flex-row items-center gap-2.5">
              <Initial slot={main.debtor === mySlot ? mySlot : partnerSlot} name={main.debtor === mySlot ? me.display_name : partner.display_name} size={44} />
              <ArrowRight size={28} color={c.onRose} />
              <Initial slot={main.debtor === mySlot ? partnerSlot : mySlot} name={main.debtor === mySlot ? partner.display_name : me.display_name} size={44} />
            </View>
            <View className="items-center">
              <Text className="text-small text-ink-soft">{main.debtor === mySlot ? `You owe ${partner.display_name}` : `${partner.display_name} owes you`}</Text>
              <Display className={cn('text-[44px] leading-[52px]', main.debtor === mySlot ? 'text-rose-700' : 'text-teal-700')}>{formatMoney(main.amount_cents, main.currency)}</Display>
            </View>
          </>
        ) : (
          <View className="items-center py-2">
            <Display italic className="text-[30px] leading-[38px]">
              {list.length ? 'You’re square.' : 'Nothing shared yet.'}
            </Display>
            <Text className="mt-1 text-center text-small text-ink-soft">
              {list.length ? 'Nothing open between you.' : 'Add what one of you paid for both, and Us keeps the running balance.'}
            </Text>
          </View>
        )}
        <View className="w-full flex-row gap-2">
          {main ? (
            <Button className="flex-1" onPress={() => setSheet('settle')}>
              Settle up
            </Button>
          ) : null}
          <Button variant="secondary" className="flex-1 bg-paper-raised" onPress={() => setSheet('add')}>
            Add expense
          </Button>
        </View>
        {balances
          .filter((b) => b !== main)
          .map((b) => (
            <Text key={b.currency} className="text-micro text-ink-soft">
              Also {b.debtor === mySlot ? `you owe ${formatMoney(b.amount_cents, b.currency)}` : `${partner.display_name} owes you ${formatMoney(b.amount_cents, b.currency)}`}
            </Text>
          ))}
      </View>

      {month.total ? (
        <View className="gap-3 rounded-sheet border border-paper-edge bg-paper-raised p-4">
          <GroupLabel>{`${new Date().toLocaleDateString(undefined, { month: 'long' })} so far`}</GroupLabel>
          <Display className="text-[30px] leading-[36px]">{formatMoney(month.total, currency)}</Display>
          <View accessible accessibilityLabel="Spending by category" className="h-3 flex-row gap-0.5 overflow-hidden rounded-full">
            {month.categories.map((x) => (
              <View key={x.category} style={{ flex: x.cents, backgroundColor: CATEGORY_STYLE[x.category].bar }} />
            ))}
          </View>
          <View className="flex-row flex-wrap justify-between gap-y-2">
            {month.categories.map((x) => (
              <View key={x.category} className="w-[48%] flex-row items-center gap-2">
                <View className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CATEGORY_STYLE[x.category].bar }} />
                <Text className="flex-1 text-small text-ink-soft">{EXPENSE_CATEGORIES[x.category].label}</Text>
                <Text className="font-sans-semibold text-small">{formatMoney(x.cents, currency)}</Text>
              </View>
            ))}
          </View>
          <View className="flex-row border-t border-paper-sunken pt-2.5">
            {[
              { name: 'You', slot: mySlot },
              { name: partner.display_name, slot: partnerSlot },
            ].map((p) => (
              <View key={p.slot} className="flex-1 flex-row items-center gap-2">
                <View className="h-2 w-2 rounded-full" style={{ backgroundColor: SLOT_FILL[p.slot] }} />
                <Text numberOfLines={1} className="text-small text-ink-soft">
                  {p.name} paid <Text className="font-sans-semibold text-small">{formatMoney(p.slot === 'a' ? month.aPaid : month.bPaid, currency)}</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {used.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5" contentContainerClassName="gap-2 px-5">
          {(['all', ...used] as const).map((k) => (
            <Pick key={k} selected={filter === k} onPress={() => setFilter(k)}>
              {k === 'all' ? 'All' : EXPENSE_CATEGORIES[k].label}
            </Pick>
          ))}
        </ScrollView>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {list.length === 0 ? (
        <EmptyNote title="No costs yet">Groceries, rent, a dinner out. Log it once and the split is done.</EmptyNote>
      ) : (
        groups.map((g) => (
          <View key={g.m} className="gap-1.5">
            <GroupLabel>{new Date(g.m + '-15T12:00:00').toLocaleDateString(undefined, { month: 'long', year: g.m.startsWith(String(new Date().getFullYear())) ? undefined : 'numeric' })}</GroupLabel>
            <View className="rounded-sheet border border-paper-edge bg-paper-raised px-3.5">
              {g.rows.map((x) => (
                expenseRow(x, () =>
                  Alert.alert(`Remove “${x.description}”?`, 'It comes off the balance for both of you.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => void expenses.mutate(() => deleteExpense(sb, x.id)).catch((e: Error) => setError(e.message)) },
                  ]),
                )
              ))}
            </View>
          </View>
        ))
      )}
      {list.length ? <Text className="text-center text-micro text-ink-muted">Press and hold a cost to remove it.</Text> : null}

      <FormSheet open={sheet === 'add'} title="Add expense" onClose={close}>
        {sheet === 'add' ? (
          <AddExpense
            defaultCurrency={saved ?? currency}
            onSave={async (row) => {
              await expenses.mutate(() => addExpense(sb, row));
              void AsyncStorage.setItem(LAST_CURRENCY, row.currency!);
              setSaved(row.currency!);
            }}
            onDone={close}
          />
        ) : null}
      </FormSheet>
      <FormSheet open={sheet === 'settle'} title="Settle up" onClose={close}>
        {sheet === 'settle' && main ? <SettleUp balance={main} onSave={(row) => expenses.mutate(() => addExpense(sb, row))} onDone={close} /> : null}
      </FormSheet>
    </View>
  );

  function expenseRow(x: Expense, onRemove: () => void) {
    const pos = expensePosition(x, me.id, mySlot);
    const payer = x.paid_by === me.id ? 'You' : partner.display_name;
    const cat = x.category ?? 'other';
    const { tone, Icon } = CATEGORY_STYLE[cat];
    const d = new Date(x.spent_on + 'T12:00:00');
    const share = x.is_settlement ? null : x.a_share_cents !== null ? 'exact split' : (mySlot === 'a' ? x.split_a_pct : 100 - x.split_a_pct) === 50 ? null : `your share ${mySlot === 'a' ? x.split_a_pct : 100 - x.split_a_pct}%`;
    const verb = { lent: 'you lent', borrowed: 'you borrowed', paidBack: 'you paid back', gotBack: 'paid you back', none: 'not shared' }[pos.kind];
    const tint = pos.kind === 'lent' ? 'text-teal-700' : pos.kind === 'borrowed' ? 'text-rose-700' : pos.kind === 'none' ? 'text-ink-muted' : 'text-sage-700';
    return (
      <Pressable key={x.id} accessibilityRole="button" accessibilityHint="Press and hold to remove" onLongPress={onRemove} className="flex-row items-center gap-3 border-b border-paper-sunken py-3">
        <View className="w-8 items-center">
          <Text className="font-sans-semibold text-[10px] uppercase text-ink-muted">{d.toLocaleDateString(undefined, { month: 'short' })}</Text>
          <Text className="font-sans-bold text-lead">{d.getDate()}</Text>
        </View>
        <View className={cn('h-10 w-10 items-center justify-center rounded-xl', x.is_settlement ? 'bg-sage-50' : TONE[tone].wash)}>
          {x.is_settlement ? <Check size={18} color={c.onSage} /> : <Icon size={18} color={toneIcon(c, tone)} />}
        </View>
        <View className="flex-1">
          <Text numberOfLines={1} className={cn('font-sans-medium', x.is_settlement && 'font-display-italic')}>
            {x.description}
          </Text>
          <Text numberOfLines={1} className="text-micro text-ink-muted">
            {payer} paid {formatMoney(x.amount_cents, x.currency)}
            {share ? ` · ${share}` : ''}
          </Text>
        </View>
        <View className="items-end">
          <Text className={cn('text-micro', tint)}>{verb}</Text>
          {pos.cents ? <Text className={cn('font-sans-bold', tint)}>{formatMoney(pos.cents, x.currency)}</Text> : null}
        </View>
      </Pressable>
    );
  }
}

type Mode = 'equal' | 'pct' | 'exact' | 'one';
type Row = Parameters<typeof addExpense>[1];

function AddExpense({ defaultCurrency, onSave, onDone }: { defaultCurrency: string; onSave: (row: Row) => Promise<void>; onDone: () => void }) {
  const { couple, me, partner, mySlot, partnerSlot } = useCouple();
  const c = usePalette();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [picked, setPicked] = useState(false);
  const [iPaid, setIPaid] = useState(true);
  const [mode, setMode] = useState<Mode>('equal');
  const [myPct, setMyPct] = useState(50);
  const [exact, setExact] = useState('');
  const [forMe, setForMe] = useState(false);
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = parseAmount(amount) ?? 0;
  const money = (n: number) => formatMoney(n, currency);
  const exactCents = Math.min(parseAmount(exact) ?? 0, cents);
  const mine = mode === 'equal' ? Math.round(cents / 2) : mode === 'pct' ? Math.round((cents * myPct) / 100) : mode === 'exact' ? exactCents : forMe ? cents : 0;
  const owedToMe = iPaid ? cents - mine : -mine;
  const result = owedToMe > 0 ? `${partner.display_name} owes you ${money(owedToMe)}` : owedToMe < 0 ? `You owe ${partner.display_name} ${money(-owedToMe)}` : 'Nobody owes anything';
  const cat = category ?? 'other';

  const press = (k: string) =>
    setAmount((a) => {
      if (k === 'del') return a.slice(0, -1);
      if (k === '.') return a.includes('.') ? a : (a || '0') + '.';
      if (a.includes('.') && a.split('.')[1]!.length >= 2) return a;
      if (a.replace('.', '').length >= 8) return a;
      return a === '0' ? k : a + k;
    });

  async function save() {
    setBusy(true);
    setError(null);
    const aCents = mySlot === 'a' ? mine : cents - mine;
    const exactSplit = mode === 'exact';
    try {
      await onSave({
        couple_id: couple.id,
        paid_by: iPaid ? me.id : partner.id,
        description: description.trim() || EXPENSE_CATEGORIES[cat].label,
        amount_cents: cents,
        currency,
        category: cat,
        split_a_pct: exactSplit ? pctForShare(aCents, cents) : mode === 'equal' ? 50 : Math.round((aCents / cents) * 100),
        a_share_cents: exactSplit ? aCents : null,
        spent_on: date,
      });
      setStep(3);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (step === 3)
    return (
      <View className="items-center gap-3 py-8">
        <Animated.View entering={ZoomIn.springify()} className="h-20 w-20 items-center justify-center rounded-full bg-sage-50">
          <Check size={40} color={c.onSage} strokeWidth={2.6} />
        </Animated.View>
        <Display className="text-heading">Added</Display>
        <Text className="text-center text-ink-soft">
          {description.trim() || EXPENSE_CATEGORIES[cat].label} · {money(cents)}. {result} for this one.
        </Text>
        <View className="mt-3 w-full flex-row gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onPress={() => {
              setAmount('');
              setDescription('');
              setCategory(null);
              setPicked(false);
              setExact('');
              setStep(1);
            }}
          >
            Add another
          </Button>
          <Button className="flex-1" onPress={onDone}>
            Done
          </Button>
        </View>
      </View>
    );

  if (step === 1)
    return (
      <>
        <View className="items-center py-2">
          <Text accessibilityLiveRegion="polite" className={cn('font-sans-bold text-[48px] leading-[58px]', cents ? 'text-ink' : 'text-ink-muted')}>
            {amount ? `${formatMoney(0, currency).replace(/[\d.,\s]/g, '')}${amount}` : money(0)}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5">
            {[...new Set([currency, ...CURRENCIES])].map((cur) => (
              <Pressable key={cur} accessibilityRole="button" accessibilityState={{ selected: cur === currency }} onPress={() => setCurrency(cur)} className={cn('h-8 justify-center rounded-full px-3', cur === currency ? 'bg-plum-100' : '')}>
                <Text className={cn('text-micro', cur === currency ? 'font-sans-semibold' : 'text-ink-soft')}>{cur}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <Field
          label="What for"
          value={description}
          onChangeText={(d) => {
            setDescription(d);
            if (!picked) setCategory(guessExpenseCategory(d));
          }}
          maxLength={200}
          placeholder="Uber to the airport"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5" contentContainerClassName="gap-2 px-5">
          {EXPENSE_CATEGORY_ORDER.map((k) => {
            const { tone, Icon } = CATEGORY_STYLE[k];
            return (
              <Pick
                key={k}
                selected={category === k}
                onPress={() => (setCategory(k), setPicked(true))}
                icon={<Icon size={15} color={category === k ? toneIcon(c, tone) : c.inkSoft} />}
              >
                {EXPENSE_CATEGORIES[k].label}
              </Pick>
            );
          })}
        </ScrollView>
        <View className="flex-row flex-wrap justify-between gap-y-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityLabel={k === 'del' ? 'Delete' : k}
              onPress={() => press(k)}
              className="h-14 w-[32%] items-center justify-center rounded-2xl bg-paper-sunken active:bg-plum-100"
            >
              {k === 'del' ? <Delete size={22} color={c.ink} /> : <Text className="text-[24px] leading-[30px]">{k}</Text>}
            </Pressable>
          ))}
        </View>
        <Button size="lg" disabled={!cents} onPress={() => setStep(2)}>
          Next: who paid & split
        </Button>
      </>
    );

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to amount" onPress={() => setStep(1)} className="flex-row items-center gap-3 rounded-sheet border border-paper-edge bg-paper-raised p-3">
        <ChevronLeft size={18} color={c.inkSoft} />
        <View className={cn('h-10 w-10 items-center justify-center rounded-xl', TONE[CATEGORY_STYLE[cat].tone].wash)}>
          {(() => {
            const I = CATEGORY_STYLE[cat].Icon;
            return <I size={18} color={toneIcon(c, CATEGORY_STYLE[cat].tone)} />;
          })()}
        </View>
        <View className="flex-1">
          <Text numberOfLines={1} className="font-sans-semibold">
            {description.trim() || EXPENSE_CATEGORIES[cat].label}
          </Text>
          <Text className="text-micro text-ink-muted">{EXPENSE_CATEGORIES[cat].label}</Text>
        </View>
        <Display className="text-heading">{money(cents)}</Display>
      </Pressable>

      <View className="gap-1.5">
        <Text className="font-sans-medium text-small">Who paid?</Text>
        <View className="flex-row gap-2.5">
          {[
            { v: true, name: me.display_name, label: 'Me', slot: mySlot },
            { v: false, name: partner.display_name, label: partner.display_name, slot: partnerSlot },
          ].map((o) => (
            <Pressable
              key={String(o.v)}
              accessibilityRole="radio"
              accessibilityState={{ checked: iPaid === o.v }}
              onPress={() => setIPaid(o.v)}
              className={cn('h-16 flex-1 flex-row items-center gap-2.5 rounded-sheet border-2 px-3', iPaid === o.v ? 'border-plum-400 bg-plum-50' : 'border-paper-edge bg-paper-raised')}
            >
              <Initial slot={o.slot} name={o.name} size={32} />
              <Text numberOfLines={1} className="flex-1 font-sans-semibold">
                {o.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="gap-2">
        <Text className="font-sans-medium text-small">How to split</Text>
        <Segmented
          label="How to split"
          options={[
            { value: 'equal', label: 'Equally' },
            { value: 'pct', label: 'By %' },
            { value: 'exact', label: 'Exact' },
            { value: 'one', label: 'All one' },
          ]}
          value={mode}
          onChange={setMode}
        />
        {mode === 'equal' || mode === 'exact' ? (
          <View className="flex-row gap-2">
            <View className="flex-1 rounded-2xl bg-rose-50 p-3">
              <Text className="text-micro text-ink-soft">Your share</Text>
              {mode === 'exact' ? (
                <TextInput
                  accessibilityLabel="Your share"
                  keyboardType="decimal-pad"
                  value={exact}
                  onChangeText={setExact}
                  placeholder="0"
                  placeholderTextColor={c.placeholder}
                  className="mt-1 h-10 rounded-xl bg-paper-raised px-3 font-sans-bold text-lead text-ink"
                />
              ) : (
                <Display className="text-lead">{money(mine)}</Display>
              )}
            </View>
            <View className="flex-1 rounded-2xl bg-teal-50 p-3">
              <Text className="text-micro text-ink-soft">{partner.display_name}’s share</Text>
              <Display className="text-lead">{money(cents - mine)}</Display>
            </View>
          </View>
        ) : mode === 'pct' ? (
          <View className="gap-2 rounded-2xl border border-paper-edge bg-paper-raised p-3">
            <View className="flex-row justify-between">
              <Text className="text-small">
                <Text className="font-sans-bold text-small text-rose-700">You {myPct}%</Text> · {money(mine)}
              </Text>
              <Text className="text-small">
                <Text className="font-sans-bold text-small text-teal-700">
                  {partner.display_name} {100 - myPct}%
                </Text>{' '}
                · {money(cents - mine)}
              </Text>
            </View>
            <SplitBar left={myPct / 100} leftColor={SLOT_FILL[mySlot]} rightColor={SLOT_FILL[partnerSlot]} height={10} />
            <View className="flex-row flex-wrap gap-1.5">
              {[25, 33, 40, 60, 67, 75].map((p) => (
                <Pick key={p} selected={myPct === p} onPress={() => setMyPct(p)} className="min-h-[34px] px-3">
                  {`${p}%`}
                </Pick>
              ))}
            </View>
          </View>
        ) : (
          <View className="flex-row gap-2">
            <Pick className="flex-1" selected={!forMe} onPress={() => setForMe(false)}>
              {`All for ${partner.display_name}`}
            </Pick>
            <Pick className="flex-1" selected={forMe} onPress={() => setForMe(true)}>
              All for me
            </Pick>
          </View>
        )}
      </View>

      <View className={cn('flex-row items-center gap-3 rounded-sheet px-4 py-3.5', owedToMe > 0 ? 'bg-teal-50' : owedToMe < 0 ? 'bg-rose-50' : 'bg-paper-sunken')}>
        <ArrowRight size={20} color={owedToMe > 0 ? c.onTeal : owedToMe < 0 ? c.onRose : c.inkSoft} />
        <Text className={cn('font-sans-semibold', owedToMe > 0 ? 'text-teal-700' : owedToMe < 0 ? 'text-rose-700' : 'text-ink-soft')}>{result}</Text>
      </View>
      <DateStepper label="When" value={date} onChange={setDate} />
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button size="lg" loading={busy} disabled={!cents || (mode === 'exact' && !exact.trim())} onPress={() => void save()}>
        {`Add ${money(cents)}`}
      </Button>
    </>
  );
}

function SettleUp({ balance, onSave, onDone }: { balance: CurrencyBalance; onSave: (row: Row) => Promise<unknown>; onDone: () => void }) {
  const { couple, me, partner, mySlot, partnerSlot } = useCouple();
  const c = usePalette();
  const iOwe = balance.debtor === mySlot;
  const [part, setPart] = useState(false);
  const [partAmt, setPartAmt] = useState('');
  const [method, setMethod] = useState('UPI');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cents = part ? Math.min(parseAmount(partAmt) ?? 0, balance.amount_cents) : balance.amount_cents;
  const money = (n: number) => formatMoney(n, balance.currency);

  if (done !== null)
    return (
      <View className="items-center gap-3 py-10">
        <Animated.View entering={ZoomIn.springify()} className="h-24 w-24 items-center justify-center rounded-full bg-sage-50">
          <Check size={48} color={c.onSage} strokeWidth={2.6} />
        </Animated.View>
        <Display italic className="text-[32px] leading-[40px]">
          {done >= balance.amount_cents ? 'You’re square.' : 'Recorded.'}
        </Display>
        <Text className="max-w-[280px] text-center text-ink-soft">
          {done >= balance.amount_cents ? 'Nothing open between you.' : `${money(balance.amount_cents - done)} is still open. No rush.`}
        </Text>
        <Button className="mt-3 self-stretch" onPress={onDone}>
          Done
        </Button>
      </View>
    );

  return (
    <>
      <View className="items-center gap-3 pt-2">
        <View className="flex-row items-center gap-3">
          <Initial slot={iOwe ? mySlot : partnerSlot} name={iOwe ? me.display_name : partner.display_name} size={56} />
          <ArrowRight size={30} color={c.onRose} />
          <Initial slot={iOwe ? partnerSlot : mySlot} name={iOwe ? partner.display_name : me.display_name} size={56} />
        </View>
        <Text className="text-ink-soft">{iOwe ? `You’re paying ${partner.display_name}` : `${partner.display_name} paid you`}</Text>
        <Display className="text-[44px] leading-[52px]">{money(cents)}</Display>
      </View>
      <Segmented
        label="How much"
        options={[
          { value: 'all', label: `All ${money(balance.amount_cents)}` },
          { value: 'part', label: 'Part of it' },
        ]}
        value={part ? 'part' : 'all'}
        onChange={(v) => setPart(v === 'part')}
      />
      {part ? (
        <Field
          label={iOwe ? 'Amount you’re paying now' : 'Amount they paid'}
          keyboardType="decimal-pad"
          value={partAmt}
          onChangeText={setPartAmt}
          placeholder="0"
          hint={cents ? `${money(balance.amount_cents - cents)} will still be open.` : undefined}
        />
      ) : null}
      <View className="gap-1.5">
        <Text className="font-sans-medium text-small">Paid with</Text>
        <View className="flex-row flex-wrap gap-2">
          {METHODS.map((m) => (
            <Pick key={m} selected={method === m} onPress={() => setMethod(m)}>
              {m}
            </Pick>
          ))}
        </View>
      </View>
      <Text className="text-center text-micro text-ink-muted">Us doesn’t move money. This just records it for both of you.</Text>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button
        size="lg"
        loading={busy}
        disabled={!cents}
        onPress={() => {
          const row = settlementFor(balance, couple, cents);
          if (!row) return;
          setBusy(true);
          setError(null);
          onSave({ ...row, description: `${row.description} · ${method}` })
            .then(() => setDone(cents))
            .catch((e: Error) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        {`Record ${money(cents)} paid`}
      </Button>
    </>
  );
}

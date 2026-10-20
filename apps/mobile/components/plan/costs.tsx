import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addExpense,
  CURRENCIES,
  deleteExpense,
  formatMoney,
  listExpenses,
  parseAmount,
  personFor,
  settlementFor,
  settleUp,
  toDateKey,
} from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { EmptyNote, ErrorNote, SectionTitle } from '../module-screen';
import { Button, IconButton } from '../ui/button';
import { cn } from '../ui/cn';
import { Field } from '../ui/field';
import { DateStepper } from '../ui/form-sheet';
import { usePalette } from '../ui/palette';
import { Chip, Segmented } from '../ui/segmented';
import { Sheet } from '../ui/sheet';
import { Display, Text } from '../ui/text';

type Split = 'even' | 'mine' | 'theirs' | 'custom';
const LAST_CURRENCY = 'us:last-currency';
const CUSTOM_STEPS = ['25', '33', '40', '60', '67', '75'];

export function PlanCosts() {
  const ctx = useCouple();
  const { sb, couple, me, partner, mySlot } = ctx;
  const c = usePalette();
  const expenses = useCoupleData('plan:costs', () => listExpenses(sb, couple.id), [sb, couple.id]);
  const list = expenses.data ?? [];
  const balances = settleUp(list, couple);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<string>('USD');
  const [paidBy, setPaidBy] = useState<'me' | 'partner'>('me');
  const [split, setSplit] = useState<Split>('even');
  const [myPct, setMyPct] = useState('60');
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [error, setError] = useState<string | null>(null);
  const fail = (e: Error) => setError(e.message);

  useEffect(() => {
    void AsyncStorage.getItem(LAST_CURRENCY).then((saved) => {
      if (saved) setCurrency(saved);
      else if (list[0]) setCurrency(list[0].currency);
    });
  }, [list.length > 0]);

  const cents = parseAmount(amount);
  const mySharePct = split === 'even' ? 50 : split === 'mine' ? 100 : split === 'theirs' ? 0 : Number(myPct);

  return (
    <View className="gap-6">
      {balances.length === 0 ? (
        <Sheet>
          <Display italic className="text-lead">
            Nothing shared yet.
          </Display>
          <Text className="mt-1 text-small text-ink-soft">Add what one of you paid for both, and Us keeps the running balance.</Text>
        </Sheet>
      ) : (
        balances.map((b) => {
          const iOwe = b.debtor === mySlot;
          const row = settlementFor(b, couple);
          return (
            <Sheet key={b.currency} className="gap-3">
              <Text className="text-micro font-sans-medium uppercase text-ink-muted">{b.currency}</Text>
              {b.debtor ? (
                <Display className="text-heading">
                  {iOwe ? `You owe ${partner.display_name} ` : `${partner.display_name} owes you `}
                  <Display className={cn('text-heading', iOwe ? 'text-rose-700' : 'text-sage-700')}>{formatMoney(b.amount_cents, b.currency)}</Display>
                </Display>
              ) : (
                <Display italic className="text-heading">
                  You’re square.
                </Display>
              )}
              {row ? (
                <Button variant="secondary" size="sm" className="self-start" onPress={() => void expenses.mutate(() => addExpense(sb, row)).catch(fail)}>
                  Mark as settled
                </Button>
              ) : null}
            </Sheet>
          );
        })
      )}

      <Sheet tone="inset" className="gap-4">
        <SectionTitle>Add a cost</SectionTitle>
        <Field label="What for" value={description} onChangeText={setDescription} maxLength={200} placeholder="Groceries" />
        <Field
          label="Amount"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          error={amount && !cents ? 'Enter an amount like 12.50' : null}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5">
          {[...new Set([currency, ...CURRENCIES])].map((cur) => (
            <Chip key={cur} selected={cur === currency} onPress={() => setCurrency(cur)}>
              {cur}
            </Chip>
          ))}
        </ScrollView>
        <View className="gap-1.5">
          <Text className="font-sans-medium text-small">Who paid</Text>
          <Segmented
            label="Who paid"
            options={[
              { value: 'me', label: 'Me' },
              { value: 'partner', label: partner.display_name },
            ]}
            value={paidBy}
            onChange={setPaidBy}
          />
        </View>
        <View className="gap-1.5">
          <Text className="font-sans-medium text-small">Split</Text>
          <Segmented
            size="sm"
            label="Split"
            options={[
              { value: 'even', label: '50/50' },
              { value: 'mine', label: 'All mine' },
              { value: 'theirs', label: 'All theirs' },
              { value: 'custom', label: 'Custom' },
            ]}
            value={split}
            onChange={setSplit}
          />
          {split === 'custom' ? (
            <>
              <Segmented size="sm" label="Your share" options={CUSTOM_STEPS.map((s) => ({ value: s, label: `${s}%` }))} value={myPct} onChange={setMyPct} />
              <Text className="text-small text-ink-soft">
                You {myPct}% · {partner.display_name} {100 - Number(myPct)}%
              </Text>
            </>
          ) : null}
        </View>
        <DateStepper label="When" value={date} onChange={setDate} />
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button
          disabled={!cents || !description.trim()}
          onPress={() =>
            void expenses
              .mutate(() =>
                addExpense(sb, {
                  couple_id: couple.id,
                  paid_by: paidBy === 'me' ? me.id : partner.id,
                  description: description.trim(),
                  amount_cents: cents!,
                  currency,
                  split_a_pct: mySlot === 'a' ? mySharePct : 100 - mySharePct,
                  spent_on: date,
                }),
              )
              .then(() => {
                void AsyncStorage.setItem(LAST_CURRENCY, currency);
                setDescription('');
                setAmount('');
              })
              .catch(fail)
          }
        >
          Add
        </Button>
      </Sheet>

      <View className="gap-3">
        <SectionTitle>History</SectionTitle>
        {list.length === 0 ? (
          <EmptyNote title="No costs yet" />
        ) : (
          <Sheet pad="none">
            {list.map((x, i) => {
              const p = personFor(ctx, x.paid_by);
              const mine = mySlot === 'a' ? x.split_a_pct : 100 - x.split_a_pct;
              return (
                <View key={x.id} className={cn('flex-row items-center gap-3 px-4 py-3', i > 0 && 'border-t border-paper-edge')}>
                  <View className="flex-1">
                    <Text className={x.is_settlement ? 'italic text-ink-soft' : undefined}>{x.description}</Text>
                    <Text className="text-micro text-ink-muted">
                      {x.is_settlement ? `${p.mine ? 'You' : p.name} paid back` : `${p.mine ? 'You' : p.name} paid · ${mine === 50 ? 'split evenly' : `your share ${mine}%`}`}
                    </Text>
                  </View>
                  <Text>{formatMoney(x.amount_cents, x.currency)}</Text>
                  <IconButton label={`Remove ${x.description}`} size="sm" onPress={() => void expenses.mutate(() => deleteExpense(sb, x.id)).catch(fail)}>
                    <X size={16} color={c.inkSoft} />
                  </IconButton>
                </View>
              );
            })}
          </Sheet>
        )}
      </View>
    </View>
  );
}

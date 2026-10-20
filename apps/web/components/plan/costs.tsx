'use client';

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
import { Handshake, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { EmptyNote, ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { Field, SelectField } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';

type Split = 'even' | 'mine' | 'theirs' | 'custom';
const LAST_CURRENCY = 'us:last-currency';

export function PlanCosts() {
  const ctx = useCouple();
  const { sb, couple, me, partner, mySlot } = ctx;
  const expenses = useCoupleData('plan:costs', () => listExpenses(sb, couple.id), [sb, couple.id]);
  const list = expenses.data ?? [];
  const balances = settleUp(list, couple);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<string>('USD');
  const [paidBy, setPaidBy] = useState<'me' | 'partner'>('me');
  const [split, setSplit] = useState<Split>('even');
  const [myPct, setMyPct] = useState(50);
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [error, setError] = useState<string | null>(null);

  // Default to the currency used last (this device), else the most recent expense's.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LAST_CURRENCY);
    } catch {}
    if (saved) setCurrency(saved);
    else if (list[0]) setCurrency(list[0].currency);
  }, [list.length > 0]);

  const cents = parseAmount(amount);
  const mySharePct = split === 'even' ? 50 : split === 'mine' ? 100 : split === 'theirs' ? 0 : myPct;

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!cents || !description.trim()) return;
    setError(null);
    try {
      await expenses.mutate(() =>
        addExpense(sb, {
          couple_id: couple.id,
          paid_by: paidBy === 'me' ? me.id : partner.id,
          description: description.trim(),
          amount_cents: cents,
          currency,
          split_a_pct: mySlot === 'a' ? mySharePct : 100 - mySharePct,
          spent_on: date,
        }),
      );
      try {
        localStorage.setItem(LAST_CURRENCY, currency);
      } catch {}
      setDescription('');
      setAmount('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-8">
        <section aria-label="Balance" className="space-y-3">
          {balances.length === 0 ? (
            <Sheet pad="md">
              <p className="font-display text-lead italic text-ink">Nothing shared yet.</p>
              <p className="mt-1 text-small text-ink-soft">Add what one of you paid for both, and Us keeps the running balance.</p>
            </Sheet>
          ) : (
            balances.map((b) => {
              const iOwe = b.debtor === mySlot;
              const row = settlementFor(b, couple);
              return (
                <Sheet key={b.currency} pad="md" className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-micro font-medium uppercase tracking-wide text-ink-muted">{b.currency}</p>
                    {b.debtor ? (
                      <p className="mt-1 font-display text-heading text-ink">
                        {iOwe ? `You owe ${partner.display_name}` : `${partner.display_name} owes you`}{' '}
                        <span className={iOwe ? 'text-rose-700' : 'text-sage-700'}>{formatMoney(b.amount_cents, b.currency)}</span>
                      </p>
                    ) : (
                      <p className="mt-1 font-display text-heading italic text-ink">You’re square.</p>
                    )}
                  </div>
                  {row && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void expenses.mutate(() => addExpense(sb, row)).catch((x) => setError(x.message))}
                    >
                      <Handshake className="h-4 w-4" /> Mark as settled
                    </Button>
                  )}
                </Sheet>
              );
            })
          )}
        </section>

        <section aria-labelledby="cost-history" className="space-y-3">
          <h3 id="cost-history" className="font-display text-lead text-ink">
            History
          </h3>
          {list.length === 0 ? (
            <EmptyNote title="No costs yet" />
          ) : (
            <ul className="divide-y divide-paper-edge rounded-sheet border border-paper-edge bg-paper-raised">
              {list.map((x) => {
                const p = personFor(ctx, x.paid_by);
                const mine = mySlot === 'a' ? x.split_a_pct : 100 - x.split_a_pct;
                return (
                  <li key={x.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate', x.is_settlement ? 'italic text-ink-soft' : 'text-ink')}>{x.description}</p>
                      <p className="text-micro text-ink-muted">
                        {x.is_settlement
                          ? `${p.mine ? 'You' : p.name} paid back`
                          : `${p.mine ? 'You' : p.name} paid · ${mine === 50 ? 'split evenly' : `your share ${mine}%`}`}{' '}
                        · {new Date(x.spent_on + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <span className="tabular-nums text-ink">{formatMoney(x.amount_cents, x.currency)}</span>
                    <IconButton label={`Remove ${x.description}`} size="sm" onClick={() => void expenses.mutate(() => deleteExpense(sb, x.id)).catch((e) => setError(e.message))}>
                      <X className="h-4 w-4" />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="add-cost">
        <Sheet tone="inset" pad="md">
          <h3 id="add-cost" className="font-display text-lead text-ink">
            Add a cost
          </h3>
          <form onSubmit={add} className="mt-4 space-y-4">
            <Field label="What for" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Groceries" />
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field
                label="Amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                error={amount && !cents ? 'Enter an amount like 12.50' : null}
              />
              <SelectField label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-24">
                {[...new Set([currency, ...CURRENCIES])].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="space-y-1.5">
              <p className="text-small font-medium text-ink">Who paid</p>
              <Segmented
                label="Who paid"
                className="w-full"
                options={[
                  { value: 'me', label: 'Me' },
                  { value: 'partner', label: partner.display_name },
                ]}
                value={paidBy}
                onChange={setPaidBy}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-small font-medium text-ink">Split</p>
              <Segmented
                label="Split"
                size="sm"
                className="w-full"
                options={[
                  { value: 'even', label: '50/50' },
                  { value: 'mine', label: 'All mine' },
                  { value: 'theirs', label: 'All theirs' },
                  { value: 'custom', label: 'Custom' },
                ]}
                value={split}
                onChange={setSplit}
              />
              {split === 'custom' && (
                <div className="pt-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={myPct}
                    onChange={(e) => setMyPct(Number(e.target.value))}
                    aria-label="Your share"
                    aria-valuetext={`Your share ${myPct}%`}
                    className="w-full accent-rose-600"
                  />
                  <p className="text-small text-ink-soft">
                    You {myPct}% · {partner.display_name} {100 - myPct}%
                  </p>
                </div>
              )}
            </div>
            <Field label="When" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" block disabled={!cents || !description.trim()}>
              Add
            </Button>
          </form>
        </Sheet>
      </section>
    </div>
  );
}

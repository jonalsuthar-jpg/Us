'use client';

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
  type ExpenseCategory,
  receiptUrls,
  removeReceipt,
  updateExpense,
  uploadReceipt,
  type Expense,
} from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { ArrowRight, Check, ChevronLeft, ReceiptText, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { EmptyNote, ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/cn';
import { shrinkPhoto } from '@/lib/image';
import { GroupLabel, Initial, Pick, SplitBar } from './bits';
import { CATEGORY_STYLE, SLOT_FILL, TONE } from './tones';

const LAST_CURRENCY = 'us:last-currency';
const METHODS = ['UPI', 'Cash', 'Bank transfer', 'Other'];
type Row = Parameters<typeof addExpense>[1];

/** Splitwise for two: who owes whom, where the month went, and every cost in between. */
export function PlanCosts({ adding, onAdded }: { adding?: boolean; onAdded?: () => void }) {
  const ctx = useCouple();
  const { sb, couple, me, partner, mySlot, partnerSlot } = ctx;
  const expenses = useCoupleData('plan:costs', () => listExpenses(sb, couple.id), [sb, couple.id, true]);
  const list = expenses.data ?? [];
  const balances = settleUp(list, couple).filter((b) => b.debtor);
  const [sheet, setSheet] = useState<'add' | 'settle' | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  // The balance Settle up opened with: once it's recorded the live balance clears, and the dialog still has to say so.
  const [settling, setSettling] = useState<CurrencyBalance | null>(null);
  const [filter, setFilter] = useState<ExpenseCategory | 'all'>('all');
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (adding) setSheet('add');
  }, [adding]);
  useEffect(() => {
    try {
      setSaved(localStorage.getItem(LAST_CURRENCY));
    } catch {}
  }, []);

  const currency = balances[0]?.currency ?? list[0]?.currency ?? saved ?? 'INR';
  const main = balances.find((b) => b.currency === currency) ?? null;
  const iOwe = main?.debtor === mySlot;
  const month = monthSpend(list, monthKey(new Date()), currency, couple);
  const used = EXPENSE_CATEGORY_ORDER.filter((k) => list.some((e) => !e.is_settlement && (e.category ?? 'other') === k));
  const shown = list.filter((e) => filter === 'all' || (!e.is_settlement && (e.category ?? 'other') === filter));
  const groups = [...new Set(shown.map((e) => e.spent_on.slice(0, 7)))].map((m) => ({ m, rows: shown.filter((e) => e.spent_on.startsWith(m)) }));
  const close = () => {
    setSheet(null);
    setEditing(null);
    if (adding) onAdded?.();
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <section aria-label="Balance" className="flex flex-col items-center justify-center gap-3 rounded-sheet bg-rose-50 p-6 text-center">
          {main ? (
            <>
              <div className="flex items-center gap-2.5">
                <Initial slot={iOwe ? mySlot : partnerSlot} name={iOwe ? me.display_name : partner.display_name} size={44} />
                <ArrowRight className="h-7 w-7 text-rose-700" />
                <Initial slot={iOwe ? partnerSlot : mySlot} name={iOwe ? partner.display_name : me.display_name} size={44} />
              </div>
              <div>
                <p className="text-small text-ink-soft">{iOwe ? `You owe ${partner.display_name}` : `${partner.display_name} owes you`}</p>
                <p className={cn('font-display text-[44px] leading-tight', iOwe ? 'text-rose-700' : 'text-teal-700')}>{formatMoney(main.amount_cents, main.currency)}</p>
              </div>
            </>
          ) : (
            <div className="py-2">
              <p className="font-serif text-[32px] italic leading-tight text-ink">{list.length ? 'You’re square.' : 'Nothing shared yet.'}</p>
              <p className="mt-1 text-small text-ink-soft">{list.length ? 'Nothing open between you.' : 'Add what one of you paid for both, and Us keeps the running balance.'}</p>
            </div>
          )}
          <div className="flex w-full gap-2">
            {main ? (
              <Button
                className="flex-1"
                onClick={() => {
                  setSettling(main);
                  setSheet('settle');
                }}
              >
                Settle up
              </Button>
            ) : null}
            <Button variant="secondary" className="flex-1 bg-paper-raised" onClick={() => setSheet('add')}>
              Add expense
            </Button>
          </div>
          {balances
            .filter((b) => b !== main)
            .map((b) => (
              <p key={b.currency} className="text-micro text-ink-soft">
                Also {b.debtor === mySlot ? `you owe ${formatMoney(b.amount_cents, b.currency)}` : `${partner.display_name} owes you ${formatMoney(b.amount_cents, b.currency)}`}
              </p>
            ))}
        </section>

        {month.total ? (
          <section className="space-y-3 rounded-sheet border border-paper-edge bg-paper-raised p-5">
            <GroupLabel>{`${new Date().toLocaleDateString(undefined, { month: 'long' })} so far`}</GroupLabel>
            <p className="font-display text-[30px] leading-tight text-ink">{formatMoney(month.total, currency)}</p>
            <div role="img" aria-label="Spending by category" className="flex h-3 gap-0.5 overflow-hidden rounded-full">
              {month.categories.map((x) => (
                <span key={x.category} style={{ flexGrow: x.cents, backgroundColor: CATEGORY_STYLE[x.category].bar }} />
              ))}
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
              {month.categories.map((x) => (
                <li key={x.category} className="flex items-center gap-2 text-small">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CATEGORY_STYLE[x.category].bar }} />
                  <span className="flex-1 text-ink-soft">{EXPENSE_CATEGORIES[x.category].label}</span>
                  <span className="font-semibold tabular-nums text-ink">{formatMoney(x.cents, currency)}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-3 border-t border-paper-sunken pt-2.5 text-small">
              {[
                { name: 'You', slot: mySlot },
                { name: partner.display_name, slot: partnerSlot },
              ].map((p) => (
                <p key={p.slot} className="flex flex-1 items-center gap-2 truncate text-ink-soft">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SLOT_FILL[p.slot] }} />
                  {p.name} paid <b className="font-semibold tabular-nums text-ink">{formatMoney(p.slot === 'a' ? month.aPaid : month.bPaid, currency)}</b>
                </p>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {used.length > 1 ? (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0">
          {(['all', ...used] as const).map((k) => (
            <Pick key={k} selected={filter === k} onClick={() => setFilter(k)} className="shrink-0">
              {k === 'all' ? 'All' : EXPENSE_CATEGORIES[k].label}
            </Pick>
          ))}
        </div>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {list.length === 0 ? (
        <EmptyNote title="No costs yet">Groceries, rent, a dinner out. Log it once and the split is done.</EmptyNote>
      ) : (
        groups.map((g) => (
          <section key={g.m} className="space-y-2">
            <GroupLabel>{new Date(g.m + '-15T12:00:00').toLocaleDateString(undefined, { month: 'long', year: g.m.startsWith(String(new Date().getFullYear())) ? undefined : 'numeric' })}</GroupLabel>
            <ul className="rounded-sheet border border-paper-edge bg-paper-raised px-4">
              {g.rows.map((x) => {
                const pos = expensePosition(x, me.id, mySlot);
                const payer = x.paid_by === me.id ? 'You' : partner.display_name;
                const { tone, Icon } = CATEGORY_STYLE[x.category ?? 'other'];
                const d = new Date(x.spent_on + 'T12:00:00');
                const myPct = mySlot === 'a' ? x.split_a_pct : 100 - x.split_a_pct;
                const share = x.is_settlement ? null : x.a_share_cents !== null ? 'exact split' : myPct === 50 ? null : `your share ${myPct}%`;
                const verb = { lent: 'you lent', borrowed: 'you borrowed', paidBack: 'you paid back', gotBack: 'paid you back', none: 'not shared' }[pos.kind];
                const tint = pos.kind === 'lent' ? 'text-teal-700' : pos.kind === 'borrowed' ? 'text-rose-700' : pos.kind === 'none' ? 'text-ink-muted' : 'text-sage-700';
                return (
                  <li
                    key={x.id}
                    // Tap an expense to change it (settle-ups stay as they were).
                    onClick={(e) => !x.is_settlement && !(e.target as HTMLElement).closest('button') && setEditing(x)}
                    className={cn('group flex items-center gap-3 border-b border-paper-sunken py-3 last:border-b-0', !x.is_settlement && 'cursor-pointer hover:bg-paper-sunken/40')}
                  >
                    <span className="w-8 text-center">
                      <span className="block text-[10px] font-semibold uppercase text-ink-muted">{d.toLocaleDateString(undefined, { month: 'short' })}</span>
                      <span className="block text-lead font-bold text-ink">{d.getDate()}</span>
                    </span>
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', x.is_settlement ? 'bg-sage-50 text-sage-700' : cn(TONE[tone].wash, TONE[tone].ink))}>
                      {x.is_settlement ? <Check className="h-[18px] w-[18px]" /> : <Icon className="h-[18px] w-[18px]" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate font-medium text-ink', x.is_settlement && 'font-serif italic')}>{x.description}</span>
                      <span className="block truncate text-micro text-ink-muted">
                        {payer} paid {formatMoney(x.amount_cents, x.currency)}
                        {share ? ` · ${share}` : ''}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className={cn('block text-micro', tint)}>{verb}</span>
                      {pos.cents ? <span className={cn('block font-bold tabular-nums', tint)}>{formatMoney(pos.cents, x.currency)}</span> : null}
                    </span>
                    {x.receipt_path ? (
                      <IconButton
                        label={`Receipt for ${x.description}`}
                        size="sm"
                        onClick={() =>
                          void receiptUrls(sb, [x.receipt_path!])
                            .then((u) => u[x.receipt_path!] && window.open(u[x.receipt_path!], '_blank', 'noopener'))
                            .catch((e: Error) => setError(e.message))
                        }
                      >
                        <ReceiptText className="h-4 w-4" />
                      </IconButton>
                    ) : null}
                    <IconButton
                      label={`Remove ${x.description}`}
                      size="sm"
                      className="opacity-60 group-hover:opacity-100"
                      onClick={() =>
                        window.confirm(`Remove “${x.description}”? It comes off the balance for both of you.`) &&
                        void expenses.mutate(() => deleteExpense(sb, x.id, x.receipt_path)).catch((e: Error) => setError(e.message))
                      }
                    >
                      <X className="h-4 w-4" />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <Dialog open={sheet === 'add' || !!editing} onOpenChange={(o) => !o && close()} title={editing ? 'Edit expense' : 'Add expense'} className="max-h-[92dvh] overflow-y-auto">
        {sheet === 'add' || editing ? (
          <AddExpense
            key={editing?.id ?? 'new'}
            initial={editing}
            defaultCurrency={saved ?? currency}
            onSave={async (row, receipt) => {
              // A new receipt goes up first; one that's replaced or taken off goes once the row is saved.
              const path = receipt instanceof File ? await uploadReceipt(sb, couple.id, ...(await shrinkReceipt(receipt))) : receipt === 'remove' ? null : (editing?.receipt_path ?? null);
              const withReceipt = { ...row, receipt_path: path };
              if (editing) {
                await expenses.mutate(() => updateExpense(sb, editing.id, withReceipt));
                if (editing.receipt_path && editing.receipt_path !== path) await removeReceipt(sb, editing.receipt_path).catch(() => {});
                return;
              }
              await expenses.mutate(() => addExpense(sb, withReceipt));
              try {
                localStorage.setItem(LAST_CURRENCY, row.currency!);
              } catch {}
              setSaved(row.currency!);
            }}
            onDone={close}
          />
        ) : null}
      </Dialog>
      <Dialog open={sheet === 'settle'} onOpenChange={(o) => !o && close()} title="Settle up" className="max-h-[92dvh] overflow-y-auto">
        {sheet === 'settle' && settling ? <SettleUp balance={settling} onSave={(row) => expenses.mutate(() => addExpense(sb, row))} onDone={close} /> : null}
      </Dialog>
    </div>
  );
}

type Mode = 'equal' | 'pct' | 'exact' | 'one';

/** A new receipt photo, taking the old one off, or leaving it as it is. */
type ReceiptChange = File | 'remove' | undefined;

async function shrinkReceipt(file: File): Promise<[Blob, string]> {
  const { blob, type } = await shrinkPhoto(file);
  return [blob, type];
}

/** How an expense was split, for editing it in the same form it was added with. */
function splitOf(x: Expense, mySlot: 'a' | 'b'): { mode: Mode; myPct: number; exact: string; forMe: boolean } {
  const myPct = mySlot === 'a' ? x.split_a_pct : 100 - x.split_a_pct;
  if (x.a_share_cents !== null) {
    const mine = mySlot === 'a' ? x.a_share_cents : x.amount_cents - x.a_share_cents;
    return { mode: 'exact', myPct, exact: (mine / 100).toFixed(2), forMe: false };
  }
  if (myPct === 50) return { mode: 'equal', myPct, exact: '', forMe: false };
  if (myPct === 0 || myPct === 100) return { mode: 'one', myPct, exact: '', forMe: myPct === 100 };
  return { mode: 'pct', myPct, exact: '', forMe: false };
}

function AddExpense({
  initial,
  defaultCurrency,
  onSave,
  onDone,
}: {
  initial?: Expense | null;
  defaultCurrency: string;
  onSave: (row: Row, receipt: ReceiptChange) => Promise<void>;
  onDone: () => void;
}) {
  const { couple, me, partner, mySlot, partnerSlot } = useCouple();
  const split = initial ? splitOf(initial, mySlot) : null;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [amount, setAmount] = useState(initial ? (initial.amount_cents / 100).toFixed(2) : '');
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<ExpenseCategory | null>(initial?.category ?? null);
  const [picked, setPicked] = useState(!!initial);
  const [iPaid, setIPaid] = useState(initial ? initial.paid_by === me.id : true);
  const [mode, setMode] = useState<Mode>(split?.mode ?? 'equal');
  const [myPct, setMyPct] = useState(split?.myPct ?? 50);
  const [exact, setExact] = useState(split?.exact ?? '');
  const [forMe, setForMe] = useState(split?.forMe ?? false);
  const [date, setDate] = useState(() => initial?.spent_on ?? toDateKey(new Date()));
  const [receipt, setReceipt] = useState<ReceiptChange>(undefined);
  const hasReceipt = receipt instanceof File || (!!initial?.receipt_path && receipt !== 'remove');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = parseAmount(amount) ?? 0;
  const money = (n: number) => formatMoney(n, currency);
  const exactCents = Math.min(parseAmount(exact) ?? 0, cents);
  const mine = mode === 'equal' ? Math.round(cents / 2) : mode === 'pct' ? Math.round((cents * myPct) / 100) : mode === 'exact' ? exactCents : forMe ? cents : 0;
  const owedToMe = iPaid ? cents - mine : -mine;
  const result = owedToMe > 0 ? `${partner.display_name} owes you ${money(owedToMe)}` : owedToMe < 0 ? `You owe ${partner.display_name} ${money(-owedToMe)}` : 'Nobody owes anything';
  const cat = category ?? 'other';
  const CatIcon = CATEGORY_STYLE[cat].Icon;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!cents) return;
    setBusy(true);
    setError(null);
    const aCents = mySlot === 'a' ? mine : cents - mine;
    try {
      await onSave({
        couple_id: couple.id,
        paid_by: iPaid ? me.id : partner.id,
        description: description.trim() || EXPENSE_CATEGORIES[cat].label,
        amount_cents: cents,
        currency,
        category: cat,
        split_a_pct: mode === 'exact' ? pctForShare(aCents, cents) : mode === 'equal' ? 50 : Math.round((aCents / cents) * 100),
        a_share_cents: mode === 'exact' ? aCents : null,
        spent_on: date,
      }, receipt);
      if (initial) onDone();
      else setStep(3);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (step === 3)
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="flex h-20 w-20 animate-[us-grow_.45s_ease] items-center justify-center rounded-full bg-sage-50 text-sage-700">
          <Check className="h-10 w-10" strokeWidth={2.6} />
        </span>
        <p className="font-display text-heading text-ink">Added</p>
        <p className="text-ink-soft">
          {description.trim() || EXPENSE_CATEGORIES[cat].label} · {money(cents)}. {result} for this one.
        </p>
        <div className="mt-3 flex w-full gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
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
          <Button className="flex-1" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    );

  if (step === 1)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (cents) setStep(2);
        }}
        className="space-y-4"
      >
        <div className="flex items-center gap-2 rounded-sheet bg-paper-sunken px-4 py-3">
          <select
            aria-label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="rounded-control bg-transparent text-small font-semibold text-ink-soft focus:outline-none"
          >
            {[...new Set([currency, ...CURRENCIES])].map((cur) => (
              <option key={cur} value={cur}>
                {cur}
              </option>
            ))}
          </select>
          <input
            aria-label="Amount"
            inputMode="decimal"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
            placeholder="0"
            className="min-w-0 flex-1 bg-transparent text-right font-display text-[44px] leading-tight text-ink placeholder:text-ink-muted/60 focus:outline-none"
          />
        </div>
        {amount && !cents ? <ErrorNote>Enter an amount like 12.50</ErrorNote> : null}
        <Field
          label="What for"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (!picked) setCategory(guessExpenseCategory(e.target.value));
          }}
          maxLength={200}
          placeholder="Uber to the airport"
        />
        <div className="flex flex-wrap gap-2">
          {EXPENSE_CATEGORY_ORDER.map((k) => {
            const { tone, Icon } = CATEGORY_STYLE[k];
            return (
              <Pick key={k} selected={category === k} onClick={() => (setCategory(k), setPicked(true))}>
                <Icon className={cn('h-4 w-4', category === k && TONE[tone].ink)} /> {EXPENSE_CATEGORIES[k].label}
              </Pick>
            );
          })}
        </div>
        <Button type="submit" size="lg" block disabled={!cents}>
          Next: who paid &amp; split
        </Button>
      </form>
    );

  return (
    <form onSubmit={save} className="space-y-4">
      <button type="button" onClick={() => setStep(1)} aria-label="Back to amount" className="flex w-full items-center gap-3 rounded-sheet border border-paper-edge bg-paper-raised p-3 text-left hover:bg-paper-sunken">
        <ChevronLeft className="h-[18px] w-[18px] text-ink-soft" />
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', TONE[CATEGORY_STYLE[cat].tone].wash, TONE[CATEGORY_STYLE[cat].tone].ink)}>
          <CatIcon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-ink">{description.trim() || EXPENSE_CATEGORIES[cat].label}</span>
          <span className="block text-micro text-ink-muted">{EXPENSE_CATEGORIES[cat].label}</span>
        </span>
        <span className="font-display text-heading text-ink">{money(cents)}</span>
      </button>

      <div className="space-y-1.5">
        <p className="text-small font-medium text-ink">Who paid?</p>
        <div role="radiogroup" aria-label="Who paid" className="grid grid-cols-2 gap-2.5">
          {[
            { v: true, name: me.display_name, label: 'Me', slot: mySlot },
            { v: false, name: partner.display_name, label: partner.display_name, slot: partnerSlot },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              role="radio"
              aria-checked={iPaid === o.v}
              onClick={() => setIPaid(o.v)}
              className={cn('flex h-16 items-center gap-2.5 rounded-sheet border-2 px-3 font-semibold text-ink', iPaid === o.v ? 'border-plum-400 bg-plum-50' : 'border-paper-edge bg-paper-raised')}
            >
              <Initial slot={o.slot} name={o.name} size={32} />
              <span className="truncate">{o.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-small font-medium text-ink">How to split</p>
        <Segmented
          label="How to split"
          className="w-full"
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
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-rose-50 p-3">
              <p className="text-micro text-ink-soft">Your share</p>
              {mode === 'exact' ? (
                <input
                  aria-label="Your share"
                  inputMode="decimal"
                  value={exact}
                  onChange={(e) => setExact(e.target.value.replace(/[^\d.,]/g, ''))}
                  placeholder="0"
                  className="mt-1 h-10 w-full rounded-xl bg-paper-raised px-3 text-lead font-bold text-ink focus:outline-none focus:ring-2 focus:ring-rose-400/40"
                />
              ) : (
                <p className="font-display text-lead text-ink">{money(mine)}</p>
              )}
            </div>
            <div className="rounded-2xl bg-teal-50 p-3">
              <p className="text-micro text-ink-soft">{partner.display_name}’s share</p>
              <p className="font-display text-lead text-ink">{money(cents - mine)}</p>
            </div>
          </div>
        ) : mode === 'pct' ? (
          <div className="space-y-2 rounded-2xl border border-paper-edge bg-paper-raised p-3">
            <p className="flex justify-between text-small text-ink-soft">
              <span>
                <b className="text-rose-700">You {myPct}%</b> · {money(mine)}
              </span>
              <span>
                <b className="text-teal-700">
                  {partner.display_name} {100 - myPct}%
                </b>{' '}
                · {money(cents - mine)}
              </span>
            </p>
            <SplitBar left={myPct / 100} leftColor={SLOT_FILL[mySlot]} rightColor={SLOT_FILL[partnerSlot]} height={10} />
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
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Pick selected={!forMe} onClick={() => setForMe(false)}>
              All for {partner.display_name}
            </Pick>
            <Pick selected={forMe} onClick={() => setForMe(true)}>
              All for me
            </Pick>
          </div>
        )}
      </div>

      <p
        aria-live="polite"
        className={cn(
          'flex items-center gap-3 rounded-sheet px-4 py-3.5 font-semibold',
          owedToMe > 0 ? 'bg-teal-50 text-teal-700' : owedToMe < 0 ? 'bg-rose-50 text-rose-700' : 'bg-paper-sunken text-ink-soft',
        )}
      >
        <ArrowRight className="h-5 w-5" /> {result}
      </p>
      <Field label="When" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-control border border-paper-edge bg-paper-raised px-3 text-small text-ink hover:bg-paper-sunken focus-within:ring-2 focus-within:ring-gold-400">
          <ReceiptText className="h-4 w-4" />
          {receipt instanceof File ? receipt.name.slice(0, 28) : hasReceipt ? 'Change receipt' : 'Add a receipt photo'}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && setReceipt(e.target.files[0])} />
        </label>
        {hasReceipt ? (
          <Button type="button" variant="quiet" size="sm" onClick={() => setReceipt(initial?.receipt_path ? 'remove' : undefined)}>
            Remove receipt
          </Button>
        ) : null}
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button type="submit" size="lg" block loading={busy} disabled={!cents || (mode === 'exact' && !exact.trim())}>
        {initial ? `Save ${money(cents)}` : `Add ${money(cents)}`}
      </Button>
    </form>
  );
}

function SettleUp({ balance, onSave, onDone }: { balance: CurrencyBalance; onSave: (row: Row) => Promise<unknown>; onDone: () => void }) {
  const { couple, me, partner, mySlot, partnerSlot } = useCouple();
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
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <span className="flex h-24 w-24 animate-[us-grow_.45s_ease] items-center justify-center rounded-full bg-sage-50 text-sage-700">
          <Check className="h-12 w-12" strokeWidth={2.6} />
        </span>
        <p className="font-serif text-[34px] italic leading-tight text-ink">{done >= balance.amount_cents ? 'You’re square.' : 'Recorded.'}</p>
        <p className="max-w-[280px] text-ink-soft">{done >= balance.amount_cents ? 'Nothing open between you.' : `${money(balance.amount_cents - done)} is still open. No rush.`}</p>
        <Button className="mt-3" block onClick={onDone}>
          Done
        </Button>
      </div>
    );

  async function submit(e: FormEvent) {
    e.preventDefault();
    const row = settlementFor(balance, couple, cents);
    if (!row) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...row, description: `${row.description} · ${method}` });
      setDone(cents);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-col items-center gap-3 pt-1">
        <div className="flex items-center gap-3">
          <Initial slot={iOwe ? mySlot : partnerSlot} name={iOwe ? me.display_name : partner.display_name} size={56} />
          <ArrowRight className="h-8 w-8 text-rose-700" />
          <Initial slot={iOwe ? partnerSlot : mySlot} name={iOwe ? partner.display_name : me.display_name} size={56} />
        </div>
        <p className="text-ink-soft">{iOwe ? `You’re paying ${partner.display_name}` : `${partner.display_name} paid you`}</p>
        <p className="font-display text-[44px] leading-tight text-ink">{money(cents)}</p>
      </div>
      <Segmented
        label="How much"
        className="w-full"
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
          inputMode="decimal"
          value={partAmt}
          onChange={(e) => setPartAmt(e.target.value)}
          placeholder="0"
          hint={cents ? `${money(balance.amount_cents - cents)} will still be open.` : undefined}
        />
      ) : null}
      <div className="space-y-1.5">
        <p className="text-small font-medium text-ink">Paid with</p>
        <div className="flex flex-wrap gap-2">
          {METHODS.map((m) => (
            <Pick key={m} selected={method === m} onClick={() => setMethod(m)}>
              {m}
            </Pick>
          ))}
        </div>
      </div>
      <p className="text-center text-micro text-ink-muted">Us doesn’t move money. This just records it for both of you.</p>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button type="submit" size="lg" block loading={busy} disabled={!cents}>
        Record {money(cents)} paid
      </Button>
    </form>
  );
}

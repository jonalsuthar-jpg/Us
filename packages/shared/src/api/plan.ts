import type { CalendarEvent, Couple, Database, DecisionOption, EventKind, Expense, ExpenseCategory, LaborEntry } from '../database.types';
import type { UsClient } from '../supabase';
import type { PartnerSlot } from '../tokens';
import { uuid } from '../uuid';
import { removeFiles, uploadFile } from './media';
import { MEMORY_BUCKET } from './memory';
import { signedUrls } from './signed-urls';

type Insert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
type Update<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

// ----------------------------------------------------------------- dates ---

/** Local calendar date as YYYY-MM-DD (what `date` columns store). */
export function toDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a YYYY-MM-DD key as local midnight (not UTC, unlike `new Date(key)`). */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Whole days from today to `key` (negative once it's past). */
export function daysUntil(key: string, today = new Date()): number {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((fromDateKey(key).getTime() - t.getTime()) / 86_400_000);
}

/** "Today", "Tomorrow", "In 6 days", "Yesterday", "3 days ago". */
export function whenLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

/**
 * Six weeks of days covering `month` (0-based), starting on Monday. Days from
 * the neighbouring months are included so the grid is always rectangular.
 */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Bucket events by the local day they start on. */
export function eventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const out = new Map<string, CalendarEvent[]>();
  for (const e of [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const key = toDateKey(new Date(e.starts_at));
    const list = out.get(key);
    if (list) list.push(e);
    else out.set(key, [e]);
  }
  return out;
}

/** "All day", "19:30", "19:30 – 21:00". */
export function formatEventTime(e: Pick<CalendarEvent, 'starts_at' | 'ends_at' | 'all_day'>): string {
  if (e.all_day) return 'All day';
  const t = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return e.ends_at ? `${t(e.starts_at)} – ${t(e.ends_at)}` : t(e.starts_at);
}

// -------------------------------------------------------------- calendar ---

/** Events starting in [from, to). */
export async function listEvents(sb: UsClient, coupleId: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  return unwrap(
    await sb
      .from('calendar_events')
      .select('*')
      .eq('couple_id', coupleId)
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
      .order('starts_at'),
  );
}

/** The next `limit` events from `from` on, however far ahead. */
export async function listUpcoming(sb: UsClient, coupleId: string, from: Date, limit = 6): Promise<CalendarEvent[]> {
  return unwrap(
    await sb
      .from('calendar_events')
      .select('*')
      .eq('couple_id', coupleId)
      .gte('starts_at', from.toISOString())
      .order('starts_at')
      .limit(limit),
  );
}

export const EVENT_KINDS: Record<EventKind, { label: string }> = {
  date: { label: 'Date' },
  trip: { label: 'Trip' },
  birthday: { label: 'Birthday' },
  errand: { label: 'Errand' },
  other: { label: 'Other' },
};
export const EVENT_KIND_ORDER = Object.keys(EVENT_KINDS) as EventKind[];

/** Little prompts for an empty day. */
export const PLAN_IDEAS = ['Picnic', 'Try a new café', 'Movie night', 'Long walk', 'Cook together'];

export async function createEvent(sb: UsClient, row: Insert<'calendar_events'>): Promise<CalendarEvent> {
  return unwrap(await sb.from('calendar_events').insert(row).select('*').single());
}

export async function updateEvent(sb: UsClient, id: string, patch: Update<'calendar_events'>): Promise<CalendarEvent> {
  return unwrap(await sb.from('calendar_events').update(patch).eq('id', id).select('*').single());
}

export async function deleteEvent(sb: UsClient, id: string): Promise<void> {
  unwrap(await sb.from('calendar_events').delete().eq('id', id));
}

// ------------------------------------------------------- decision picker ---

export async function listDecisionOptions(sb: UsClient, coupleId: string): Promise<DecisionOption[]> {
  return unwrap(
    await sb.from('decision_options').select('*').eq('couple_id', coupleId).order('category').order('created_at'),
  );
}

export async function addDecisionOption(sb: UsClient, row: Insert<'decision_options'>): Promise<DecisionOption> {
  return unwrap(await sb.from('decision_options').insert(row).select('*').single());
}

export async function updateDecisionOption(sb: UsClient, id: string, patch: Update<'decision_options'>) {
  return unwrap(await sb.from('decision_options').update(patch).eq('id', id).select('*').single());
}

export async function removeDecisionOption(sb: UsClient, id: string): Promise<void> {
  unwrap(await sb.from('decision_options').delete().eq('id', id));
}

/** Server-side weighted pick (see pick_decision in *_plan.sql). */
export async function pickDecision(sb: UsClient, category: string): Promise<DecisionOption> {
  return unwrap(await sb.rpc('pick_decision', { p_category: category }));
}

/** SVG path for slice `i` of an `n`-slice wheel of radius `r` centred at (c, c); slice 0 starts at 12 o'clock. */
export function wheelSlicePath(i: number, n: number, r: number, c: number): string {
  if (n <= 1) return `M${c} ${c - r} A${r} ${r} 0 1 1 ${c} ${c + r} A${r} ${r} 0 1 1 ${c} ${c - r} Z`;
  const pt = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${(c + r * Math.cos(rad)).toFixed(2)} ${(c + r * Math.sin(rad)).toFixed(2)}`;
  };
  return `M${c} ${c} L${pt((360 / n) * i)} A${r} ${r} 0 0 1 ${pt((360 / n) * (i + 1))} Z`;
}

/**
 * Rotation (degrees clockwise, always increasing) that spins the wheel at
 * least `turns` full turns from `current` and stops with slice `index` under
 * the pointer at 12 o'clock.
 */
export function wheelSpinTarget(current: number, index: number, n: number, turns = 5): number {
  const mod = (x: number) => ((x % 360) + 360) % 360;
  return current - mod(current) + 360 * turns + mod(360 - (360 / n) * (index + 0.5));
}

/** Distinct categories, in first-seen order. */
export function decisionCategories(options: DecisionOption[]): string[] {
  return [...new Set(options.map((o) => o.category))];
}

// ------------------------------------------------------ invisible labour ---

export async function listLabor(sb: UsClient, coupleId: string, sinceKey: string): Promise<LaborEntry[]> {
  return unwrap(
    await sb
      .from('labor_entries')
      .select('*')
      .eq('couple_id', coupleId)
      .gte('done_on', sinceKey)
      .order('done_on', { ascending: false })
      .order('created_at', { ascending: false }),
  );
}

export async function addLabor(sb: UsClient, row: Insert<'labor_entries'>): Promise<LaborEntry> {
  return unwrap(await sb.from('labor_entries').insert(row).select('*').single());
}

export async function setLaborThanked(sb: UsClient, id: string, thanked: boolean): Promise<void> {
  unwrap(await sb.from('labor_entries').update({ thanked_at: thanked ? new Date().toISOString() : null }).eq('id', id));
}

export async function deleteLabor(sb: UsClient, id: string): Promise<void> {
  unwrap(await sb.from('labor_entries').delete().eq('id', id));
}

export interface LaborBalance {
  a: number;
  b: number;
  total: number;
  /** Partner A's share of the effort, 0–1 (0.5 when nothing is logged). */
  aShare: number;
}

/** Effort-weighted share of what each of you carried. */
export function laborBalance(entries: LaborEntry[], couple: Pick<Couple, 'user_a_id' | 'user_b_id'>): LaborBalance {
  let a = 0;
  let b = 0;
  for (const e of entries) {
    if (e.done_by === couple.user_a_id) a += e.effort;
    else if (e.done_by === couple.user_b_id) b += e.effort;
  }
  const total = a + b;
  return { a, b, total, aShare: total ? a / total : 0.5 };
}

/** Effort per task for each of you, biggest first (tasks matched case-insensitively). */
export function laborByTask(
  entries: LaborEntry[],
  couple: Pick<Couple, 'user_a_id' | 'user_b_id'>,
  limit = 5,
): { task: string; a: number; b: number }[] {
  const by = new Map<string, { task: string; a: number; b: number }>();
  for (const e of entries) {
    const key = e.task.trim().toLowerCase();
    const row = by.get(key) ?? { task: e.task.trim(), a: 0, b: 0 };
    if (e.done_by === couple.user_a_id) row.a += e.effort;
    else if (e.done_by === couple.user_b_id) row.b += e.effort;
    by.set(key, row);
  }
  return [...by.values()].sort((x, y) => y.a + y.b - (x.a + x.b)).slice(0, limit);
}

/**
 * Gentle copy for the balance bar — it notices, it never keeps score.
 * `myShare` is my share of the effort, 0–1.
 */
export function describeBalance(myShare: number, total: number, partnerName: string): string {
  if (total === 0) return 'Nothing logged yet. Noticing is the first step.';
  if (myShare >= 0.4 && myShare <= 0.6) return 'Feels shared lately.';
  if (myShare > 0.6) return `You’ve been carrying more lately. Maybe tell ${partnerName} what would help.`;
  return `${partnerName} has been carrying more lately. A thank-you goes a long way.`;
}

// ---------------------------------------------------------------- costs ---

export async function listExpenses(sb: UsClient, coupleId: string): Promise<Expense[]> {
  return unwrap(
    await sb
      .from('expenses')
      .select('*')
      .eq('couple_id', coupleId)
      .order('spent_on', { ascending: false })
      .order('created_at', { ascending: false }),
  );
}

export async function addExpense(sb: UsClient, row: Insert<'expenses'>): Promise<Expense> {
  return unwrap(await sb.from('expenses').insert(row).select('*').single());
}

/** Change an expense (not a settle-up). */
export async function updateExpense(sb: UsClient, id: string, patch: Update<'expenses'>): Promise<Expense> {
  return unwrap(await sb.from('expenses').update(patch).eq('id', id).eq('is_settlement', false).select('*').single());
}

/** Delete an expense, and its receipt photo once the row is gone. */
export async function deleteExpense(sb: UsClient, id: string, receiptPath?: string | null): Promise<void> {
  unwrap(await sb.from('expenses').delete().eq('id', id));
  if (receiptPath) await removeReceipt(sb, receiptPath).catch(() => {});
}

// Receipts live in our folder of the memories bucket, under receipts/.
export async function uploadReceipt(sb: UsClient, coupleId: string, body: Blob | ArrayBuffer | Uint8Array, contentType: string): Promise<string> {
  const path = `${coupleId}/receipts/${uuid()}.${contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'}`;
  await uploadFile(sb, MEMORY_BUCKET, path, body, contentType);
  return path;
}

export async function removeReceipt(sb: UsClient, path: string): Promise<void> {
  await removeFiles(sb, MEMORY_BUCKET, [path]);
}

export function receiptUrls(sb: UsClient, paths: string[]): Promise<Record<string, string>> {
  return signedUrls(sb, MEMORY_BUCKET, paths);
}

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, { label: string }> = {
  food: { label: 'Food' },
  groceries: { label: 'Groceries' },
  rent: { label: 'Rent' },
  travel: { label: 'Travel' },
  fun: { label: 'Fun' },
  bills: { label: 'Bills' },
  other: { label: 'Other' },
};
export const EXPENSE_CATEGORY_ORDER = Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[];

const CATEGORY_HINTS: [RegExp, ExpenseCategory][] = [
  [/\b(uber|ola|rapido|cab|taxi|flights?|train|bus|metro|petrol|fuel|diesel|hotel|airbnb|airport|toll|parking)\b/i, 'travel'],
  [/\b(rent|landlord|lease|maintenance)\b/i, 'rent'],
  [/\b(groceries|grocery|bigbasket|blinkit|zepto|instamart|dmart|supermarket|milk|vegetables|veggies|fruits?)\b/i, 'groceries'],
  [/\b(pizza|dinner|lunch|breakfast|brunch|zomato|swiggy|cafe|café|coffee|restaurant|takeaway|biryani|drinks|bar)\b/i, 'food'],
  [/\b(movies?|cinema|concert|tickets?|games?|netflix|spotify|prime|show|party)\b/i, 'fun'],
  [/\b(electricity|power|wifi|internet|broadband|bill|recharge|gas|water|phone|insurance)\b/i, 'bills'],
];

/** A best guess from the description ("Uber to airport" → travel), or null. */
export function guessExpenseCategory(description: string): ExpenseCategory | null {
  for (const [re, cat] of CATEGORY_HINTS) if (re.test(description)) return cat;
  return null;
}

/** Partner A's share of an expense, in cents: the exact share when one was given, else the percent split. */
export function aShareCents(e: Pick<Expense, 'amount_cents' | 'split_a_pct' | 'a_share_cents'>): number {
  return e.a_share_cents ?? Math.round((e.amount_cents * e.split_a_pct) / 100);
}

/** split_a_pct to store beside an exact share, so older app builds still see roughly the right split. */
export function pctForShare(aCents: number, amountCents: number): number {
  return amountCents ? Math.min(100, Math.max(0, Math.round((aCents / amountCents) * 100))) : 50;
}

export type ExpensePosition = { kind: 'lent' | 'borrowed' | 'paidBack' | 'gotBack'; cents: number } | { kind: 'none'; cents: 0 };

/** What one expense means for me: "you lent ₹620", "you borrowed ₹450", "you paid back…". */
export function expensePosition(
  e: Pick<Expense, 'amount_cents' | 'split_a_pct' | 'a_share_cents' | 'paid_by' | 'is_settlement'>,
  meId: string,
  mySlot: PartnerSlot,
): ExpensePosition {
  const iPaid = e.paid_by === meId;
  if (e.is_settlement) return { kind: iPaid ? 'paidBack' : 'gotBack', cents: e.amount_cents };
  const a = aShareCents(e);
  const mine = mySlot === 'a' ? a : e.amount_cents - a;
  const cents = iPaid ? e.amount_cents - mine : mine;
  return cents ? { kind: iPaid ? 'lent' : 'borrowed', cents } : { kind: 'none', cents: 0 };
}

export interface MonthSpend {
  total: number;
  /** Biggest first; uncategorised costs count as "other". */
  categories: { category: ExpenseCategory; cents: number }[];
  aPaid: number;
  bPaid: number;
}

/** Shared spending in one month ("YYYY-MM") and currency. Settlements aren't spending. */
export function monthSpend(
  expenses: Expense[],
  month: string,
  currency: string,
  couple: Pick<Couple, 'user_a_id' | 'user_b_id'>,
): MonthSpend {
  const by = new Map<ExpenseCategory, number>();
  let total = 0;
  let aPaid = 0;
  let bPaid = 0;
  for (const e of expenses) {
    if (e.is_settlement || e.currency !== currency || !e.spent_on.startsWith(month)) continue;
    total += e.amount_cents;
    const cat = e.category ?? 'other';
    by.set(cat, (by.get(cat) ?? 0) + e.amount_cents);
    if (e.paid_by === couple.user_a_id) aPaid += e.amount_cents;
    else if (e.paid_by === couple.user_b_id) bPaid += e.amount_cents;
  }
  const categories = [...by.entries()].map(([category, cents]) => ({ category, cents })).sort((x, y) => y.cents - x.cents);
  return { total, categories, aPaid, bPaid };
}

/** "2026-11" for a date. */
export function monthKey(d: Date): string {
  return toDateKey(d).slice(0, 7);
}

export interface CurrencyBalance {
  currency: string;
  /** Who owes, or null when you're square. */
  debtor: PartnerSlot | null;
  amount_cents: number;
}

/**
 * Net position per currency. Each expense splits into A's share
 * (split_a_pct %) and B's share; whoever paid is owed the other's share.
 */
export function settleUp(expenses: Expense[], couple: Pick<Couple, 'user_a_id' | 'user_b_id'>): CurrencyBalance[] {
  // Positive = B owes A.
  const net = new Map<string, number>();
  for (const e of expenses) {
    const aShare = aShareCents(e);
    const bShare = e.amount_cents - aShare;
    const delta = e.paid_by === couple.user_a_id ? bShare : e.paid_by === couple.user_b_id ? -aShare : 0;
    net.set(e.currency, (net.get(e.currency) ?? 0) + delta);
  }
  return [...net.entries()]
    .map(([currency, n]) => ({
      currency,
      debtor: n > 0 ? ('b' as const) : n < 0 ? ('a' as const) : null,
      amount_cents: Math.abs(n),
    }))
    .sort((x, y) => x.currency.localeCompare(y.currency));
}

/**
 * The expense row that squares a balance: the debtor "pays" the full amount
 * as the creditor's share, which cancels the debt exactly. Pass `cents` to
 * record paying back only part of it.
 */
export function settlementFor(
  balance: CurrencyBalance,
  couple: Pick<Couple, 'id' | 'user_a_id' | 'user_b_id'>,
  cents?: number,
): Insert<'expenses'> | null {
  if (!balance.debtor || balance.amount_cents === 0) return null;
  const amount = Math.min(balance.amount_cents, Math.round(cents ?? balance.amount_cents));
  if (amount <= 0) return null;
  const debtorIsA = balance.debtor === 'a';
  return {
    couple_id: couple.id,
    paid_by: debtorIsA ? couple.user_a_id : couple.user_b_id,
    description: amount === balance.amount_cents ? 'Settled up' : 'Paid back part',
    amount_cents: amount,
    currency: balance.currency,
    split_a_pct: debtorIsA ? 0 : 100,
    is_settlement: true,
  };
}

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** "12.5" / "12,50" → 1250 cents; null if not a positive amount. */
export function parseAmount(input: string): number | null {
  const clean = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const cents = Math.round(parseFloat(clean) * 100);
  return cents > 0 ? cents : null;
}

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED'] as const;

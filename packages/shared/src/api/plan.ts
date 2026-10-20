import type { CalendarEvent, Couple, Database, DecisionOption, Expense, LaborEntry } from '../database.types';
import type { UsClient } from '../supabase';
import type { PartnerSlot } from '../tokens';

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

export async function deleteExpense(sb: UsClient, id: string): Promise<void> {
  unwrap(await sb.from('expenses').delete().eq('id', id));
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
    const aShare = Math.round((e.amount_cents * e.split_a_pct) / 100);
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
 * as the creditor's share, which cancels the debt exactly.
 */
export function settlementFor(
  balance: CurrencyBalance,
  couple: Pick<Couple, 'id' | 'user_a_id' | 'user_b_id'>,
): Insert<'expenses'> | null {
  if (!balance.debtor || balance.amount_cents === 0) return null;
  const debtorIsA = balance.debtor === 'a';
  return {
    couple_id: couple.id,
    paid_by: debtorIsA ? couple.user_a_id : couple.user_b_id,
    description: 'Settled up',
    amount_cents: balance.amount_cents,
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

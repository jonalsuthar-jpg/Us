import type { UsClient } from '../supabase';

/**
 * Our money: one balance for the two of us, earned by doing things in the
 * house and the village and spent there. The server keeps the balance and
 * decides every amount (supabase/migrations/20261122000500_wallet.sql); these
 * lists mirror it so buttons can show prices (a test checks they match).
 */

/** What things pay, and how many times a day. */
export const REWARDS = {
  daily: { amount: 250, perDay: 2 },
  together: { amount: 200, perDay: 3 },
  game: { amount: 150, perDay: 8 },
  game_win: { amount: 300, perDay: 8 },
  dinner: { amount: 400, perDay: 3 },
  harvest: { amount: 200, perDay: 6 },
  catch: { amount: 50, perDay: 10 },
  treasure: { amount: 250, perDay: 3 },
  fish: { amount: 100, perDay: 8 },
  shells: { amount: 50, perDay: 8 },
} as const;
export type Reward = keyof typeof REWARDS;

/** What things cost. */
export const PRICES = {
  'gift:flowers': 200,
  'gift:box': 300,
  bread: 80,
  coffee: 120,
  bouquet: 250,
  'furniture:plantPot': 250,
  'furniture:armchair': 600,
  'furniture:beanbag': 450,
  'furniture:floorLamp': 400,
  'furniture:rug': 500,
  'furniture:bookshelf': 700,
  'furniture:coffeeTable': 350,
  bus_ticket: 150,
} as const;
export type Priced = keyof typeof PRICES;

export interface WalletLine {
  delta: number;
  reason: string;
  ref: string;
  at: string;
  mine: boolean;
}

export interface Wallet {
  balance: number;
  recent: WalletLine[];
}

/** Broadcast on the couple channel when our money changes. */
export const WALLET_TOPIC = 'wallet';

/** A ref the server accepts: letters, digits and a few separators. */
export const walletRef = (...parts: (string | number)[]) =>
  parts
    .join(':')
    .replace(/[^A-Za-z0-9:_.-]/g, '-')
    .slice(0, 120);

export async function getWallet(sb: UsClient, me: string): Promise<Wallet> {
  const [{ data: w }, { data: lines }] = await Promise.all([
    sb.from('wallets').select('balance').maybeSingle(),
    sb.from('wallet_ledger').select('delta, reason, ref, created_at, user_id').order('id', { ascending: false }).limit(20),
  ]);
  return {
    balance: w?.balance ?? 0,
    recent: (lines ?? []).map((l) => ({ delta: l.delta, reason: l.reason, ref: l.ref, at: l.created_at, mine: l.user_id === me })),
  };
}

/** Earn for something done; the server says how much (0 if it already paid or today's cap is reached). */
export async function earn(sb: UsClient, reason: Reward, ref: string): Promise<{ balance: number; added: number }> {
  const { data, error } = await sb.rpc('earn', { p_reason: reason, p_ref: ref });
  if (error) throw error;
  const r = data as { balance: number; added: number };
  return { balance: r.balance, added: r.added };
}

/** Buy something; rejects with "not enough" when we can't afford it. */
export async function spend(sb: UsClient, item: Priced, ref: string): Promise<{ balance: number; spent: number }> {
  const { data, error } = await sb.rpc('spend', { p_item: item, p_ref: ref });
  if (error) throw new Error(error.message?.includes('not enough') ? 'not enough' : error.message);
  const r = data as { balance: number; spent: number };
  return { balance: r.balance, spent: r.spent };
}

/** A line of the history, in words. */
export function walletLineText(l: Pick<WalletLine, 'reason' | 'delta'>): string {
  const words: Record<string, string> = {
    daily: 'Coming home',
    together: 'Doing something together',
    game: 'A game',
    game_win: 'Winning a game',
    dinner: 'Cooking dinner',
    harvest: 'From the garden',
    catch: 'A catch streak',
    treasure: 'Finding the treasure',
    fish: 'A fish from the lake',
    shells: 'Shells from the beach',
    'spend:gift': 'A gift',
    'spend:bread': 'Bread',
    'spend:coffee': 'Coffee',
    'spend:bouquet': 'Flowers',
    'spend:furniture': 'Furniture',
    'spend:bus_ticket': 'Bus tickets',
  };
  return `${words[l.reason] ?? l.reason} ${l.delta > 0 ? '+' : '−'}${formatRupees(Math.abs(l.delta))}`;
}

/** Money as it's written in India: ₹1,250 (₹1,25,000 past a lakh). */
export function formatRupees(n: number): string {
  const sign = n < 0 ? '−' : '';
  const digits = String(Math.round(Math.abs(n)));
  const last = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${sign}₹${rest ? `${rest},${last}` : last}`;
}

import type { UsClient } from '../supabase';

/**
 * Our money: one balance for the two of us, earned by doing things in the
 * house and the village and spent there. The server keeps the balance and
 * decides every amount (supabase/migrations/20261122000500_wallet.sql); these
 * lists mirror it so buttons can show prices (a test checks they match).
 */

/** What things pay, and how many times a day. */
export const REWARDS = {
  daily: { amount: 25, perDay: 2 },
  together: { amount: 20, perDay: 3 },
  game: { amount: 15, perDay: 8 },
  game_win: { amount: 30, perDay: 8 },
  dinner: { amount: 40, perDay: 3 },
  harvest: { amount: 20, perDay: 6 },
  catch: { amount: 5, perDay: 10 },
  treasure: { amount: 25, perDay: 3 },
} as const;
export type Reward = keyof typeof REWARDS;

/** What things cost. */
export const PRICES = {
  'gift:flowers': 20,
  'gift:box': 30,
  bread: 8,
  coffee: 12,
  bouquet: 25,
  'furniture:plantPot': 25,
  'furniture:armchair': 60,
  'furniture:beanbag': 45,
  'furniture:floorLamp': 40,
  'furniture:rug': 50,
  'furniture:bookshelf': 70,
  'furniture:coffeeTable': 35,
  bus_ticket: 15,
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
    'spend:gift': 'A gift',
    'spend:bread': 'Bread',
    'spend:coffee': 'Coffee',
    'spend:bouquet': 'Flowers',
    'spend:furniture': 'Furniture',
    'spend:bus_ticket': 'Bus tickets',
  };
  return `${words[l.reason] ?? l.reason} ${l.delta > 0 ? '+' : '−'}${Math.abs(l.delta)}`;
}

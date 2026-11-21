import { describe, expect, it } from 'vitest';
import { formatRupees, PRICES, REWARDS, walletLineText, walletRef } from '../src/api/wallet';

// The migration itself (Node's fs, loaded at run time: the shared package has no Node types).
const { readFileSync } = (await import('node:fs' as string)) as { readFileSync: (p: URL, enc: 'utf8') => string };
// The rewards and the prices as the latest migration defines them.
const sql = readFileSync(new URL('../../../supabase/migrations/20261122000800_rupees.sql', import.meta.url), 'utf8');
const rewardsSql = readFileSync(new URL('../../../supabase/migrations/20261122000800_rupees.sql', import.meta.url), 'utf8');

describe('our money', () => {
  it('shows the same rewards as the server pays', () => {
    for (const [reason, r] of Object.entries(REWARDS)) expect(rewardsSql).toContain(`('${reason}', ${r.amount}, ${r.perDay})`);
    expect([...rewardsSql.matchAll(/\('([a-z_]+)', \d+, \d+\)/g)].length).toBe(Object.keys(REWARDS).length);
  });

  it('shows the same prices as the server charges', () => {
    for (const [item, price] of Object.entries(PRICES)) expect(sql).toContain(`when '${item}' then ${price}`);
    expect([...sql.matchAll(/when '([a-zA-Z:_]+)' then \d+/g)].length).toBe(Object.keys(PRICES).length);
  });

  it('makes refs the server accepts', () => {
    const r = walletRef('dinner', '2026-11-22T10:00:00.000Z', 'pasta');
    expect(r).toMatch(/^[A-Za-z0-9:_.-]{1,120}$/);
    expect(walletRef('x'.repeat(300)).length).toBe(120);
  });

  it('says what each line was', () => {
    expect(walletLineText({ reason: 'dinner', delta: 400 })).toBe('Cooking dinner +₹400');
    expect(walletLineText({ reason: 'spend:bread', delta: -80 })).toBe('Bread −₹80');
  });

  it('writes money the Indian way', () => {
    expect(formatRupees(0)).toBe('₹0');
    expect(formatRupees(120)).toBe('₹120');
    expect(formatRupees(1250)).toBe('₹1,250');
    expect(formatRupees(125000)).toBe('₹1,25,000');
    expect(formatRupees(12345678)).toBe('₹1,23,45,678');
  });
});

import { describe, expect, it } from 'vitest';
import { PRICES, REWARDS, walletLineText, walletRef } from '../src/api/wallet';

// The migration itself (Node's fs, loaded at run time: the shared package has no Node types).
const { readFileSync } = (await import('node:fs' as string)) as { readFileSync: (p: URL, enc: 'utf8') => string };
const sql = readFileSync(new URL('../../../supabase/migrations/20261122000500_wallet.sql', import.meta.url), 'utf8');

describe('our money', () => {
  it('shows the same rewards as the server pays', () => {
    for (const [reason, r] of Object.entries(REWARDS)) expect(sql).toContain(`('${reason}', ${r.amount}, ${r.perDay})`);
    expect([...sql.matchAll(/\('([a-z_]+)', \d+, \d+\)/g)].length).toBe(Object.keys(REWARDS).length);
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
    expect(walletLineText({ reason: 'dinner', delta: 40 })).toBe('Cooking dinner +40');
    expect(walletLineText({ reason: 'spend:bread', delta: -8 })).toBe('Bread −8');
  });
});

import { describe, expect, it } from 'vitest';
import {
  describeBalance,
  eventsByDay,
  fromDateKey,
  laborBalance,
  monthGrid,
  parseAmount,
  settlementFor,
  settleUp,
  toDateKey,
} from '../src/api/plan';
import type { CalendarEvent, Expense, LaborEntry } from '../src/database.types';

const couple = { id: 'c', user_a_id: 'A', user_b_id: 'B' };

const expense = (o: Partial<Expense>): Expense => ({
  id: Math.random().toString(36),
  couple_id: 'c',
  paid_by: 'A',
  description: 'x',
  amount_cents: 1000,
  currency: 'EUR',
  split_a_pct: 50,
  spent_on: '2026-10-01',
  is_settlement: false,
  created_at: '2026-10-01T00:00:00Z',
  ...o,
});

describe('settleUp', () => {
  it('whoever paid is owed the other share', () => {
    expect(settleUp([expense({ paid_by: 'A', amount_cents: 1000 })], couple)).toEqual([
      { currency: 'EUR', debtor: 'b', amount_cents: 500 },
    ]);
    expect(settleUp([expense({ paid_by: 'B', amount_cents: 1000, split_a_pct: 70 })], couple)).toEqual([
      { currency: 'EUR', debtor: 'a', amount_cents: 700 },
    ]);
  });

  it('nets across expenses and keeps currencies apart', () => {
    const out = settleUp(
      [
        expense({ paid_by: 'A', amount_cents: 3000 }),
        expense({ paid_by: 'B', amount_cents: 1000 }),
        expense({ paid_by: 'B', amount_cents: 999, currency: 'INR' }),
      ],
      couple,
    );
    expect(out).toEqual([
      { currency: 'EUR', debtor: 'b', amount_cents: 1000 },
      { currency: 'INR', debtor: 'a', amount_cents: 500 }, // 999 * 50% rounds to 500
    ]);
  });

  it('a settlement squares the balance exactly', () => {
    const history = [expense({ paid_by: 'A', amount_cents: 2500, split_a_pct: 30 })];
    const [balance] = settleUp(history, couple);
    expect(balance).toEqual({ currency: 'EUR', debtor: 'b', amount_cents: 1750 });
    const row = settlementFor(balance!, couple)!;
    expect(row).toMatchObject({ paid_by: 'B', split_a_pct: 100, amount_cents: 1750, is_settlement: true });
    const after = settleUp([...history, expense({ ...row, id: 's' })], couple);
    expect(after).toEqual([{ currency: 'EUR', debtor: null, amount_cents: 0 }]);
    expect(settlementFor(after[0]!, couple)).toBeNull();
  });
});

describe('parseAmount', () => {
  it('accepts dots, commas and whole numbers', () => {
    expect(parseAmount('12.5')).toBe(1250);
    expect(parseAmount('12,50')).toBe(1250);
    expect(parseAmount(' 7 ')).toBe(700);
  });
  it('rejects nonsense and zero', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('1.234')).toBeNull();
    expect(parseAmount('-3')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('laborBalance', () => {
  const entry = (done_by: string, effort: number): LaborEntry => ({
    id: Math.random().toString(36),
    couple_id: 'c',
    done_by,
    task: 't',
    effort,
    done_on: '2026-10-01',
    created_at: '',
  });

  it('weights by effort', () => {
    const b = laborBalance([entry('A', 3), entry('B', 1), entry('A', 1)], couple);
    expect(b).toEqual({ a: 4, b: 1, total: 5, aShare: 0.8 });
  });

  it('is even when empty', () => {
    expect(laborBalance([], couple).aShare).toBe(0.5);
  });

  it('copy notices without keeping score', () => {
    expect(describeBalance(0.5, 10, 'Sam')).toBe('Feels shared lately.');
    expect(describeBalance(0.75, 10, 'Sam')).toMatch(/You’ve been carrying more/);
    expect(describeBalance(0.2, 10, 'Sam')).toMatch(/Sam has been carrying more/);
    expect(describeBalance(0.5, 0, 'Sam')).toMatch(/Nothing logged/);
  });
});

describe('calendar helpers', () => {
  it('date keys are local, not UTC', () => {
    const d = new Date(2026, 0, 31, 23, 30);
    expect(toDateKey(d)).toBe('2026-01-31');
    expect(fromDateKey('2026-01-31').getDate()).toBe(31);
  });

  it('month grid is 6 Monday-first weeks covering the month', () => {
    const grid = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(grid).toHaveLength(42);
    expect(grid[0]!.getDay()).toBe(1);
    expect(toDateKey(grid[0]!)).toBe('2026-09-28');
    expect(grid.some((d) => toDateKey(d) === '2026-10-31')).toBe(true);
  });

  it('buckets events by start day, in order', () => {
    const ev = (id: string, starts: Date): CalendarEvent => ({
      id,
      couple_id: 'c',
      created_by: 'A',
      title: id,
      starts_at: starts.toISOString(),
      ends_at: null,
      all_day: false,
      notes: null,
      created_at: '',
    });
    const map = eventsByDay([ev('late', new Date(2026, 9, 2, 20)), ev('early', new Date(2026, 9, 2, 8)), ev('next', new Date(2026, 9, 3, 9))]);
    expect(map.get('2026-10-02')!.map((e) => e.id)).toEqual(['early', 'late']);
    expect(map.get('2026-10-03')!.map((e) => e.id)).toEqual(['next']);
  });
});

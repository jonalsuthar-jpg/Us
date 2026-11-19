import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  describeBalance,
  expensePosition,
  guessExpenseCategory,
  laborByTask,
  monthSpend,
  wheelSpinTarget,
  whenLabel,
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
  category: null,
  a_share_cents: null,
  receipt_path: null,
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
    thanked_at: null,
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
      kind: null,
      created_at: '',
    });
    const map = eventsByDay([ev('late', new Date(2026, 9, 2, 20)), ev('early', new Date(2026, 9, 2, 8)), ev('next', new Date(2026, 9, 3, 9))]);
    expect(map.get('2026-10-02')!.map((e) => e.id)).toEqual(['early', 'late']);
    expect(map.get('2026-10-03')!.map((e) => e.id)).toEqual(['next']);
  });
});

describe('plan refresh helpers', () => {
  it('an exact share wins over the percent split', () => {
    const [b] = settleUp([expense({ paid_by: 'A', amount_cents: 1240, split_a_pct: 32, a_share_cents: 400 })], couple);
    expect(b).toEqual({ currency: 'EUR', debtor: 'b', amount_cents: 840 });
  });

  it('a part settlement leaves the rest open', () => {
    const history = [expense({ paid_by: 'A', amount_cents: 1000 })];
    const row = settlementFor(settleUp(history, couple)[0]!, couple, 200)!;
    expect(row.amount_cents).toBe(200);
    const [after] = settleUp([...history, expense({ ...row, a_share_cents: null, category: null } as Partial<Expense>)], couple);
    expect(after).toEqual({ currency: 'EUR', debtor: 'b', amount_cents: 300 });
  });

  it('says who lent and who borrowed', () => {
    expect(expensePosition(expense({ paid_by: 'A', amount_cents: 1000 }), 'A', 'a')).toEqual({ kind: 'lent', cents: 500 });
    expect(expensePosition(expense({ paid_by: 'A', amount_cents: 1000, split_a_pct: 30 }), 'B', 'b')).toEqual({ kind: 'borrowed', cents: 700 });
    expect(expensePosition(expense({ paid_by: 'A', amount_cents: 1000, split_a_pct: 100 }), 'A', 'a')).toEqual({ kind: 'none', cents: 0 });
    expect(expensePosition(expense({ paid_by: 'B', is_settlement: true }), 'A', 'a').kind).toBe('gotBack');
  });

  it('sums a month by category, leaving out settlements', () => {
    const out = monthSpend(
      [
        expense({ amount_cents: 900, category: 'rent', spent_on: '2026-11-01' }),
        expense({ amount_cents: 300, paid_by: 'B', category: 'food', spent_on: '2026-11-04' }),
        expense({ amount_cents: 200, spent_on: '2026-11-05' }),
        expense({ amount_cents: 999, is_settlement: true, spent_on: '2026-11-06' }),
        expense({ amount_cents: 999, spent_on: '2026-10-30' }),
      ],
      '2026-11',
      'EUR',
      couple,
    );
    expect(out).toEqual({
      total: 1400,
      categories: [
        { category: 'rent', cents: 900 },
        { category: 'food', cents: 300 },
        { category: 'other', cents: 200 },
      ],
      aPaid: 1100,
      bPaid: 300,
    });
  });

  it('guesses a category from the description', () => {
    expect(guessExpenseCategory('Uber to airport')).toBe('travel');
    expect(guessExpenseCategory('BigBasket order')).toBe('groceries');
    expect(guessExpenseCategory('Pizza night')).toBe('food');
    expect(guessExpenseCategory('Something')).toBeNull();
  });

  it('counts days and labels them', () => {
    const today = new Date(2026, 10, 16, 22);
    expect(daysUntil('2026-11-16', today)).toBe(0);
    expect(daysUntil('2026-11-22', today)).toBe(6);
    expect(whenLabel(1)).toBe('Tomorrow');
    expect(whenLabel(6)).toBe('In 6 days');
  });

  it('stops the wheel with the chosen slice under the pointer', () => {
    for (const [cur, i, n] of [[0, 0, 6], [725, 3, 6], [100, 4, 5]] as const) {
      const t = wheelSpinTarget(cur, i, n);
      expect(t).toBeGreaterThan(cur + 360 * 4);
      const mid = (360 / n) * (i + 0.5);
      expect((((t + mid) % 360) + 360) % 360).toBeCloseTo(0);
    }
  });

  it('groups effort by task', () => {
    const e = (done_by: string, task: string, effort: number): LaborEntry => ({
      id: task + done_by,
      couple_id: 'c',
      done_by,
      task,
      effort,
      done_on: '2026-10-01',
      thanked_at: null,
      created_at: '',
    });
    expect(laborByTask([e('A', 'Cooking', 2), e('B', 'cooking ', 3), e('A', 'Dishes', 1)], couple)).toEqual([
      { task: 'Cooking', a: 2, b: 3 },
      { task: 'Dishes', a: 1, b: 0 },
    ]);
  });
});

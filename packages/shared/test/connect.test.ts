import { describe, expect, it } from 'vitest';
import { dailyState, dailyStreak } from '../src/api/connect';

const e = (for_date: string, mine: boolean, theirs: boolean) => ({
  for_date,
  my_answer: mine ? 'yes' : null,
  partner_answered: theirs,
});

describe('dailyState', () => {
  it('moves from ask to revealed as each of us answers', () => {
    expect(dailyState(e('2026-10-21', false, false))).toBe('ask');
    expect(dailyState(e('2026-10-21', false, true))).toBe('nudge');
    expect(dailyState(e('2026-10-21', true, false))).toBe('waiting');
    expect(dailyState(e('2026-10-21', true, true))).toBe('revealed');
  });
});

describe('dailyStreak', () => {
  const now = new Date(2026, 9, 21, 9, 0); // 21 Oct, local time

  it('counts consecutive days we both answered, including today', () => {
    expect(dailyStreak([e('2026-10-21', true, true), e('2026-10-20', true, true), e('2026-10-19', true, true)], now)).toBe(3);
  });
  it('keeps a streak through yesterday while today is still open', () => {
    expect(dailyStreak([e('2026-10-21', true, false), e('2026-10-20', true, true), e('2026-10-19', true, true)], now)).toBe(2);
  });
  it('breaks on a day only one of us answered, or a gap', () => {
    expect(dailyStreak([e('2026-10-20', true, true), e('2026-10-19', false, true), e('2026-10-18', true, true)], now)).toBe(1);
    expect(dailyStreak([e('2026-10-21', true, true), e('2026-10-19', true, true)], now)).toBe(1);
    expect(dailyStreak([e('2026-10-18', true, true)], now)).toBe(0);
  });
});

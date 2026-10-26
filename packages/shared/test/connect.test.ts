import { describe, expect, it } from 'vitest';
import { dailyState, dailyStreak, filterDaily } from '../src/api/connect';
import type { DailyEntry } from '../src/database.types';

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

describe('filterDaily', () => {
  const entry = (id: string, prompt: string, mine: string | null, theirs: string | null, answered = theirs !== null): DailyEntry => ({
    question_id: id,
    prompt,
    for_date: '2026-10-20',
    my_answer: mine,
    my_answered_at: null,
    partner_answered: answered,
    partner_answer: theirs,
  });
  const all = [
    entry('1', 'Where would you go tomorrow?', 'Lisbon', 'The sea'),
    entry('2', 'A song about us?', null, null, true),
    entry('3', 'Your proudest moment?', 'Your graduation', null),
  ];

  it('filters by who has answered', () => {
    expect(filterDaily(all, 'all').map((e) => e.question_id)).toEqual(['1', '2', '3']);
    expect(filterDaily(all, 'both').map((e) => e.question_id)).toEqual(['1']);
    expect(filterDaily(all, 'theirs').map((e) => e.question_id)).toEqual(['2']);
    expect(filterDaily(all, 'mine').map((e) => e.question_id)).toEqual(['3']);
  });
  it('searches prompts and the answers I can see, ignoring case', () => {
    expect(filterDaily(all, 'all', 'SONG').map((e) => e.question_id)).toEqual(['2']);
    expect(filterDaily(all, 'all', 'lisbon').map((e) => e.question_id)).toEqual(['1']);
    expect(filterDaily(all, 'all', 'sea').map((e) => e.question_id)).toEqual(['1']);
    expect(filterDaily(all, 'both', 'graduation')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { goalColumns, ideaOfTheDay, LOVE_LANGUAGE_QUIZ, LOVE_LANGUAGES, rankedLanguages, scoreLoveLanguages } from '../src/api/growth';
import type { Goal, LoveLanguage } from '../src/database.types';

describe('love language quiz', () => {
  it('is balanced: every language appears in exactly four questions', () => {
    const counts: Record<string, number> = {};
    for (const q of LOVE_LANGUAGE_QUIZ) {
      expect(q.a.lang).not.toBe(q.b.lang);
      counts[q.a.lang] = (counts[q.a.lang] ?? 0) + 1;
      counts[q.b.lang] = (counts[q.b.lang] ?? 0) + 1;
    }
    expect(counts).toEqual({ words: 4, acts: 4, gifts: 4, time: 4, touch: 4 });
  });

  it('scores picks and finds the primary language', () => {
    // Always pick whichever side is "time" when offered, else "a".
    const answers = LOVE_LANGUAGE_QUIZ.map((q) => (q.b.lang === 'time' ? 'b' : 'a'));
    const { scores, primary } = scoreLoveLanguages(answers);
    expect(primary).toBe('time');
    expect(scores.time).toBe(4);
    expect(Object.values(scores).reduce((a, b) => a + b, 0)).toBe(LOVE_LANGUAGE_QUIZ.length);
  });

  it('breaks ties in a fixed order and ranks results', () => {
    expect(scoreLoveLanguages([]).primary).toBe('words');
    expect(rankedLanguages({ touch: 3, gifts: 3, words: 1 })).toEqual(['gifts', 'touch', 'words', 'acts', 'time']);
  });

  it('offers one stable idea per day', () => {
    const lang: LoveLanguage = 'acts';
    const a = ideaOfTheDay(lang, new Date(2026, 9, 20, 8));
    expect(ideaOfTheDay(lang, new Date(2026, 9, 20, 22))).toBe(a);
    expect(LOVE_LANGUAGES[lang].ideas).toContain(a);
    expect(ideaOfTheDay(lang, new Date(2026, 9, 21))).not.toBe(a);
  });
});

describe('goalColumns', () => {
  const g = (id: string, owner_id: string | null): Goal => ({ id, couple_id: 'c', owner_id, title: id, progress: 0, created_at: '', updated_at: '' });
  it('splits mine / theirs / ours', () => {
    const cols = goalColumns([g('m', 'me'), g('t', 'them'), g('o', null)], 'me');
    expect(cols.mine.map((x) => x.id)).toEqual(['m']);
    expect(cols.theirs.map((x) => x.id)).toEqual(['t']);
    expect(cols.ours.map((x) => x.id)).toEqual(['o']);
  });
});

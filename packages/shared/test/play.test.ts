import { describe, expect, it } from 'vitest';
import { quizState } from '../src/api/quizzes';
import { cardAt, DECKS, seededOrder } from '../src/games/cards';
import { knowMePrompt, mostLikelyPrompt, quizMatches, quizScore, quizVerdict, rateGap } from '../src/games/quiz';

describe('quizzes', () => {
  it('words know-me questions for whoever reads them', () => {
    expect(knowMePrompt("{name}'s dream holiday?", 'Parul', false)).toBe("Parul's dream holiday?");
    expect(knowMePrompt("{name}'s dream holiday?", 'Parul', true)).toBe('Your dream holiday?');
    expect(knowMePrompt('What would {name} grab first in a fire?', 'Parul', true)).toBe('What would you grab first in a fire?');
    expect(knowMePrompt('When {name} is stressed, they…', 'Parul', true)).toBe('When you are stressed, you…');
    expect(knowMePrompt('How does {name} like to say sorry?', 'Parul', true)).toBe('How do you like to say sorry?');
    expect(knowMePrompt("How would {name}'s friends describe them?", 'Parul', true)).toBe('How would your friends describe you?');
    expect(knowMePrompt("{name}'s best feature, according to {name}?", 'Parul', true)).toBe('Your best feature, according to you?');
    expect(mostLikelyPrompt('cry at a movie')).toBe('Who’s more likely to cry at a movie?');
  });
  it('matches each game its own way', () => {
    expect(quizScore('this_or_that', [0, 1, 1], [0, 1, 0])).toBe(2);
    expect(quizScore('know_me', null, [0])).toBe(0);
    // Most likely: "me" (0) from one of us is "my partner" (1) from the other.
    expect(quizMatches('most_likely', [0, 0, 1], [1, 0, 0])).toEqual([true, false, true]);
    expect(quizMatches('rate_it', [7, 3, 10], [8, 6, 10])).toEqual([true, false, true]);
    expect(rateGap([7, 3, 10], [8, 6, 10])).toBe(1.3);
  });
  it('names the result', () => {
    expect(quizVerdict('know_me', 5, 5)).toMatch(/Soulmates/);
    expect(quizVerdict('this_or_that', 1, 5)).toMatch(/Opposites attract/);
    expect(quizVerdict('rate_it', 4, 5)).toMatch(/Pretty in sync/);
    expect(quizState({ my_answers: null, partner_answers: null })).toBe('mine');
    expect(quizState({ my_answers: [0], partner_answers: null })).toBe('waiting');
    expect(quizState({ my_answers: [0], partner_answers: [1] })).toBe('revealed');
  });
});

describe('talk cards', () => {
  it('deals the same order from the same seed, and every card once', () => {
    expect(seededOrder(30, 42)).toEqual(seededOrder(30, 42));
    expect(seededOrder(30, 42)).not.toEqual(seededOrder(30, 43));
    expect([...seededOrder(30, 7)].sort((a, b) => a - b)).toEqual([...Array(30).keys()]);
  });
  it('runs out at the end of the deck', () => {
    const deck = DECKS[0]!;
    expect(cardAt({ deck: deck.id, seed: 1, index: 0 })).toBeTypeOf('string');
    expect(cardAt({ deck: deck.id, seed: 1, index: deck.cards.length })).toBeNull();
  });
});

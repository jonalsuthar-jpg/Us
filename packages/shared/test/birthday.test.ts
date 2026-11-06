import { describe, expect, it } from 'vitest';
import { birthdayPhase, moveKnife, topEmoji } from '../src';

describe('birthday room', () => {
  const room = { unlock_at: '2026-11-09T18:30:00.000Z', ends_at: '2026-11-10T18:30:00.000Z' };

  it('is locked before midnight, festive on the day, kept after', () => {
    expect(birthdayPhase(room, Date.parse('2026-11-09T18:29:59Z'))).toBe('before');
    expect(birthdayPhase(room, Date.parse('2026-11-09T18:30:00Z'))).toBe('day');
    expect(birthdayPhase(room, Date.parse('2026-11-10T18:29:59Z'))).toBe('day');
    expect(birthdayPhase(room, Date.parse('2026-11-10T18:30:00Z'))).toBe('after');
  });

  it('finds the favourite emoji, skin tones and variation selectors included', () => {
    expect(topEmoji(['haha 😂', '😂😂 ok', 'love ❤️', '❤ again', '❤️', '❤️'])).toEqual({ emoji: '❤', count: 4 });
    expect(topEmoji(['👍🏽 sure', '👍🏽'])).toEqual({ emoji: '👍🏽', count: 2 });
    expect(topEmoji(['no emoji here'])).toBeNull();
  });

  it('the knife only goes forward, and finishes the cut near the end', () => {
    let cake = { knife: 0, cut: false };
    cake = moveKnife(cake, 0.5);
    expect(cake).toEqual({ knife: 0.5, cut: false });
    expect(moveKnife(cake, 0.2)).toEqual({ knife: 0.5, cut: false });
    cake = moveKnife(cake, 0.95);
    expect(cake).toEqual({ knife: 1, cut: true });
    expect(moveKnife(cake, 0)).toBe(cake);
  });
});

describe('birthday songs', () => {
  it('stores picked audio under a type we can play', async () => {
    const { songType } = await import('../src');
    expect(songType('song.mp3', '')).toBe('audio/mpeg');
    expect(songType('Voice 001.m4a', 'application/octet-stream')).toBe('audio/mp4');
    expect(songType('x', 'audio/mpeg')).toBe('audio/mpeg');
    expect(songType('x.wav', 'audio/x-wav')).toBe('audio/wav');
    expect(songType('notes.pdf', 'application/pdf')).toBeNull();
  });
});

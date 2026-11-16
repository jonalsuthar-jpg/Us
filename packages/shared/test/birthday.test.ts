import { describe, expect, it } from 'vitest';
import { topEmoji } from '../src';

describe('birthday story', () => {
  it('finds the favourite emoji, skin tones and variation selectors included', () => {
    expect(topEmoji(['haha 😂', '😂😂 ok', 'love ❤️', '❤ again', '❤️', '❤️'])).toEqual({ emoji: '❤', count: 4 });
    expect(topEmoji(['👍🏽 sure', '👍🏽'])).toEqual({ emoji: '👍🏽', count: 2 });
    expect(topEmoji(['no emoji here'])).toBeNull();
  });
});

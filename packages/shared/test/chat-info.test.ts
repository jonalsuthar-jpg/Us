import { describe, expect, it } from 'vitest';
import { formatCallTime, summarizeChat } from '../src/api/chat-info';
import { chatBackground, CHAT_THEME_ORDER, CHAT_THEMES, isChatTheme, isDarkChat } from '../src/chat-themes';

describe('our chat in numbers', () => {
  it('adds up picked-up calls, the longest one, and our favourite reaction', () => {
    const n = summarizeChat({
      mine: 120,
      theirs: 98,
      photos: 14,
      videos: 3,
      voiceNotes: 9,
      calls: [
        { answered_at: '2026-01-01T10:00:00Z', ended_at: '2026-01-01T10:30:00Z' },
        { answered_at: '2026-01-02T10:00:00Z', ended_at: '2026-01-02T11:15:00Z' },
        // Still going: counted, no time yet.
        { answered_at: '2026-01-03T10:00:00Z', ended_at: null },
        // Never picked up.
        { answered_at: null, ended_at: '2026-01-04T10:00:00Z' },
      ],
      firstMessageAt: '2025-06-01T08:00:00Z',
      reactions: [{ a: '❤️', b: '😂' }, { a: '❤️' }, {}],
    });
    expect(n).toMatchObject({ mine: 120, theirs: 98, calls: 3, callMs: 105 * 60_000, longestCallMs: 75 * 60_000, topReaction: { emoji: '❤️', count: 2 } });
    expect(summarizeChat({ mine: 0, theirs: 0, photos: 0, videos: 0, voiceNotes: 0, calls: [], firstMessageAt: null, reactions: [] }).topReaction).toBeNull();
  });

  it('reads call time like a person would say it', () => {
    expect(formatCallTime(20_000)).toBe('under a minute');
    expect(formatCallTime(45 * 60_000)).toBe('45 min');
    expect(formatCallTime(134 * 60_000)).toBe('2 h 14 min');
    expect(formatCallTime(120 * 60_000)).toBe('2 h');
  });
});

describe('chat themes', () => {
  it('have a background for light and dark, and fall back to paper', () => {
    expect(CHAT_THEME_ORDER).toHaveLength(6);
    for (const t of CHAT_THEME_ORDER) expect(CHAT_THEMES[t].light).toMatch(/^#[0-9A-F]{6}$/i);
    expect(chatBackground('nope' as never, 'light')).toBe(CHAT_THEMES.paper.light);
    expect(chatBackground('rose', 'dark')).toBe(CHAT_THEMES.rose.dark);
    expect(isChatTheme('teal')).toBe(true);
    expect(isChatTheme('purple')).toBe(false);
    expect(isDarkChat('night', 'light')).toBe(true);
    expect(isDarkChat('rose', 'light')).toBe(false);
  });
});

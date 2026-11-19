import { describe, expect, it } from 'vitest';
// The push functions' own rules (pure TypeScript, no Deno APIs).
import { decide, inQuietHours, localMinutes, type NotifyPrefs } from '../../../supabase/functions/_shared/notify-rules';

const prefs = (over: Partial<NotifyPrefs> = {}): NotifyPrefs => ({ off: [], quiet_start: null, quiet_end: null, hide_preview: false, ...over });
// 23:30 in Kolkata.
const lateNight = new Date('2026-11-20T18:00:00Z');

describe('notification rules', () => {
  it('send everything when nothing is set', () => {
    expect(decide(null, 'new_message', lateNight, 'Asia/Kolkata')).toEqual({ deliver: true, quiet: false, hide: false });
  });

  it('skip a group I turned off, but calls and arrivals always come through', () => {
    const p = prefs({ off: ['messages', 'snaps', 'calls'] });
    expect(decide(p, 'new_message', lateNight, null).deliver).toBe(false);
    expect(decide(p, 'doodle', lateNight, null).deliver).toBe(false);
    expect(decide(p, 'daily_question', lateNight, null).deliver).toBe(true);
    expect(decide(p, 'incoming_call', lateNight, null)).toMatchObject({ deliver: true, quiet: false });
    expect(decide(prefs({ off: ['location'], quiet_start: 0, quiet_end: 1439 }), 'arrival', lateNight, null)).toMatchObject({ deliver: true, quiet: false });
  });

  it('go quiet in my own quiet hours, by my time zone', () => {
    const p = prefs({ quiet_start: 22 * 60, quiet_end: 7 * 60 });
    expect(decide(p, 'new_message', lateNight, 'Asia/Kolkata').quiet).toBe(true);
    // The same moment is 18:00 in London: not quiet.
    expect(decide(p, 'new_message', lateNight, 'Europe/London').quiet).toBe(false);
    expect(decide(p, 'incoming_call', lateNight, 'Asia/Kolkata').quiet).toBe(false);
  });

  it('hide what a push is about when asked, even for calls (the ring still comes)', () => {
    expect(decide(prefs({ hide_preview: true }), 'new_message', lateNight, null).hide).toBe(true);
    expect(decide(prefs({ hide_preview: true }), 'incoming_call', lateNight, null)).toMatchObject({ deliver: true, hide: true });
  });

  it('quiet hours wrap midnight, and equal ends mean none', () => {
    expect(inQuietHours(23 * 60, 22 * 60, 7 * 60)).toBe(true);
    expect(inQuietHours(6 * 60, 22 * 60, 7 * 60)).toBe(true);
    expect(inQuietHours(12 * 60, 22 * 60, 7 * 60)).toBe(false);
    expect(inQuietHours(13 * 60, 13 * 60, 14 * 60)).toBe(true);
    expect(inQuietHours(14 * 60, 13 * 60, 14 * 60)).toBe(false);
    expect(inQuietHours(600, 600, 600)).toBe(false);
    expect(inQuietHours(600, null, null)).toBe(false);
  });

  it('read local time, falling back to UTC for an unknown zone', () => {
    expect(localMinutes(lateNight, 'Asia/Kolkata')).toBe(23 * 60 + 30);
    expect(localMinutes(lateNight, 'Not/AZone')).toBe(18 * 60);
  });
});

import { describe, expect, it } from 'vitest';
import { draftMessage, dropDeleted, mergeMessage, mergeMessages } from '../src/api/messages';
import { formatInviteCode } from '../src/api/pairing';
import { describeCall, formatClock, formatDay, formatDuration } from '../src/format';
import type { Call } from '../src/database.types';

describe('mergeMessage', () => {
  it('never regresses status (late "delivered" after "read")', () => {
    const m = { ...draftMessage('c', 'u', 'hi'), status: 'read' as const };
    const merged = mergeMessage(m, { ...m, status: 'delivered' });
    expect(merged.status).toBe('read');
  });

  it('confirms an optimistic message', () => {
    const draft = draftMessage('c', 'u', 'hi');
    expect(draft.pending).toBe(true);
    const merged = mergeMessage(draft, { ...draft, pending: undefined, status: 'delivered' });
    expect(merged.pending).toBe(false);
    expect(merged.status).toBe('delivered');
  });
});

describe('mergeMessage identity', () => {
  it('keeps the same object when the server sends what we already have', () => {
    const m = { ...draftMessage('c', 'u', 'hi'), pending: undefined, reactions: { u: '❤️' } };
    expect(mergeMessage(m, { ...m, reactions: { u: '❤️' } })).toBe(m);
  });

  it('makes a new object when something visible changed', () => {
    const m = { ...draftMessage('c', 'u', 'hi'), pending: undefined };
    expect(mergeMessage(m, { ...m, reactions: { u: '❤️' } })).not.toBe(m);
  });
});

describe('mergeMessages', () => {
  const at = (id: string, created_at: string) => ({ ...draftMessage('c', 'u', id), id, created_at, pending: undefined });

  it('returns the same array when nothing changed', () => {
    const prev = [at('a', '2026-01-01T00:00:00Z'), at('b', '2026-01-02T00:00:00Z')];
    expect(mergeMessages(prev, [{ ...prev[1]! }])).toBe(prev);
  });

  it('keeps untouched rows and adds new ones in time order', () => {
    const a = at('a', '2026-01-02T00:00:00Z');
    const b = at('b', '2026-01-04T00:00:00Z');
    const next = mergeMessages([a, b], [at('c', '2026-01-05T00:00:00Z'), at('d', '2026-01-01T00:00:00Z')]);
    expect(next.map((m) => m.id)).toEqual(['d', 'a', 'b', 'c']);
    expect(next[1]).toBe(a);
  });

  it('moves a sent draft to where the server timed it', () => {
    const draft = { ...at('a', '2026-01-05T00:00:00Z'), pending: true };
    const b = at('b', '2026-01-04T00:00:00Z');
    expect(mergeMessages([b, draft], [{ ...draft, created_at: '2026-01-03T00:00:00Z' }]).map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('dropDeleted', () => {
  const at = (id: string, day: number, extra = {}) => ({ ...draftMessage('c', 'u', id), id, created_at: `2026-01-${String(day).padStart(2, '0')}T00:00:00Z`, pending: undefined, ...extra });
  const ids = (list: { id: string }[]) => list.map((m) => m.id);

  it('removes a row the server no longer has, within the page', () => {
    const prev = [at('old', 1), at('gone', 3), at('p1', 2), at('p2', 4)];
    expect(ids(dropDeleted(prev, [at('p2', 4), at('p1', 2)], false))).toEqual(['old', 'p1', 'p2']);
  });

  it('checks everything when the page is the whole thread', () => {
    const prev = [at('cached-gone', 1), at('p1', 2)];
    expect(ids(dropDeleted(prev, [at('p1', 2)], true))).toEqual(['p1']);
    expect(dropDeleted(prev, [], true)).toEqual([]);
  });

  it('never drops unsent drafts or what arrived during the fetch', () => {
    const prev = [at('failed', 1, { failed: true }), at('pending', 1, { pending: true }), at('p1', 2), at('just-in', 3)];
    expect(ids(dropDeleted(prev, [at('p1', 2)], true))).toEqual(['failed', 'pending', 'p1', 'just-in']);
  });

  it('returns the same array when nothing was dropped', () => {
    const prev = [at('p1', 2)];
    expect(dropDeleted(prev, [at('p1', 2)], false)).toBe(prev);
  });
});

describe('formatDay and formatClock', () => {
  const now = new Date(2026, 5, 15, 12);
  it('names recent days and dates older ones', () => {
    expect(formatDay(new Date(2026, 5, 15, 8).toISOString(), now)).toBe('Today');
    expect(formatDay(new Date(2026, 5, 14, 8).toISOString(), now)).toBe('Yesterday');
    const expected = (o: Intl.DateTimeFormatOptions, d: Date) => d.toLocaleDateString(undefined, o);
    const week = new Date(2026, 5, 12, 8);
    expect(formatDay(week.toISOString(), now)).toBe(expected({ weekday: 'long' }, week));
    const thisYear = new Date(2026, 1, 3, 8);
    expect(formatDay(thisYear.toISOString(), now)).toBe(expected({ day: 'numeric', month: 'long' }, thisYear));
    const lastYear = new Date(2025, 1, 3, 8);
    expect(formatDay(lastYear.toISOString(), now)).toBe(expected({ day: 'numeric', month: 'long', year: 'numeric' }, lastYear));
  });

  it('matches the old clock label and survives a bad date', () => {
    const d = new Date(2026, 5, 15, 15, 4);
    expect(formatClock(d.toISOString())).toBe(d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
    expect(formatClock('nonsense')).toBe('Invalid Date');
  });
});

describe('formatInviteCode', () => {
  it('normalises typed codes', () => {
    expect(formatInviteCode('abcd efgh')).toBe('ABCD-EFGH');
    expect(formatInviteCode('ab')).toBe('AB');
    expect(formatInviteCode('ABCD-EFGH-XYZ')).toBe('ABCD-EFGH');
  });
});

describe('describeCall', () => {
  const base: Call = {
    id: '1',
    couple_id: 'c',
    caller_id: 'a',
    callee_id: 'b',
    media: 'video',
    status: 'missed',
    created_at: '2026-01-01T10:00:00Z',
    answered_at: null,
    ended_at: '2026-01-01T10:00:45Z',
  };

  it('is a missed call for the callee and "no answer" for the caller', () => {
    expect(describeCall(base, 'b')).toMatchObject({ label: 'Missed video call', missed: true });
    expect(describeCall(base, 'a')).toMatchObject({ label: 'Video call · no answer', missed: false });
  });

  it('shows duration for completed calls', () => {
    const ended: Call = {
      ...base,
      media: 'audio',
      status: 'ended',
      answered_at: '2026-01-01T10:00:05Z',
      ended_at: '2026-01-01T10:12:36Z',
    };
    expect(describeCall(ended, 'a')).toEqual({ label: 'Voice call', missed: false, detail: '12:31' });
  });

  it('formats long durations', () => {
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });
});

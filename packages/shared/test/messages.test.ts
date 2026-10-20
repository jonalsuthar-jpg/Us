import { describe, expect, it } from 'vitest';
import { draftMessage, mergeMessage } from '../src/api/messages';
import { formatInviteCode } from '../src/api/pairing';
import { describeCall, formatDuration } from '../src/format';
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

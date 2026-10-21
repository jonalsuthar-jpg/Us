import { describe, expect, it } from 'vitest';
import { firstUnseen, snapReplyQuote, snapTimeLeft } from '../src/api/snaps';

describe('snaps', () => {
  const now = new Date('2026-10-25T12:00:00Z');

  it('shows hours left, then minutes in the last hour', () => {
    expect(snapTimeLeft('2026-10-26T11:30:00Z', now)).toBe('23h left');
    expect(snapTimeLeft('2026-10-25T12:40:00Z', now)).toBe('40m left');
    expect(snapTimeLeft('2026-10-25T12:00:10Z', now)).toBe('1m left');
  });

  it('opens a story at the first snap I haven’t seen', () => {
    expect(firstUnseen([{ seen_at: 'x' }, { seen_at: null }, { seen_at: null }])).toBe(1);
    expect(firstUnseen([{ seen_at: 'x' }, { seen_at: 'y' }])).toBe(0);
  });

  it('quotes a snap reply as whose snap it was, and says when it has expired', () => {
    const live = [{ id: 's1', caption: 'Sunset' }];
    expect(snapReplyQuote({ sender_id: 'me', snap_id: 's1' }, 'me', 'Priya', live)).toEqual({ author: 'Priya’s snap', text: '📸 Sunset' });
    expect(snapReplyQuote({ sender_id: 'her', snap_id: 's1' }, 'me', 'Priya', [{ id: 's1', caption: null }])).toEqual({ author: 'Your snap', text: '📸 Photo' });
    expect(snapReplyQuote({ sender_id: 'her', snap_id: 'gone' }, 'me', 'Priya', live)?.text).toBe('📸 Snap · expired');
    expect(snapReplyQuote({ sender_id: 'her', snap_id: null }, 'me', 'Priya')).toBeNull();
  });
});

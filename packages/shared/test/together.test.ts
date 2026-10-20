import { describe, expect, it } from 'vitest';
import { escapeLike, formatVoiceLength, groupReactions, messagePreview } from '../src/api/messages';
import {
  daysBetween,
  describeDaysLeft,
  describeDistance,
  distanceMeters,
  nextOccurrence,
  relationshipMilestones,
  shouldAutoArrive,
  sortListItems,
  upcoming,
} from '../src/api/together';
import type { Countdown, ListItem } from '../src/database.types';

const now = new Date(2026, 9, 21, 9, 0); // 21 Oct 2026, local

const cd = (id: string, on_date: string, yearly = false): Countdown => ({
  id,
  couple_id: 'c',
  created_by: 'A',
  title: id,
  emoji: null,
  on_date,
  yearly,
  created_at: '',
});

describe('countdowns', () => {
  it('counts days between date keys', () => {
    expect(daysBetween('2026-10-21', '2026-10-31')).toBe(10);
    expect(daysBetween('2026-10-21', '2026-10-20')).toBe(-1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('rolls yearly dates forward and counts the years', () => {
    expect(nextOccurrence('1995-03-14', true, now)).toEqual({ date: '2027-03-14', years: 32 });
    expect(nextOccurrence('1995-10-21', true, now)).toEqual({ date: '2026-10-21', years: 31 });
    expect(nextOccurrence('2000-02-29', true, now)).toEqual({ date: '2027-02-28', years: 27 });
  });

  it('drops one-off dates that have passed', () => {
    expect(nextOccurrence('2026-10-20', false, now)).toBeNull();
    expect(nextOccurrence('2026-12-01', false, now)).toEqual({ date: '2026-12-01', years: 0 });
  });

  it('finds the next day milestone and anniversary since pairing', () => {
    // Paired 1 Aug 2025: today is day 447, so next is day 500, and the 1st anniversary has passed.
    const m = relationshipMilestones(new Date(2025, 7, 1, 12).toISOString(), now);
    expect(m[0]).toMatchObject({ title: '500 days together', daysLeft: 53, date: '2026-12-13' });
    expect(m[1]).toMatchObject({ title: '2 years together', date: '2027-08-01', years: 2 });
  });

  it('marks day 100 on the right date', () => {
    const paired = new Date(2026, 6, 14, 20).toISOString(); // 14 Jul = day 1
    expect(relationshipMilestones(paired, now)[0]).toMatchObject({ title: '100 days together', date: '2026-10-21', daysLeft: 0 });
  });

  it('merges countdowns and milestones, soonest first', () => {
    const list = upcoming([cd('Lisbon', '2026-11-02'), cd('Old', '2026-01-01'), cd('Birthday', '1990-10-25', true)], new Date(2026, 6, 14).toISOString(), now, 3);
    expect(list.map((u) => [u.title, u.daysLeft])).toEqual([
      ['100 days together', 0],
      ['Birthday', 4],
      ['Lisbon', 12],
    ]);
    expect(describeDaysLeft(0)).toBe('Today');
    expect(describeDaysLeft(1)).toBe('Tomorrow');
    expect(describeDaysLeft(12)).toBe('in 12 days');
  });
});

describe('lists', () => {
  const item = (id: string, created_at: string, done_at: string | null = null): ListItem => ({
    id,
    couple_id: 'c',
    list: 'groceries',
    text: id,
    note: null,
    added_by: 'A',
    done_at,
    done_by: done_at ? 'A' : null,
    created_at,
  });
  it('puts open items first in the order added, then done ones newest first', () => {
    const sorted = sortListItems([item('d1', '1', '5'), item('o2', '2'), item('o1', '1'), item('d2', '2', '9')]);
    expect(sorted.map((i) => i.id)).toEqual(['o1', 'o2', 'd2', 'd1']);
  });
});

describe('location', () => {
  const lisbon = { lat: 38.7223, lng: -9.1393 };
  const porto = { lat: 41.1579, lng: -8.6291 };
  it('measures distance', () => {
    expect(Math.round(distanceMeters(lisbon, porto) / 1000)).toBe(274);
    expect(describeDistance(42)).toBe('40 m');
    expect(describeDistance(3420)).toBe('3.4 km');
    expect(describeDistance(274_000)).toBe('274 km');
  });
  it('auto-arrives only the traveller, on an open check, near home', () => {
    const check = { traveller_id: 'me', arrived_at: null, cancelled_at: null };
    const nearHome = { lat: lisbon.lat + 0.0005, lng: lisbon.lng, accuracy: 20 };
    expect(shouldAutoArrive(check, 'me', nearHome, lisbon)).toBe(true);
    expect(shouldAutoArrive(check, 'them', nearHome, lisbon)).toBe(false);
    expect(shouldAutoArrive({ ...check, arrived_at: 'x' }, 'me', nearHome, lisbon)).toBe(false);
    expect(shouldAutoArrive(check, 'me', porto, lisbon)).toBe(false);
    expect(shouldAutoArrive(check, 'me', nearHome, null)).toBe(false);
  });
});

describe('chat helpers', () => {
  it('groups reactions by emoji and marks mine', () => {
    expect(groupReactions({ me: '❤️', them: '❤️', x: '😂' }, 'me')).toEqual([
      { emoji: '❤️', count: 2, mine: true },
      { emoji: '😂', count: 1, mine: false },
    ]);
    expect(groupReactions(null, 'me')).toEqual([]);
  });
  it('describes messages and voice lengths', () => {
    expect(messagePreview({ body: ' hi ', media_kind: null, kind: 'text' })).toBe('hi');
    expect(messagePreview({ body: null, media_kind: 'image', kind: 'text' })).toBe('📷 Photo');
    expect(messagePreview({ body: null, media_kind: 'audio', kind: 'text' })).toBe('🎤 Voice note');
    expect(formatVoiceLength(4200)).toBe('0:04');
    expect(formatVoiceLength(75_000)).toBe('1:15');
  });
  it('escapes LIKE wildcards in search', () => {
    expect(escapeLike('50% off_now')).toBe('50\\% off\\_now');
  });
});

import { describe, expect, it } from 'vitest';
import { daysTogether, featuredMemory, freshStatus, timeAgo } from '../src/api/home';
import type { Memory } from '../src/database.types';

const mem = (id: string, happened_on: string, photo_path: string | null = null): Memory => ({
  id,
  couple_id: 'c',
  created_by: 'A',
  title: id,
  body: null,
  happened_on,
  photo_path,
  kind: 'moment',
  created_at: '',
});

describe('freshStatus', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  it('shows a status set within the last day', () => {
    expect(freshStatus({ status_emoji: '😴', status_text: 'sleepy', status_at: '2026-10-21T02:00:00Z' }, now)).toEqual({
      emoji: '😴',
      text: 'sleepy',
      at: '2026-10-21T02:00:00Z',
    });
  });
  it('hides one older than a day, or an empty one', () => {
    expect(freshStatus({ status_emoji: '😴', status_text: null, status_at: '2026-10-20T11:00:00Z' }, now)).toBeNull();
    expect(freshStatus({ status_emoji: null, status_text: null, status_at: '2026-10-21T11:00:00Z' }, now)).toBeNull();
    expect(freshStatus({ status_emoji: '😴', status_text: null, status_at: null }, now)).toBeNull();
  });
});

describe('daysTogether', () => {
  it('counts the pairing day as day 1', () => {
    expect(daysTogether(new Date(2026, 9, 21, 9).toISOString(), new Date(2026, 9, 21, 23))).toBe(1);
    expect(daysTogether(new Date(2026, 9, 1, 23).toISOString(), new Date(2026, 9, 21, 1))).toBe(21);
  });
});

describe('featuredMemory', () => {
  const now = new Date(2026, 9, 20);
  it('prefers an anniversary', () => {
    expect(featuredMemory([mem('recent', '2026-10-01', 'p'), mem('last-year', '2025-10-20')], now)?.id).toBe('last-year');
  });
  it('falls back to the latest with a photo, then the latest', () => {
    expect(featuredMemory([mem('a', '2026-10-05'), mem('b', '2026-10-01', 'p')], now)?.id).toBe('b');
    expect(featuredMemory([mem('a', '2026-10-05')], now)?.id).toBe('a');
    expect(featuredMemory([], now)).toBeNull();
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  it('reads naturally', () => {
    expect(timeAgo('2026-10-21T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-10-21T11:48:00Z', now)).toBe('12m ago');
    expect(timeAgo('2026-10-21T09:00:00Z', now)).toBe('3h ago');
  });
});

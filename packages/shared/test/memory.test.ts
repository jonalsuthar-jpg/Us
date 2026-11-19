import { describe, expect, it } from 'vitest';
import { groupByMonth, onThisDay } from '../src/api/memory';
import type { Memory } from '../src/database.types';

const mem = (id: string, happened_on: string): Memory => ({
  id,
  couple_id: 'c',
  created_by: 'A',
  title: id,
  body: null,
  happened_on,
  photo_path: null,
  photo_paths: [],
  video_path: null,
  video_meta: null,
  cover_path: null,
  video_poster_path: null,
  kind: 'moment',
  created_at: '',
  from_snap: null,
});

describe('onThisDay', () => {
  const now = new Date(2026, 9, 20); // 20 October 2026
  it('finds the same day in earlier years, most recent first', () => {
    const out = onThisDay([mem('a', '2024-10-20'), mem('b', '2025-10-20'), mem('today', '2026-10-20'), mem('other', '2025-10-21')], now);
    expect(out.map((m) => [m.id, m.yearsAgo])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
  });
});

describe('groupByMonth', () => {
  it('sections newest first', () => {
    const groups = groupByMonth([mem('jun', '2025-06-01'), mem('oct2', '2026-10-02'), mem('oct9', '2026-10-09')]);
    expect(groups.map((g) => g.key)).toEqual(['2026-10', '2025-06']);
    expect(groups[0]!.items.map((m) => m.id)).toEqual(['oct9', 'oct2']);
  });
});

describe('our year', async () => {
  const { yearRecap, offerRecap, memoryPhotos } = await import('../src/api/memory');
  const m = (id: string, happened_on: string, kind: 'moment' | 'trip' | 'date', photos: string[] = []) =>
    ({ id, couple_id: 'c', created_by: 'A', title: id, body: null, happened_on, photo_path: photos[0] ?? null, photo_paths: photos, video_path: null, video_meta: null, cover_path: null, video_poster_path: null, kind, created_at: '', from_snap: null });

  it('adds up the year: memories, photos, trips, the busiest month and a collage', () => {
    const all = [m('a', '2026-06-01', 'trip', ['c/1.jpg', 'c/2.jpg']), m('b', '2026-06-20', 'date', ['c/3.jpg']), m('c', '2026-02-14', 'date'), m('old', '2025-06-01', 'trip', ['c/0.jpg'])];
    const r = yearRecap(all, 2026, '2025-01-01T00:00:00Z', new Date('2026-12-31T12:00:00Z'));
    expect(r).toMatchObject({ year: 2026, memories: 3, photos: 3, trips: 1, dates: 2, busiest: { count: 2 } });
    expect(r.first?.id).toBe('c');
    expect(r.highlights).toEqual(['c/1.jpg', 'c/3.jpg']);
    expect(r.daysTogether).toBeGreaterThan(700);
  });

  it('reads old memories with just a cover', () => {
    expect(memoryPhotos({ photo_path: 'c/x.jpg', photo_paths: [] })).toEqual(['c/x.jpg']);
    expect(memoryPhotos({ photo_path: null })).toEqual([]);
  });

  it('is offered in December and the week after our anniversary', () => {
    expect(offerRecap('2025-03-10T00:00:00Z', new Date('2026-12-02T10:00:00'))).toBe(true);
    expect(offerRecap('2025-03-10T00:00:00Z', new Date('2026-03-12T10:00:00'))).toBe(true);
    expect(offerRecap('2025-03-10T00:00:00Z', new Date('2026-05-12T10:00:00'))).toBe(false);
    expect(offerRecap('2026-03-10T00:00:00Z', new Date('2026-03-12T10:00:00'))).toBe(false);
  });
});

describe('memory covers', async () => {
  const { memoryCover, memoryFiles } = await import('../src/api/memory');
  it('show the chosen cover, else the first photo, else the video still', () => {
    expect(memoryCover({ photo_path: 'c/1.jpg', photo_paths: ['c/1.jpg'], cover_path: 'c/mine.jpg' })).toBe('c/mine.jpg');
    expect(memoryCover({ photo_path: 'c/1.jpg', photo_paths: ['c/1.jpg', 'c/2.jpg'] })).toBe('c/1.jpg');
    expect(memoryCover({ photo_path: null, photo_paths: [], video_path: 'c/video/v.mp4', video_poster_path: 'c/still.jpg' })).toBe('c/still.jpg');
    expect(memoryCover({ photo_path: null })).toBeNull();
  });
  it('list every file once', () => {
    expect(memoryFiles({ photo_path: 'c/1.jpg', photo_paths: ['c/1.jpg'], cover_path: 'c/1.jpg', video_path: 'c/video/v.mp4', video_poster_path: 'c/s.jpg' })).toEqual(['c/1.jpg', 'c/video/v.mp4', 'c/s.jpg']);
  });
});

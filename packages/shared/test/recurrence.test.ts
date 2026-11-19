import { describe, expect, it } from 'vitest';
import { expandEvents, localDateKey, seriesId } from '../src/recurrence';

const ev = (over: Record<string, unknown>) => ({ id: 'e1', starts_at: '2026-01-01T00:00:00Z', ends_at: null, repeat: 'none' as const, repeat_tz: 'Asia/Kolkata', skip_dates: [], ...over });
const range = (a: string, b: string) => [new Date(a), new Date(b)] as const;

describe('repeating plans', () => {
  it('pass a one-off plan through when it falls in the range', () => {
    const [from, to] = range('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z');
    expect(expandEvents([ev({ starts_at: '2026-01-10T13:30:00Z' })], from, to).map((e) => e.id)).toEqual(['e1']);
    expect(expandEvents([ev({ starts_at: '2026-03-10T13:30:00Z' })], from, to)).toEqual([]);
  });

  it('repeat weekly at the same local time, keeping the length', () => {
    // Fridays 19:00–21:00 in Kolkata.
    const e = ev({ starts_at: '2026-01-02T13:30:00Z', ends_at: '2026-01-02T15:30:00Z', repeat: 'weekly' });
    const out = expandEvents([e], ...range('2026-01-01T00:00:00Z', '2026-01-31T00:00:00Z'));
    expect(out.map((o) => o.occurrence)).toEqual(['2026-01-02', '2026-01-09', '2026-01-16', '2026-01-23', '2026-01-30']);
    expect(out[1]).toMatchObject({ id: 'e1@2026-01-09', series_id: 'e1', starts_at: '2026-01-09T13:30:00.000Z', ends_at: '2026-01-09T15:30:00.000Z' });
  });

  it('repeat monthly on the local day, even when that is another day in UTC', () => {
    // The 1st at 00:00 in Kolkata is the evening before in UTC.
    const e = ev({ starts_at: '2025-12-31T18:30:00Z', repeat: 'monthly' });
    const out = expandEvents([e], ...range('2026-01-15T00:00:00Z', '2026-06-01T00:00:00Z'));
    expect(out.map((o) => o.occurrence)).toEqual(['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01']);
  });

  it('skip months without the day, and Feb 29 outside leap years', () => {
    const monthly = ev({ starts_at: '2026-01-31T06:30:00Z', repeat: 'monthly' });
    expect(expandEvents([monthly], ...range('2026-01-01T00:00:00Z', '2026-05-01T00:00:00Z')).map((o) => o.occurrence)).toEqual(['2026-01-31', '2026-03-31']);
    const leap = ev({ starts_at: '2024-02-29T06:30:00Z', repeat: 'yearly' });
    expect(expandEvents([leap], ...range('2024-01-01T00:00:00Z', '2029-01-01T00:00:00Z')).map((o) => o.occurrence)).toEqual(['2024-02-29', '2028-02-29']);
  });

  it('keep the wall time across a daylight-saving change', () => {
    const e = ev({ starts_at: '2026-03-20T17:00:00Z', repeat: 'weekly', repeat_tz: 'Europe/London' }); // 17:00 GMT
    const out = expandEvents([e], ...range('2026-03-20T00:00:00Z', '2026-04-04T00:00:00Z'));
    expect(out.map((o) => o.starts_at)).toEqual(['2026-03-20T17:00:00.000Z', '2026-03-27T17:00:00.000Z', '2026-04-03T16:00:00.000Z']);
  });

  it('leave out skipped dates, and never come before the first', () => {
    const e = ev({ starts_at: '2026-01-02T13:30:00Z', repeat: 'weekly', skip_dates: ['2026-01-09'] });
    expect(expandEvents([e], ...range('2025-12-01T00:00:00Z', '2026-01-17T00:00:00Z')).map((o) => o.occurrence)).toEqual(['2026-01-02', '2026-01-16']);
    expect(seriesId('e1@2026-01-09')).toBe('e1');
    expect(localDateKey('2025-12-31T18:30:00Z', 'Asia/Kolkata')).toBe('2026-01-01');
  });

});

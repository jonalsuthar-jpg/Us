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
  kind: 'moment',
  created_at: '',
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

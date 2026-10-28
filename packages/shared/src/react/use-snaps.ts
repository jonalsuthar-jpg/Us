import { useEffect } from 'react';
import { keptSnapIds, listSnaps, SNAP_TOPIC, type Snaps } from '../api/snaps';
import { useCouple } from './couple-provider';
import { useCoupleData, type CoupleData } from './use-couple-data';

export interface SnapsData extends Snaps {
  /** Snaps one of us already kept in Memories. */
  kept: Set<string>;
}

/** Our live snaps, refreshed when my partner posts, sees or reacts, and when one expires. */
export function useSnaps(): CoupleData<SnapsData> {
  const { sb, couple, me } = useCouple();
  const snaps = useCoupleData<SnapsData>(
    SNAP_TOPIC,
    async () => {
      const live = await listSnaps(sb, couple.id, me.id);
      const kept = await keptSnapIds(sb, [...live.mine, ...live.partner].map((s) => s.id));
      return { ...live, kept };
    },
    [sb, couple.id, me.id],
    undefined,
    'memory',
  );

  // Drop a snap from the screen when it expires, not on the next reload.
  const { data, reload } = snaps;
  useEffect(() => {
    const all = data ? [...data.mine, ...data.partner] : [];
    if (!all.length) return;
    const soonest = Math.min(...all.map((s) => Date.parse(s.expires_at)));
    const t = setTimeout(() => void reload(), Math.min(Math.max(1000, soonest - Date.now() + 1000), 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [data, reload]);

  return snaps;
}

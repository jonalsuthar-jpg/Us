import { useEffect, useState } from 'react';
import { birthdayStoryMemories, getBirthdayStory, type BirthdayRoom } from '../api/birthday';
import { usSoFar, type UsSoFar } from '../birthday/stats';
import { useChatKey } from './chat-key-provider';
import { useCouple } from './couple-provider';
import { useCoupleData } from './use-couple-data';

/** The birthday story kept with a memory; null once loaded if it has none. */
export function useBirthdayStory(memoryId: string): { room: BirthdayRoom | null; loading: boolean } {
  const { sb } = useCouple();
  const data = useCoupleData(`birthday:story:${memoryId}`, () => getBirthdayStory(sb, memoryId), [sb, memoryId]);
  return { room: data.data ?? null, loading: data.loading };
}

/** The memories that open a birthday story. */
export function useBirthdayStoryMemories(): Set<string> {
  const { sb } = useCouple();
  return useCoupleData('birthday:stories', () => birthdayStoryMemories(sb), [sb]).data ?? EMPTY;
}
const EMPTY = new Set<string>();

/** "Us, so far", read on this device (see birthday/stats.ts). */
export function useUsSoFar(enabled: boolean): UsSoFar | null {
  const { sb, couple, me } = useCouple();
  const { cipher } = useChatKey();
  const [stats, setStats] = useState<UsSoFar | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    usSoFar(sb, couple.id, me.id, cipher)
      .then((s) => live && setStats(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled, sb, couple.id, me.id, cipher]);
  return stats;
}

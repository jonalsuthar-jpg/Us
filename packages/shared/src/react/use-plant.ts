import { useEffect, useMemo, useRef } from 'react';
import { getPlant, plantState, PLANT_TOPIC, setMyTimezone, type PlantData, type PlantState } from '../api/plant';
import { useCouple } from './couple-provider';
import { useCoupleData, type CoupleData } from './use-couple-data';
import { useForegroundTick } from './use-foreground-tick';

/**
 * Our plant, kept fresh: it changes whenever either of us does something, so
 * it reloads on any ping from my partner, on new messages and answered calls,
 * and after my own actions (a short beat later, once the trigger has run).
 */
export function usePlant(): CoupleData<PlantData> & { state: PlantState | undefined } {
  const { sb, couple, me, mySlot, channel } = useCouple();
  const plant = useCoupleData(PLANT_TOPIC, () => getPlant(sb, couple.id, couple.user_a_id), [sb, couple.id, couple.user_a_id]);

  // The couple's "today" follows partner A's clock; keep mine current.
  useEffect(() => {
    void setMyTimezone(sb, me).catch(() => {});
  }, [sb, me]);

  const { reload } = plant;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const soon = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void reload(), 600);
    };
    const offs = [
      channel.changes.on(soon),
      channel.messages.on((c) => c.type === 'INSERT' && soon()),
      channel.calls.on((c) => c.type === 'UPDATE' && !!c.row.answered_at && soon()),
    ];
    return () => {
      offs.forEach((off) => off());
      clearTimeout(timer.current);
    };
  }, [channel, reload]);

  // A new day begins: today's cans go back to resting.
  useForegroundTick(() => void reload(), 15 * 60_000);

  const state = useMemo(() => (plant.data ? plantState(plant.data, mySlot) : undefined), [plant.data, mySlot]);
  return { ...plant, state };
}

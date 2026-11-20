import { useCallback, useEffect, useRef, useState } from 'react';
import { POSE_TTL_MS } from '../house/presence';
import { useCouple } from './couple-provider';
import { useForegroundTick } from './use-foreground-tick';

/**
 * Whether my partner is in Our House right now, for the card that invites me
 * in. Only listens: nothing from the 3D house loads for this.
 */
export function usePartnerInHouse(): boolean {
  const { channel, me } = useCouple();
  const heard = useRef(0);
  const [inside, setInside] = useState(false);
  const check = useCallback(() => setInside(Date.now() - heard.current < POSE_TTL_MS), []);
  useEffect(
    () =>
      channel.house.on((e) => {
        if (e.from === me.id) return;
        heard.current = e.op === 'bye' ? 0 : Date.now();
        check();
      }),
    [channel, me.id, check],
  );
  useForegroundTick(check, POSE_TTL_MS / 4);
  return inside;
}

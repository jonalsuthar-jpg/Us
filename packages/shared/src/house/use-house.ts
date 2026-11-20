import { useEffect, useState } from 'react';
import { useCouple } from '../react/couple-provider';
import { HousePresence } from './presence';

/**
 * My presence in the house while the screen is open: says hello on the way
 * in and bye on the way out, so my partner sees me arrive and leave.
 */
export function useHousePresence(): { presence: HousePresence | null; partnerHere: boolean } {
  const { channel, me } = useCouple();
  const [presence, setPresence] = useState<HousePresence | null>(null);
  const [partnerHere, setPartnerHere] = useState(false);
  useEffect(() => {
    const p = new HousePresence(me.id, { send: (e) => channel.sendHouse(e), on: (fn) => channel.house.on(fn) });
    setPresence(p);
    const off = p.onPartnerHere(setPartnerHere);
    return () => {
      off();
      p.dispose();
      setPresence(null);
      setPartnerHere(false);
    };
  }, [channel, me.id]);
  return { presence, partnerHere };
}

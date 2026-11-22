import { useEffect, useState, useSyncExternalStore } from 'react';
import { isleApi } from '../api/isle';
import { notifyPartner } from '../api/push';
import { useCouple } from '../react/couple-provider';
import { waitingOn } from './rules';
import { IsleStore, type IsleSnapshot } from './store';

const EMPTY: IsleSnapshot = { loaded: false, game: null, seat: -1, partnerHere: false, botThinking: null };
/** Long enough for the move that handed over the turn to be saved (the server checks). */
const NUDGE_AFTER_MS = 4000;

/**
 * Isle while its screen is open: the game, kept in step with my partner's
 * phone, with the bots played here when it's this phone's job. When the game
 * comes to wait on my partner and they aren't at the table, they get a push.
 */
export function useIsle(): { store: IsleStore | null; snap: IsleSnapshot } {
  const { sb, couple, channel, me, partner } = useCouple();
  const [store, setStore] = useState<IsleStore | null>(null);
  useEffect(() => {
    const st = new IsleStore(isleApi(sb, couple.id), { send: (w) => channel.sendIsle(w), on: (fn) => channel.isle.on(fn) }, me.id);
    void st.open().catch(() => {});
    // After a dropped connection, what was saved meanwhile.
    const offResync = channel.resync.on(() => void st.load().catch(() => {}));
    setStore(st);
    return () => {
      offResync();
      st.close();
      setStore(null);
    };
  }, [sb, couple.id, channel, me.id]);
  const snap = useSyncExternalStore(
    (fn) => store?.subscribe(fn) ?? (() => {}),
    () => store?.snapshot() ?? EMPTY,
    () => EMPTY,
  );

  // Their turn, and they're away: a nudge, once per wait.
  const s = snap.game?.state;
  const theirSeat = s ? s.players.findIndex((p) => p.id === partner.id) : -1;
  const theirMove = !!s && s.phase !== 'over' && theirSeat >= 0 && waitingOn(s).includes(theirSeat);
  useEffect(() => {
    if (!theirMove || snap.partnerHere) return;
    const t = setTimeout(() => void notifyPartner(sb, { category: 'isle' }), NUDGE_AFTER_MS);
    return () => clearTimeout(t);
  }, [theirMove, snap.partnerHere, sb]);

  return { store, snap };
}

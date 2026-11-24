import { useEffect, useState, useSyncExternalStore } from 'react';
import { houseApi, housePhotos, likenessUrls } from '../api/house';
import { useCouple } from '../react/couple-provider';
import { likenessOf, type Likeness } from './items';
import { HousePresence } from './presence';
import { HouseStore } from './store';

export interface HouseSession {
  presence: HousePresence | null;
  store: HouseStore | null;
  partnerHere: boolean;
}

/**
 * The house while its screen is open: my presence (hello on the way in, bye
 * on the way out) and everything saved, kept in step with my partner.
 */
export function useHouse(): HouseSession {
  const { sb, couple, channel, me } = useCouple();
  const [session, setSession] = useState<{ presence: HousePresence; store: HouseStore } | null>(null);
  const [partnerHere, setPartnerHere] = useState(false);
  useEffect(() => {
    const presence = new HousePresence(me.id, { send: (e) => channel.sendHouse(e), on: (fn) => channel.house.on(fn) });
    const store = new HouseStore(houseApi(sb, couple.id), (op) => presence.sendItem(op));
    const offItems = presence.onItem((op) => store.receive(op));
    const offHere = presence.onPartnerHere(setPartnerHere);
    // After a dropped connection, what changed meanwhile.
    const offResync = channel.resync.on(() => void store.load().catch(() => {}));
    void store.load().catch(() => {});
    setSession({ presence, store });
    return () => {
      offItems();
      offHere();
      offResync();
      presence.dispose();
      setSession(null);
      setPartnerHere(false);
    };
  }, [sb, couple.id, channel, me.id]);
  return { presence: session?.presence ?? null, store: session?.store ?? null, partnerHere };
}

/** Re-renders when anything saved in the house changes. */
export function useHouseItems(store: HouseStore | null) {
  return useSyncExternalStore(
    (fn) => store?.subscribe(fn) ?? (() => {}),
    () => store?.items() ?? EMPTY,
    () => EMPTY,
  );
}

const EMPTY = new Map();

/** Our memory photos for the TV and the frames, fetched once per visit. */
export function useHousePhotos(): { path: string; url: string }[] {
  const { sb, couple } = useCouple();
  const [photos, setPhotos] = useState<{ path: string; url: string }[]>([]);
  useEffect(() => {
    let live = true;
    void housePhotos(sb, couple.id)
      .then((p) => live && setPhotos(p))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sb, couple.id]);
  return photos;
}

/** Where to load each of us as ourselves from: a link, or (on a phone) what `keep` stored it as. */
export type KeepLikeness = (who: Likeness, url: string) => Promise<string>;

/** The two of us as ourselves, for whichever of us has one; fetched once per visit. */
export function useLikeness(keep?: KeepLikeness): Partial<Record<Likeness, string>> {
  const { sb, couple, me, partner } = useCouple();
  const [found, setFound] = useState<Partial<Record<Likeness, string>>>({});
  useEffect(() => {
    const who = [likenessOf(me.id), likenessOf(partner.id)].filter((w): w is Likeness => !!w);
    if (!who.length) return;
    let live = true;
    void likenessUrls(sb, couple.id, who)
      .then(async (urls) => {
        const out: Partial<Record<Likeness, string>> = {};
        for (const w of who) {
          const url = urls[w];
          if (url) out[w] = keep ? await keep(w, url).catch(() => undefined) : url;
        }
        if (live) setFound(out);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sb, couple.id, me.id, partner.id, keep]);
  return found;
}

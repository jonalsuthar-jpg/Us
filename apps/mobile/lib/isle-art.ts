import type { HexArt } from '@us/shared/isle';
import { Asset } from 'expo-asset';
import { useEffect, useState } from 'react';

/**
 * The tiles' pictures, bundled with the app (scripts/build-isle-hexes.mjs).
 * The board's texture loader takes these modules as they are.
 */
export const HEX_ART: HexArt = {
  wood: require('../assets/isle/hex/forest.png'),
  wool: require('../assets/isle/hex/pasture.png'),
  grain: require('../assets/isle/hex/fields.png'),
  brick: require('../assets/isle/hex/hills.png'),
  ore: require('../assets/isle/hex/mountains.png'),
  desert: require('../assets/isle/hex/desert.png'),
};

/** Isle's card pictures, bundled with the app (scripts/build-isle-art.mjs). */
const FILES: Record<string, number> = {
  card_brick: require('../assets/isle/art/card_brick.jpg'),
  card_grain: require('../assets/isle/art/card_grain.jpg'),
  card_ore: require('../assets/isle/art/card_ore.jpg'),
  card_wood: require('../assets/isle/art/card_wood.jpg'),
  card_wool: require('../assets/isle/art/card_wool.jpg'),
  dev_knight: require('../assets/isle/art/dev_knight.jpg'),
  dev_monopoly: require('../assets/isle/art/dev_monopoly.jpg'),
  dev_plenty: require('../assets/isle/art/dev_plenty.jpg'),
  dev_roads: require('../assets/isle/art/dev_roads.jpg'),
  dev_vp: require('../assets/isle/art/dev_vp.jpg'),
};

export interface IsleArtFiles {
  /** card_wood … card_ore and dev_knight … dev_monopoly, by name, as local files. */
  cards: Record<string, string>;
}

let ready: Promise<IsleArtFiles> | null = null;

/** The pictures as local files Image can show (resolved once per app run). */
export function loadIsleArt(): Promise<IsleArtFiles> {
  ready ??= (async () => {
    const cards: Record<string, string> = {};
    await Promise.all(
      Object.entries(FILES).map(async ([name, mod]) => {
        const a = Asset.fromModule(mod);
        await a.downloadAsync();
        cards[name] = a.localUri ?? a.uri;
      }),
    );
    return { cards };
  })();
  // A failed load can be tried again next time.
  ready.catch(() => (ready = null));
  return ready;
}

/** The pictures once they're ready; cards show their colour until then. */
export function useIsleArt(): IsleArtFiles | null {
  const [art, setArt] = useState<IsleArtFiles | null>(null);
  useEffect(() => {
    let live = true;
    void loadIsleArt()
      .then((a) => live && setArt(a))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return art;
}

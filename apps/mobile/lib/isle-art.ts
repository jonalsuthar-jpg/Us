import { ART_LAND, type IsleArt, type Terrain } from '@us/shared/isle';
import { Asset } from 'expo-asset';
import { useEffect, useState } from 'react';

/** Isle's pictures, bundled with the app (scripts/build-isle-art.mjs). */
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
  sea: require('../assets/isle/art/sea.jpg'),
  tile_desert_1: require('../assets/isle/art/tile_desert_1.jpg'),
  tile_desert_2: require('../assets/isle/art/tile_desert_2.jpg'),
  tile_fields_1: require('../assets/isle/art/tile_fields_1.jpg'),
  tile_fields_2: require('../assets/isle/art/tile_fields_2.jpg'),
  tile_forest_1: require('../assets/isle/art/tile_forest_1.jpg'),
  tile_forest_2: require('../assets/isle/art/tile_forest_2.jpg'),
  tile_hills_1: require('../assets/isle/art/tile_hills_1.jpg'),
  tile_hills_2: require('../assets/isle/art/tile_hills_2.jpg'),
  tile_mountains_1: require('../assets/isle/art/tile_mountains_1.jpg'),
  tile_mountains_2: require('../assets/isle/art/tile_mountains_2.jpg'),
  tile_pasture_1: require('../assets/isle/art/tile_pasture_1.jpg'),
  tile_pasture_2: require('../assets/isle/art/tile_pasture_2.jpg'),
};

export interface IsleArtFiles {
  /** For the board: the tile pictures and the frame's water. */
  board: IsleArt;
  /** For the cards: card_wood … card_ore and dev_knight … dev_monopoly, by name. */
  cards: Record<string, string>;
}

let ready: Promise<IsleArtFiles> | null = null;

/** The pictures as local files three.js and Image can load (resolved once per app run). */
export function loadIsleArt(): Promise<IsleArtFiles> {
  ready ??= (async () => {
    const uri: Record<string, string> = {};
    await Promise.all(
      Object.entries(FILES).map(async ([name, mod]) => {
        const a = Asset.fromModule(mod);
        await a.downloadAsync();
        uri[name] = a.localUri ?? a.uri;
      }),
    );
    const tiles: Partial<Record<Terrain, string[]>> = {};
    for (const [t, land] of Object.entries(ART_LAND) as [Terrain, string][]) tiles[t] = [1, 2].map((v) => uri[`tile_${land}_${v}`]!);
    const cards = Object.fromEntries(Object.entries(uri).filter(([n]) => n.startsWith('card_') || n.startsWith('dev_')));
    return { board: { tiles, sea: uri.sea }, cards };
  })();
  // A failed load can be tried again next time.
  ready.catch(() => (ready = null));
  return ready;
}

/** The pictures once they're ready; the board shows plain colours until then. */
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

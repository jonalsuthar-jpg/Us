import type { Json } from '../database.types';
import { HOUSE_PACK_VERSION } from '../house/pack';
import { StaleHouseError, type HouseApi, type HouseRow } from '../house/store';
import type { UsClient } from '../supabase';
import { listMemories, memoryPhotos, signedPhotoUrls } from './memory';

/**
 * Our House on the server: the saved things (house_items) and the photos
 * the TV and the frames show.
 */
export function houseApi(sb: UsClient, coupleId: string): HouseApi {
  return {
    async load(): Promise<HouseRow[]> {
      const { data, error } = await sb.from('house_items').select('item_key, state, version').eq('couple_id', coupleId);
      if (error) throw error;
      return (data ?? []).map((r) => ({ key: r.item_key, state: (r.state ?? {}) as Record<string, unknown>, version: r.version }));
    },
    async save(key, state, version) {
      const { data, error } = await sb.rpc('set_house_item', { p_key: key, p_state: state as Json | null, p_version: version });
      if (error) {
        if (error.message?.includes('stale')) throw new StaleHouseError();
        throw error;
      }
      return data ?? 0;
    },
  };
}

/** Our latest memory photos, newest first, as short-lived links for the TV and frames. */
export async function housePhotos(sb: UsClient, coupleId: string, max = 24): Promise<{ path: string; url: string }[]> {
  const memories = await listMemories(sb, coupleId);
  const paths = memories.flatMap((m) => memoryPhotos(m)).slice(0, max);
  if (!paths.length) return [];
  const urls = await signedPhotoUrls(sb, paths, 60 * 60);
  return paths.filter((p) => urls[p]).map((p) => ({ path: p, url: urls[p]! }));
}

/** Where Our House's art pack is: house/v<version> on the media Worker. */
export async function housePackBase(sb: UsClient): Promise<string> {
  const { data, error } = await sb.functions.invoke('media', { body: { action: 'house' } });
  if (error) throw error;
  const base = (data as { base?: unknown } | null)?.base;
  if (typeof base !== 'string' || !/^https:\/\//.test(base)) throw new Error('No house pack address');
  return `${base}/v${HOUSE_PACK_VERSION}`;
}

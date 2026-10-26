import type { UsClient } from '../supabase';
import { MEMORY_BUCKET } from './memory';
import { CHAT_BUCKET } from './messages';
import { SNAPS_BUCKET } from './snaps';
import { DRAW_BUCKET } from './draw';

/** Buckets that keep files under "<couple_id>/". */
export const COUPLE_BUCKETS = [MEMORY_BUCKET, CHAT_BUCKET, SNAPS_BUCKET, DRAW_BUCKET];

/**
 * Delete every file in the couple's Storage folders (memories, the photo of
 * us, chat photos and voice notes, snaps). SQL can't reach Storage, so this runs
 * before the couple row goes.
 */
export async function removeCouplePhotos(sb: UsClient, coupleId: string): Promise<void> {
  for (const name of COUPLE_BUCKETS) {
    const bucket = sb.storage.from(name);
    // Each pass lists from the start again, since removed files drop out of the listing.
    for (let pass = 0; pass < 100; pass++) {
      const { data, error } = await bucket.list(coupleId, { limit: 500 });
      if (error) throw error;
      const paths = (data ?? []).filter((f) => f.id).map((f) => `${coupleId}/${f.name}`);
      if (!paths.length) break;
      const { error: removeError } = await bucket.remove(paths);
      if (removeError) throw removeError;
    }
  }
}

/**
 * End the pairing for both of us. Everything we shared (messages, plans,
 * memories and their photos, questions) is deleted; private data stays with
 * its owner. Both people can pair again afterwards.
 */
export async function unpair(sb: UsClient, coupleId: string): Promise<void> {
  await removeCouplePhotos(sb, coupleId);
  const { error } = await sb.rpc('unpair');
  if (error) throw error;
}

/**
 * Delete my account and everything in it. If I'm paired, the pairing and
 * everything we shared go too. Runs in the delete-account Edge Function,
 * since removing an auth user needs the service role.
 */
export async function deleteAccount(sb: UsClient): Promise<void> {
  const { data, error } = await sb.functions.invoke('delete-account', { body: {} });
  if (error) throw error;
  if (data && typeof data === 'object' && 'error' in data) throw new Error(String((data as { error: unknown }).error));
}

import type { UsClient } from '../supabase';
import { MEMORY_BUCKET } from './memory';

/**
 * Delete every photo in the couple's Storage folder (memories and the photo
 * of us). SQL can't reach Storage, so this runs before the couple row goes.
 */
export async function removeCouplePhotos(sb: UsClient, coupleId: string): Promise<void> {
  const bucket = sb.storage.from(MEMORY_BUCKET);
  // Each pass lists from the start again, since removed files drop out of the listing.
  for (let pass = 0; pass < 100; pass++) {
    const { data, error } = await bucket.list(coupleId, { limit: 500 });
    if (error) throw error;
    const paths = (data ?? []).filter((f) => f.id).map((f) => `${coupleId}/${f.name}`);
    if (!paths.length) return;
    const { error: removeError } = await bucket.remove(paths);
    if (removeError) throw removeError;
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

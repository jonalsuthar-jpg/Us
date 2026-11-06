import type { UsClient } from '../supabase';
import { MEMORY_BUCKET } from './memory';
import { CHAT_BUCKET } from './messages';
import { SNAPS_BUCKET } from './snaps';
import { DRAW_BUCKET } from './draw';
import { removeCoupleVideos } from './chat-video';
import { removeAllFiles } from './media';

/** Buckets that keep files under "<couple_id>/". */
export const COUPLE_BUCKETS = [MEMORY_BUCKET, CHAT_BUCKET, SNAPS_BUCKET, DRAW_BUCKET];

/**
 * Delete every file in the couple's folders (memories, the photo of us, chat
 * photos and voice notes, snaps, drawings, birthday). The database can't
 * reach R2, so this runs before the couple row goes.
 */
export async function removeCouplePhotos(sb: UsClient, _coupleId: string): Promise<void> {
  await removeAllFiles(sb);
}

/**
 * End the pairing for both of us. Everything we shared (messages, plans,
 * memories and their photos, questions) is deleted; private data stays with
 * its owner. Both people can pair again afterwards.
 */
export async function unpair(sb: UsClient, coupleId: string): Promise<void> {
  await removeCouplePhotos(sb, coupleId);
  await removeCoupleVideos(sb);
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

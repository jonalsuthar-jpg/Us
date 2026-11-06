import { fileKeyVersion, isEncryptedReaction, type ChatCipher } from '../crypto/chat-cipher';
import type { MessageRow } from '../database.types';
import type { UsClient } from '../supabase';
import { CHAT_BUCKET, chatMediaUrls, ENCRYPTED_MIME } from './messages';
import { listStickers } from './stickers';
import { uploadFile } from './media';

const BATCH = 50;

const MIME_OF_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  gif: 'image/gif',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

const mimeOf = (path: string) => MIME_OF_EXT[path.split('.').pop()?.toLowerCase() ?? ''] ?? null;

/**
 * Encrypt one of our chat files where it is: fetched, sealed on this device
 * and written back over itself. A file that's already encrypted, or gone, is
 * left alone.
 */
async function sealFileInPlace(sb: UsClient, cipher: ChatCipher, path: string, signed: string | undefined): Promise<void> {
  // A file that's gone (removed with an old account) has nothing to seal.
  if (!signed) return;
  const res = await fetch(signed);
  if (res.status === 400 || res.status === 404) return;
  if (!res.ok) throw new Error(`file_${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (fileKeyVersion(bytes) !== null) return;
  await uploadFile(sb, CHAT_BUCKET, path, cipher.encryptFile(path, bytes), ENCRYPTED_MIME);
}

/**
 * One pass over the thread's messages from before encryption, oldest first:
 * files are sealed in place, then text, media details and reactions go into
 * ciphertext and the plain copies are cleared on the server. Returns how
 * many were done; 0 means nothing is left. Safe to run on two devices at
 * once (each message is only converted once).
 */
export async function encryptLegacyBatch(sb: UsClient, coupleId: string, cipher: ChatCipher): Promise<number> {
  const { data, error } = await sb
    .from('messages')
    .select('*')
    .eq('couple_id', coupleId)
    .eq('kind', 'text')
    .is('ciphertext', null)
    .order('created_at', { ascending: true })
    .limit(BATCH);
  if (error) throw error;
  const rows = (data ?? []) as MessageRow[];
  if (!rows.length) return 0;

  // Photos, voice notes and our own sticker files (a sticker file may be in several messages; it's sealed once).
  const files = [...new Set(rows.map((m) => m.media_path).filter((p): p is string => !!p))];
  const signed = files.length ? await chatMediaUrls(sb, files, 600) : {};
  const sealed = new Set<string>();

  for (const m of rows) {
    const hasFile = !!m.media_path;
    if (hasFile && !sealed.has(m.media_path!)) {
      await sealFileInPlace(sb, cipher, m.media_path!, signed[m.media_path!]);
      sealed.add(m.media_path!);
    }
    const reactions: Record<string, string> = {};
    for (const [user, emoji] of Object.entries(m.reactions ?? {})) {
      reactions[user] = isEncryptedReaction(emoji) ? emoji : cipher.encryptReaction(m.id, user, emoji);
    }
    const ciphertext = cipher.encryptMessage(m, { body: m.body, meta: m.media_meta, mime: hasFile ? mimeOf(m.media_path!) : null });
    const { error: rpcError } = await sb.rpc('encrypt_legacy_message', {
      p_id: m.id,
      p_ciphertext: ciphertext,
      p_key_version: cipher.version,
      p_reactions: reactions,
    });
    if (rpcError) throw rpcError;
  }
  return rows.length;
}

/** Seal our saved sticker files that are still plain. */
export async function encryptLegacyStickers(sb: UsClient, coupleId: string, cipher: ChatCipher): Promise<void> {
  const stickers = await listStickers(sb, coupleId);
  if (!stickers.length) return;
  const signed = await chatMediaUrls(sb, stickers.map((s) => s.path), 600);
  for (const s of stickers) await sealFileInPlace(sb, cipher, s.path, signed[s.path]);
}

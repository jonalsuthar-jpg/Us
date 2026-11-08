import type { ChatCipher } from '../crypto/chat-cipher';
import type { Sticker } from '../database.types';
import type { UsClient } from '../supabase';
import { uuid } from '../uuid';
import { CHAT_BUCKET, ENCRYPTED_MIME, toBytes } from './messages';
import { removeFiles, uploadFile } from './media';

/** "Our stickers changed" ping on the couple channel. */
export const STICKERS_TOPIC = 'stickers';
/** Stickers are saved at this size (like WhatsApp's), transparent PNG. */
export const STICKER_SIZE = 512;

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

/** The picture types a sticker file can be: ours are PNG; ones from the keyboard may be animated WebP or GIF. */
const STICKER_EXT = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' } as const;
export type StickerMime = keyof typeof STICKER_EXT;
export const isStickerMime = (mime: string): mime is StickerMime => mime in STICKER_EXT;

/** Sticker files sit at the top of our chat folder, so unpairing's cleanup finds them. */
export const stickerPath = (coupleId: string, id: string = uuid(), mime: StickerMime = 'image/png') => `${coupleId}/sticker-${id}.${STICKER_EXT[mime]}`;

export const isOurStickerPath = (path: string | null | undefined) => !!path && /\/sticker-[0-9a-f-]{36}\.(png|webp|gif)$/.test(path);

/** A sticker file's picture type, from its name. */
export function stickerMime(path: string): StickerMime {
  if (path.endsWith('.gif')) return 'image/gif';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

/** Upload a sticker I made (or picked on the keyboard: `mime` then says what it is) and keep it in Ours. With a cipher the file is encrypted (its path stays the same shape). */
export async function saveSticker(
  sb: UsClient,
  s: { coupleId: string; me: string; png: Blob | ArrayBuffer | Uint8Array; mime?: StickerMime; width?: number; height?: number; cipher?: ChatCipher | null },
): Promise<Sticker> {
  const mime = s.mime ?? 'image/png';
  const path = stickerPath(s.coupleId, uuid(), mime);
  if (s.cipher) await uploadFile(sb, CHAT_BUCKET, path, s.cipher.encryptFile(path, await toBytes(s.png)), ENCRYPTED_MIME);
  else await uploadFile(sb, CHAT_BUCKET, path, s.png, mime);
  try {
    return unwrap(
      await sb
        .from('stickers')
        .insert({ couple_id: s.coupleId, created_by: s.me, path, width: s.width ?? STICKER_SIZE, height: s.height ?? STICKER_SIZE })
        .select('*')
        .single(),
    );
  } catch (e) {
    await removeFiles(sb, CHAT_BUCKET, [path]).catch(() => {});
    throw e;
  }
}

/** Keep a sticker my partner sent (already a file in our folder). Saving one that's already in Ours does nothing. */
export async function keepSticker(sb: UsClient, coupleId: string, me: string, path: string, size?: { width?: number; height?: number }): Promise<void> {
  const { error } = await sb.from('stickers').insert({
    couple_id: coupleId,
    created_by: me,
    path,
    width: size?.width ?? STICKER_SIZE,
    height: size?.height ?? STICKER_SIZE,
  });
  if (error && (error as { code?: string }).code !== '23505') throw error;
}

export async function listStickers(sb: UsClient, coupleId: string): Promise<Sticker[]> {
  return unwrap(await sb.from('stickers').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(300));
}

/**
 * Take a sticker out of Ours. The file stays: messages that were sent with it
 * still show it.
 */
export async function removeSticker(sb: UsClient, id: string): Promise<void> {
  unwrap(await sb.from('stickers').delete().eq('id', id));
}

/** Text on a sticker: a few looks that read on any photo. Both apps draw them the same way. */
export const STICKER_TEXT_STYLES = [
  { id: 'outline', name: 'Outline', fill: '#FFFFFF', stroke: '#15121A', bg: null },
  { id: 'pop', name: 'Pop', fill: '#FFE14D', stroke: '#15121A', bg: null },
  { id: 'bubble', name: 'Bubble', fill: '#15121A', stroke: null, bg: '#FFFFFF' },
  { id: 'rose', name: 'Rose', fill: '#FFFFFF', stroke: null, bg: '#F5547C' },
] as const;
export type StickerTextStyle = (typeof STICKER_TEXT_STYLES)[number]['id'];

export interface StickerText {
  id: string;
  text: string;
  style: StickerTextStyle;
  /** Centre, as a share of the sticker's width and height (0–1). */
  x: number;
  y: number;
  /** Font size as a share of the sticker's width. */
  size: number;
}

/** Rough text box (share of width) for hit areas and bubbles; Inter Bold runs about 0.58 em per letter. */
export function stickerTextBox(t: Pick<StickerText, 'text' | 'size'>): { w: number; h: number } {
  return { w: Math.max(0.12, t.text.length * t.size * 0.58 + t.size * 0.6), h: t.size * 1.45 };
}

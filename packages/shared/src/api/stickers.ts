import type { Sticker } from '../database.types';
import type { UsClient } from '../supabase';
import { uuid } from '../uuid';
import { CHAT_BUCKET } from './messages';

/** "Our stickers changed" ping on the couple channel. */
export const STICKERS_TOPIC = 'stickers';
/** Stickers are saved at this size (like WhatsApp's), transparent PNG. */
export const STICKER_SIZE = 512;

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

/** Sticker files sit at the top of our chat folder, so unpairing's cleanup finds them. */
export const stickerPath = (coupleId: string, id: string = uuid()) => `${coupleId}/sticker-${id}.png`;

export const isOurStickerPath = (path: string | null | undefined) => !!path && /\/sticker-[0-9a-f-]{36}\.(png|webp)$/.test(path);

/** Upload a sticker I made and keep it in Ours. */
export async function saveSticker(
  sb: UsClient,
  s: { coupleId: string; me: string; png: Blob | ArrayBuffer | Uint8Array; width?: number; height?: number },
): Promise<Sticker> {
  const path = stickerPath(s.coupleId);
  const { error } = await sb.storage.from(CHAT_BUCKET).upload(path, s.png, { contentType: 'image/png', upsert: false });
  if (error) throw error;
  try {
    return unwrap(
      await sb
        .from('stickers')
        .insert({ couple_id: s.coupleId, created_by: s.me, path, width: s.width ?? STICKER_SIZE, height: s.height ?? STICKER_SIZE })
        .select('*')
        .single(),
    );
  } catch (e) {
    await sb.storage.from(CHAT_BUCKET).remove([path]).catch(() => {});
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

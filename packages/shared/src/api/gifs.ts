/**
 * GIFs and stickers from GIPHY. Messages keep GIPHY's own media URL (GIPHY
 * asks apps to link rather than re-host), and the database only accepts URLs
 * on GIPHY's media hosts — see the gifs migration.
 */

import type { UsClient } from '../supabase';

export type GifKind = 'gif' | 'sticker';

export interface Gif {
  id: string;
  /** Small preview for the picker. */
  previewUrl: string;
  /** What goes in the message. */
  url: string;
  /** A still first frame: shown at once while the GIF itself loads. */
  still?: string;
  width: number;
  height: number;
  title: string;
}

interface GiphyImage {
  url?: string;
  /** The same, as animated WebP: much smaller than the GIF. */
  webp?: string;
  width?: string;
  height?: string;
}
interface GiphyItem {
  id: string;
  title?: string;
  images: Record<string, GiphyImage | undefined>;
}

const GIPHY_MEDIA = /^https:\/\/media[0-9]*\.giphy\.com\//;

export function isGiphyUrl(url: string | undefined | null): url is string {
  return !!url && GIPHY_MEDIA.test(url);
}

/** Trending when the search is empty. Asked through our giphy function, which holds the key; PG-13. */
export async function searchGifs(sb: UsClient, kind: GifKind, query: string, offset = 0): Promise<Gif[]> {
  const { data, error } = await sb.functions.invoke<{ data: GiphyItem[] }>('giphy', { body: { kind, q: query.trim(), offset } });
  if (error || !data) throw new Error('GIFs aren’t available right now.');
  return data.data.flatMap((g) => {
    const send = g.images.downsized ?? g.images.fixed_width ?? g.images.original;
    const preview = g.images.fixed_width ?? send;
    const previewUrl = isGiphyUrl(preview?.webp) ? preview.webp : preview?.url;
    const still = g.images.fixed_width_still?.url ?? g.images['480w_still']?.url;
    if (!isGiphyUrl(send?.url) || !isGiphyUrl(previewUrl)) return [];
    return [
      {
        id: g.id,
        previewUrl,
        url: send.url,
        still: isGiphyUrl(still) ? still : undefined,
        width: Number(send.width) || 200,
        height: Number(send.height) || 200,
        title: g.title || (kind === 'sticker' ? 'Sticker' : 'GIF'),
      },
    ];
  });
}

/** The GIFs and stickers I sent last, newest first, for the picker's "Recent" row. */
export const RECENT_GIFS = 24;
export function rememberGif(recent: Gif[], gif: Gif): Gif[] {
  return [gif, ...recent.filter((g) => g.id !== gif.id)].slice(0, RECENT_GIFS);
}

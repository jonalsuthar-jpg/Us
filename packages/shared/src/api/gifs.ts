/**
 * GIFs and stickers from GIPHY. Messages keep GIPHY's own media URL (GIPHY
 * asks apps to link rather than re-host), and the database only accepts URLs
 * on GIPHY's media hosts — see the gifs migration.
 */

export type GifKind = 'gif' | 'sticker';

export interface Gif {
  id: string;
  /** Small preview for the picker. */
  previewUrl: string;
  /** What goes in the message. */
  url: string;
  width: number;
  height: number;
  title: string;
}

interface GiphyImage {
  url?: string;
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

/** Trending when the search is empty. Keeps results to a PG-13 rating. */
export async function searchGifs(apiKey: string, kind: GifKind, query: string, offset = 0, limit = 24): Promise<Gif[]> {
  const type = kind === 'sticker' ? 'stickers' : 'gifs';
  const q = query.trim();
  const params = new URLSearchParams({ api_key: apiKey, limit: String(limit), offset: String(offset), rating: 'pg-13', bundle: 'messaging_non_clips' });
  if (q) params.set('q', q);
  const res = await fetch(`https://api.giphy.com/v1/${type}/${q ? 'search' : 'trending'}?${params}`);
  if (!res.ok) throw new Error('GIFs are unavailable right now.');
  const { data } = (await res.json()) as { data: GiphyItem[] };
  return data.flatMap((g) => {
    const send = g.images.downsized ?? g.images.fixed_width ?? g.images.original;
    const preview = g.images.fixed_width ?? send;
    if (!isGiphyUrl(send?.url) || !isGiphyUrl(preview?.url)) return [];
    return [
      {
        id: g.id,
        previewUrl: preview.url,
        url: send.url,
        width: Number(send.width) || 200,
        height: Number(send.height) || 200,
        title: g.title || (kind === 'sticker' ? 'Sticker' : 'GIF'),
      },
    ];
  });
}

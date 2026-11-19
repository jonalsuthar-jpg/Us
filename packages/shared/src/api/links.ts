/**
 * Links in chat: found in the text on the device, opened as links, and
 * previewed with a small card. The preview is fetched by the sender's app
 * through the link-preview function and travels inside the encrypted message,
 * so the server learns a URL was looked up but never which message holds it.
 */
import type { MediaMeta } from '../database.types';
import type { UsClient } from '../supabase';

export type TextPart = { text: string; href?: undefined } | { text: string; href: string };

// http(s)://… or www.…; stops at whitespace and angle brackets.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>]+/gi;
// Punctuation that usually ends a sentence rather than the link.
const TRAILING = /[.,;:!?'"”’)\]}]+$/;

/** Split text into plain runs and links, for rendering. Plain text comes back as one part. */
export function linkParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let raw = m[0];
    // Keep a closing bracket that belongs to the URL, like a Wikipedia "(film)".
    const trail = raw.match(TRAILING)?.[0] ?? '';
    if (trail) {
      let cut = trail;
      if (cut.startsWith(')') && (raw.match(/\(/g)?.length ?? 0) >= (raw.match(/\)/g)?.length ?? 0)) cut = cut.slice(1);
      raw = raw.slice(0, raw.length - cut.length);
    }
    const start = m.index!;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: raw, href: raw.toLowerCase().startsWith('www.') ? `https://${raw}` : raw });
    last = start + raw.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts.length ? parts : [{ text }];
}

/** The first link in the text, ready to open, or null. */
export function firstLink(text: string | null | undefined): string | null {
  if (!text) return null;
  return linkParts(text).find((p) => p.href)?.href ?? null;
}

export interface LinkPreview {
  url: string;
  title: string;
  description?: string;
  image?: string;
  host: string;
}

/** Ask the link-preview function about a URL; null when it has nothing (or takes too long). */
export async function fetchLinkPreview(sb: UsClient, url: string, timeoutMs = 2500): Promise<LinkPreview | null> {
  const call = sb.functions.invoke('link-preview', { body: { url } }).then(({ data, error }) => {
    if (error || !data || typeof data !== 'object' || !('title' in data)) return null;
    return data as LinkPreview;
  });
  const late = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
  return Promise.race([call.catch(() => null), late]);
}

/** A preview as message details (strings only, so it fits MediaMeta and its encryption). */
export function previewMeta(p: LinkPreview): MediaMeta {
  const meta: MediaMeta = { link_url: p.url, link_title: p.title, link_host: p.host };
  if (p.description) meta.link_desc = p.description;
  if (p.image) meta.link_image = p.image;
  return meta;
}

/** The preview carried by a message, if any. */
export function linkPreviewOf(meta: MediaMeta | null | undefined): LinkPreview | null {
  if (!meta || typeof meta.link_url !== 'string' || typeof meta.link_title !== 'string') return null;
  return {
    url: meta.link_url,
    title: meta.link_title,
    host: typeof meta.link_host === 'string' ? meta.link_host : '',
    description: typeof meta.link_desc === 'string' ? meta.link_desc : undefined,
    image: typeof meta.link_image === 'string' && meta.link_image.startsWith('https://') ? meta.link_image : undefined,
  };
}

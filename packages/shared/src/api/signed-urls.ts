import { readCache, writeCache } from '../react/data-cache';
import type { UsClient } from '../supabase';

/** Links are signed for this long unless the caller asks otherwise. */
export const LINK_LIFETIME_S = 6 * 3600;
/** A kept link with less than this left is signed again. */
const MARGIN_MS = 10 * 60_000;

type Kept = Record<string, { url: string; until: number }>;

const keyFor = (bucket: string) => `signed:${bucket}`;

/**
 * Signed links for private files, keyed by path. A link is reused for as
 * long as it stays well within its lifetime, so the same file keeps the same
 * URL and the browser / image cache can serve it instead of downloading it
 * again. Kept links go through data-cache, so they survive a cold start on
 * the phone and are wiped with it on sign-out.
 */
export async function signedUrls(sb: UsClient, bucket: string, paths: string[], expiresIn = LINK_LIFETIME_S): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const now = Date.now();
  const kept = readCache<Kept>(keyFor(bucket)) ?? {};
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of unique) {
    const k = kept[p];
    // Good enough if it lasts a while yet, or as long as a fresh one would.
    if (k && (k.until - now >= MARGIN_MS || k.until >= now + expiresIn * 1000)) out[p] = k.url;
    else missing.push(p);
  }
  if (!missing.length) return out;
  const { data, error } = await sb.storage.from(bucket).createSignedUrls(missing, expiresIn);
  if (error) throw error;
  const next: Kept = {};
  for (const [p, k] of Object.entries(readCache<Kept>(keyFor(bucket)) ?? {})) if (k.until > now) next[p] = k;
  for (const row of data ?? []) {
    if (!row.path || !row.signedUrl) continue;
    out[row.path] = row.signedUrl;
    next[row.path] = { url: row.signedUrl, until: now + expiresIn * 1000 };
  }
  writeCache(keyFor(bucket), next);
  return out;
}

/** Forget a file's link (it was deleted or replaced). */
export function forgetSignedUrl(bucket: string, path: string) {
  const kept = readCache<Kept>(keyFor(bucket));
  if (!kept?.[path]) return;
  const { [path]: _gone, ...rest } = kept;
  writeCache(keyFor(bucket), rest);
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { chatMediaUrls } from '../api/messages';
import type { Message } from '../database.types';
import { useCouple } from './couple-provider';
import { cacheKey, readCache, writeCache } from './data-cache';

/** Signed links last 6 hours; one this close to running out is asked for again. */
const LIFETIME_MS = 6 * 3600_000;
const MARGIN_MS = 30 * 60_000;

type Signed = Record<string, { url: string; at: number }>;

/**
 * Signed URLs for the photos and voice notes in the loaded thread, fetched in
 * batches as new media appears. Paths that fail to sign are retried on the
 * next change rather than every render. Links still well within their
 * lifetime are kept, so a reopened chat shows its pictures at once.
 */
export function useChatMedia(messages: Pick<Message, 'media_path'>[]): Record<string, string> {
  const { sb, couple } = useCouple();
  const key = cacheKey(couple.id, 'chat:media');
  const [urls, setUrls] = useState<Record<string, string>>(() => {
    const fresh: Record<string, string> = {};
    const now = Date.now();
    for (const [p, s] of Object.entries(readCache<Signed>(key) ?? {})) if (now - s.at < LIFETIME_MS - MARGIN_MS) fresh[p] = s.url;
    return fresh;
  });
  const asked = useRef(new Set<string>());

  // Worked out once per change: the thread also redraws for typing pings and the like.
  const missing = useMemo(
    () => messages.map((m) => m.media_path).filter((p): p is string => !!p && !urls[p] && !asked.current.has(p)),
    [messages, urls],
  );
  const missingKey = missing.join('|');

  useEffect(() => {
    if (!missing.length) return;
    const batch = missing;
    batch.forEach((p) => asked.current.add(p));
    // Results are always kept (they're valid for hours), even if the thread moved on.
    chatMediaUrls(sb, batch)
      .then((next) => {
        setUrls((prev) => ({ ...prev, ...next }));
        const now = Date.now();
        const saved = { ...(readCache<Signed>(key) ?? {}) };
        for (const [p, s] of Object.entries(saved)) if (now - s.at >= LIFETIME_MS - MARGIN_MS) delete saved[p];
        for (const [p, url] of Object.entries(next)) saved[p] = { url, at: now };
        writeCache(key, saved);
      })
      .catch(() => batch.forEach((p) => asked.current.delete(p)));
    // `missingKey` captures `missing`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, key, missingKey]);

  return urls;
}

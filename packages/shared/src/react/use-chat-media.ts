import { useEffect, useMemo, useRef, useState } from 'react';
import { openChatMedia, type MediaRequest } from '../api/chat-media';
import { chatMediaUrls } from '../api/messages';
import { isOurStickerPath, stickerMime } from '../api/stickers';
import type { Message } from '../database.types';
import { useChatKey } from './chat-key-provider';
import { useCouple } from './couple-provider';
import { cacheKey, readCache, writeCache } from './data-cache';

/** Signed links last 6 hours; one this close to running out is asked for again. */
const LIFETIME_MS = 6 * 3600_000;
const MARGIN_MS = 30 * 60_000;

type Signed = Record<string, { url: string; at: number }>;

/** Encrypted messages' files, and our sticker files (which may have been encrypted after the fact), are opened on the device. */
export const isSealedMedia = (m: Pick<Message, 'media_path' | 'ciphertext'>) => !!m.media_path && (!!m.ciphertext || isOurStickerPath(m.media_path));

/**
 * Links for the photos and voice notes in the loaded thread, fetched in
 * batches as new media appears. Plain files get signed URLs (kept while
 * well within their lifetime, so a reopened chat shows its pictures at
 * once); encrypted ones are downloaded, opened on this device and shown
 * from a local URI. Paths that fail are retried on the next change rather
 * than every render.
 */
export function useChatMedia(messages: Pick<Message, 'media_path' | 'ciphertext' | 'mime'>[]): Record<string, string> {
  const { sb, couple } = useCouple();
  const { cipher } = useChatKey();
  const key = cacheKey(couple.id, 'chat:media');
  const [urls, setUrls] = useState<Record<string, string>>(() => {
    const fresh: Record<string, string> = {};
    const now = Date.now();
    for (const [p, s] of Object.entries(readCache<Signed>(key) ?? {})) if (now - s.at < LIFETIME_MS - MARGIN_MS) fresh[p] = s.url;
    return fresh;
  });
  const [opened, setOpened] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());

  // A key arriving can open what was locked before.
  useEffect(() => {
    asked.current = new Set([...asked.current].filter((p) => !p.startsWith('sealed:')));
  }, [cipher]);

  // Worked out once per change: the thread also redraws for typing pings and the like.
  const { plain, sealed } = useMemo(() => {
    const plainOut: string[] = [];
    const sealedOut: MediaRequest[] = [];
    for (const m of messages) {
      const p = m.media_path;
      if (!p) continue;
      if (isSealedMedia(m)) {
        if (!opened[p] && !asked.current.has(`sealed:${p}`)) sealedOut.push({ path: p, mime: m.mime ?? (isOurStickerPath(p) ? stickerMime(p) : null) });
      } else if (!urls[p] && !asked.current.has(p)) plainOut.push(p);
    }
    return { plain: plainOut, sealed: sealedOut };
    // `cipher` resets what was asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, urls, opened, cipher]);
  const plainKey = plain.join('|');
  const sealedKey = sealed.map((s) => s.path).join('|');

  useEffect(() => {
    if (!plain.length) return;
    const batch = plain;
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
    // `plainKey` captures `plain`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, key, plainKey]);

  useEffect(() => {
    if (!sealed.length) return;
    const batch = sealed;
    batch.forEach((s) => asked.current.add(`sealed:${s.path}`));
    openChatMedia(sb, cipher, batch)
      .then((next) => {
        setOpened((prev) => ({ ...prev, ...next }));
        // What didn't open can be tried again on the next change.
        batch.forEach((s) => !next[s.path] && asked.current.delete(`sealed:${s.path}`));
      })
      .catch(() => batch.forEach((s) => asked.current.delete(`sealed:${s.path}`)));
    // `sealedKey` captures `sealed`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, cipher, sealedKey]);

  return useMemo(() => ({ ...urls, ...opened }), [urls, opened]);
}

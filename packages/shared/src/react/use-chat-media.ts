import { useEffect, useRef, useState } from 'react';
import { chatMediaUrls } from '../api/messages';
import type { Message } from '../database.types';
import { useCouple } from './couple-provider';

/**
 * Signed URLs for the photos and voice notes in the loaded thread, fetched in
 * batches as new media appears. Paths that fail to sign are retried on the
 * next change rather than every render.
 */
export function useChatMedia(messages: Pick<Message, 'media_path'>[]): Record<string, string> {
  const { sb } = useCouple();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());

  const missing = messages
    .map((m) => m.media_path)
    .filter((p): p is string => !!p && !urls[p] && !asked.current.has(p));
  const key = missing.join('|');

  useEffect(() => {
    if (!missing.length) return;
    const batch = missing;
    batch.forEach((p) => asked.current.add(p));
    // Results are always kept (they're valid for hours), even if the thread moved on.
    chatMediaUrls(sb, batch)
      .then((next) => setUrls((prev) => ({ ...prev, ...next })))
      .catch(() => batch.forEach((p) => asked.current.delete(p)));
    // `key` captures `missing`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, key]);

  return urls;
}

import {
  DRAW_TOPIC,
  drawingToMemory,
  DrawSession,
  saveDrawing,
  signedPhotoUrls,
  type DrawBackground,
  type Drawing,
  type SaveDrawing,
  type Stroke,
} from '@us/shared';
import { useCouple } from '@us/shared/react';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

/** A signed link for a photo background. */
export function useBgPhotoUrl(bg: DrawBackground | null | undefined): string | null {
  const { sb } = useCouple();
  const [url, setUrl] = useState<string | null>(null);
  const path = bg?.kind === 'photo' ? bg.path : null;
  const bucket = bg?.kind === 'photo' ? bg.bucket : null;
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (!path || !bucket) return;
    void (async () => {
      if (bucket === 'memories') {
        const urls = await signedPhotoUrls(sb, [path]);
        if (live) setUrl(urls[path] ?? null);
      } else {
        const { data } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
        if (live) setUrl(data?.signedUrl ?? null);
      }
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [sb, path, bucket]);
  return url;
}

export interface SaveOptions extends Omit<SaveDrawing, 'coupleId' | 'me' | 'strokes' | 'bg' | 'png'> {
  strokes: Stroke[];
  bg?: DrawBackground | null;
  png: Uint8Array;
  toMemory?: boolean;
}

/** Upload, record, optionally keep in Memories, and tell my partner's apps. */
export function useSaveDrawing() {
  const { sb, couple, me, channel } = useCouple();
  return useCallback(
    async (o: SaveOptions): Promise<Drawing> => {
      const { strokes, bg, toMemory, ...rest } = o;
      const d = await saveDrawing(sb, { ...rest, coupleId: couple.id, me: me.id, strokes, bg: bg ?? null });
      if (toMemory) await drawingToMemory(sb, d, me.id, o.title ?? undefined).catch(() => {});
      channel.sendChanged(DRAW_TOPIC);
      return d;
    },
    [sb, couple.id, me.id, channel],
  );
}

/** A canvas only I see until I send it (doodles, daily doodle, my turn). */
export function useLocalSession() {
  const { me } = useCouple();
  const session = useMemo(() => new DrawSession('local', me.id, () => {}), [me.id]);
  const state = useSyncExternalStore(
    (fn) => session.subscribe(fn),
    () => session.snapshot,
    () => session.snapshot,
  );
  return { session, state };
}

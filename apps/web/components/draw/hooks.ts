'use client';

import {
  DRAW_BUCKET,
  DRAW_TOPIC,
  drawingToMemory,
  saveDrawing,
  signedPhotoUrls,
  uuid,
  type DrawBackground,
  type Drawing,
  type SaveDrawing,
  type Stroke,
} from '@us/shared';
import { useCouple } from '@us/shared/react';
import { useCallback, useEffect, useState } from 'react';
import { shrinkPhoto } from '@/lib/image';
import { loadImage, renderPng } from './render';

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

/** Put a photo from this device in our drawings folder, to draw on. */
export async function uploadBackground(sb: ReturnType<typeof useCouple>['sb'], coupleId: string, file: File): Promise<DrawBackground> {
  const { blob, type } = await shrinkPhoto(file, 1600);
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${coupleId}/bg-${uuid()}.${ext}`;
  const { error } = await sb.storage.from(DRAW_BUCKET).upload(path, blob, { contentType: type });
  if (error) throw error;
  return { kind: 'photo', bucket: 'drawings', path };
}

export interface SaveOptions extends Omit<SaveDrawing, 'coupleId' | 'me' | 'png' | 'strokes' | 'bg'> {
  strokes: Stroke[];
  bg?: DrawBackground | null;
  photoUrl?: string | null;
  toMemory?: boolean;
}

/** Render the PNG, upload, record, optionally keep it in Memories, and tell my partner's apps. */
export function useSaveDrawing() {
  const { sb, couple, me, channel } = useCouple();
  return useCallback(
    async (o: SaveOptions): Promise<Drawing> => {
      const photo = o.bg?.kind === 'photo' && o.photoUrl ? await loadImage(o.photoUrl).catch(() => null) : null;
      const png = await renderPng(o.strokes, o.bg, photo);
      const { strokes, bg, photoUrl: _p, toMemory, ...rest } = o;
      const d = await saveDrawing(sb, { ...rest, coupleId: couple.id, me: me.id, strokes, bg: bg ?? null, png });
      if (toMemory) await drawingToMemory(sb, d, me.id, o.title ?? undefined).catch(() => {});
      channel.sendChanged(DRAW_TOPIC);
      return d;
    },
    [sb, couple.id, me.id, channel],
  );
}

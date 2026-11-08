import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';
import { useEffect, useRef, type RefObject } from 'react';
import { findNodeHandle } from 'react-native';

/** A GIF, sticker or image the keyboard (or a paste) put in the field, copied to a local file. */
export interface RichContent {
  uri: string;
  mime: string;
  width: number;
  height: number;
  /** Videos only. */
  durationMs: number;
  size: number;
}

interface UsRichInputNative {
  listen(tag: number): Promise<boolean>;
  stop(tag: number): Promise<void>;
  addListener(event: 'onContent', fn: (e: RichContent & { tag: number }) => void): EventSubscription;
}

/** Android only, and only in app builds that include it; absent elsewhere. */
const native = requireOptionalNativeModule<UsRichInputNative>('UsRichInput');

/** Whether this app build takes GIFs and stickers from the keyboard. */
export const canTakeRichContent = !!native;

/**
 * Let the text field behind `ref` take GIFs and stickers from the keyboard.
 * `active` follows whether the field is on screen, so it's hooked up again
 * when it comes back (it's a new view then).
 */
export function useRichContent(ref: RefObject<unknown>, active: boolean, onContent: ((c: RichContent) => void) | undefined) {
  const latest = useRef(onContent);
  latest.current = onContent;
  const enabled = active && !!onContent;

  useEffect(() => {
    if (!native || !enabled) return;
    const tag = findNodeHandle(ref.current as Parameters<typeof findNodeHandle>[0]);
    if (tag == null) return;
    const sub = native.addListener('onContent', ({ tag: from, ...content }) => {
      if (from === tag) latest.current?.(content);
    });
    void native.listen(tag).catch(() => {});
    return () => {
      sub.remove();
      void native.stop(tag).catch(() => {});
    };
  }, [ref, enabled]);
}

import { useEffect, useRef } from 'react';

export interface ForegroundSource {
  isActive(): boolean;
  subscribe(cb: (active: boolean) => void): () => void;
}

/** The browser tab's visibility; anywhere else, always in front until a platform says otherwise. */
const documentSource: ForegroundSource = {
  isActive: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  subscribe(cb) {
    if (typeof document === 'undefined') return () => {};
    const on = () => cb(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  },
};

let source: ForegroundSource = documentSource;

/** Tell shared code when the app is in front (mobile wires this to AppState). */
export function setForegroundSource(next: ForegroundSource) {
  source = next;
}

/** The app is in front right now. */
export function isForeground(): boolean {
  return source.isActive();
}

/** Follow the app coming to the front (true) and going to the back (false). */
export function onForegroundChange(cb: (active: boolean) => void): () => void {
  return source.subscribe(cb);
}

/**
 * Run `fn` every `ms`, but only while the app is in front. A tick that falls
 * due in the background waits, and runs once as soon as we're back.
 */
export function useForegroundTick(fn: () => void, ms: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let missed = false;
    const tick = setInterval(() => {
      if (source.isActive()) fnRef.current();
      else missed = true;
    }, ms);
    const off = source.subscribe((active) => {
      if (!active || !missed) return;
      missed = false;
      fnRef.current();
    });
    return () => {
      clearInterval(tick);
      off();
    };
  }, [ms]);
}

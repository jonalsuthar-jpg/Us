'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

/** True while the tab is visible and focused. */
export function usePageActive(): boolean {
  return useSyncExternalStore(
    (cb) => {
      document.addEventListener('visibilitychange', cb);
      window.addEventListener('focus', cb);
      window.addEventListener('blur', cb);
      return () => {
        document.removeEventListener('visibilitychange', cb);
        window.removeEventListener('focus', cb);
        window.removeEventListener('blur', cb);
      };
    },
    () => document.visibilityState === 'visible' && document.hasFocus(),
    () => false,
  );
}

/**
 * False until `open` first turns true, then true for good: mount a heavy,
 * lazily loaded dialog only once it's wanted, and keep it so it can close
 * with its animation.
 */
export function useOpenedOnce(open: boolean): boolean {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened || open;
}

/** Seconds since `start`, ticking once a second. */
export function useElapsed(start: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!start) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [start]);
  return start ? now - start : 0;
}

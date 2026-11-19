'use client';

import { useCallState } from '@us/shared/react';
import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useOpenedOnce } from '@/lib/hooks';

const load = () => import('./call-overlay').then((m) => m.CallOverlay);
const CallOverlay = dynamic(load, { ssr: false });

/**
 * The call screen (video, drawing together, talk cards) is a big download
 * that most visits never show. It loads once the browser is idle, so the
 * first ring still opens at once, and mounts only when a call starts.
 */
export function LazyCallOverlay() {
  const active = useOpenedOnce(useCallState().phase !== 'idle');
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 2000));
    idle(() => void load());
  }, []);
  return active ? <CallOverlay /> : null;
}

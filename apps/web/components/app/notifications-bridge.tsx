'use client';

import { useCouple, useCallState } from '@us/shared/react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { initPush, onPush } from '@/lib/push';
import { playChime, startRing, stopRing } from '@/lib/sounds';

/**
 * App-wide sound + push wiring:
 *  - registers this browser with OneSignal under my user id
 *  - foreground pushes are swallowed (we're live already) and chime instead,
 *    unless I'm looking at the thread
 *  - rings while a call is incoming
 *  - notification clicks deep-link into the app
 */
export function NotificationsBridge() {
  const { me, partner, channel } = useCouple();
  const call = useCallState();
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    void initPush(me.id);
    return onPush({
      foreground: () => {},
      click: (d) => d?.url && router.push(d.url),
    });
  }, [me.id, router]);

  // Chime for partner messages that arrive while I'm elsewhere in the app (or tab hidden).
  useEffect(
    () =>
      channel.messages.on(({ type, row }) => {
        if (type !== 'INSERT' || row.sender_id !== partner.id || row.kind !== 'text') return;
        const watching = pathRef.current === '/talk' && document.visibilityState === 'visible';
        if (!watching) playChime();
      }),
    [channel, partner.id],
  );

  useEffect(() => {
    if (call.phase === 'incoming') startRing();
    else stopRing();
    return stopRing;
  }, [call.phase]);

  return null;
}

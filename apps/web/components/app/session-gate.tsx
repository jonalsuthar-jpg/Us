'use client';

import { getCoupleContext, type CoupleContext } from '@us/shared';
import { CallProvider, CoupleProvider } from '@us/shared/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Seal } from '@/components/ui/avatar';
import { env } from '@/lib/env';
import { webRtc } from '@/lib/rtc';
import { getSupabase } from '@/lib/supabase/client';

/**
 * Resolves the signed-in user's couple, then mounts the realtime + call
 * providers for everything inside the app. Unpaired users go to /pair.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<CoupleContext | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    let cancelled = false;
    void sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return router.replace('/sign-in');
      const c = await getCoupleContext(sb, data.user.id);
      if (cancelled) return;
      if (!c) router.replace('/pair');
      else setCtx(c);
    });
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/sign-in');
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  if (!ctx) {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy>
        <Seal size={48} className="animate-pulse" />
        <span className="sr-only">Opening your space…</span>
      </div>
    );
  }

  return (
    <CoupleProvider sb={getSupabase()} context={ctx} platform="web" onEnded={() => window.location.assign('/pair')}>
      <CallProvider rtc={webRtc} forceRelay={env.forceRelay}>
        {children}
      </CallProvider>
    </CoupleProvider>
  );
}

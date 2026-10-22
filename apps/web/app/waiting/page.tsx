'use client';

import { getMyAccess, watchMyAccess, type MyAccess } from '@us/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Seal } from '@/components/ui/avatar';
import { Button, Spinner } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { getSupabase } from '@/lib/supabase/client';

/**
 * Where someone waits until an admin lets them in. It moves on by itself the
 * moment they're approved; rejected and suspended people see why.
 */
export default function WaitingPage() {
  const router = useRouter();
  const [access, setAccess] = useState<MyAccess | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    let stop = () => {};
    let cancelled = false;
    const check = async () => {
      const a = await getMyAccess(sb).catch(() => null);
      if (cancelled || !a) return;
      if (a.status === 'approved') router.replace('/pair');
      else setAccess(a);
    };
    void sb.auth.getUser().then(({ data }) => {
      if (!data.user) return router.replace('/sign-in');
      void check();
      stop = watchMyAccess(sb, data.user.id, () => void check());
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [router]);

  const copy = access ? COPY[access.status as Exclude<MyAccess['status'], 'approved'>] : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-6 py-10 sm:py-16">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-serif text-heading italic text-ink">
          <Seal size={28} /> Us
        </span>
        <Button
          variant="quiet"
          size="sm"
          onClick={async () => {
            await getSupabase().auth.signOut();
            router.replace('/sign-in');
          }}
        >
          Sign out
        </Button>
      </header>

      <div className="flex flex-1 flex-col justify-center py-10">
        {!copy ? (
          <div className="flex justify-center">
            <Spinner className="h-6 w-6 text-rose-400" />
          </div>
        ) : (
          <section>
            <h1 className="text-balance font-display text-title text-ink sm:text-[40px] sm:leading-[44px]">{copy.title}</h1>
            <p className="mt-3 max-w-md text-ink-soft">{copy.body}</p>
            {access?.reason && (
              <Sheet tone="note" accent="gold" pad="md" className="mt-8">
                <p className="text-small text-ink-soft">{access.reason}</p>
              </Sheet>
            )}
            {access?.status === 'pending' && (
              <p className="mt-8 flex items-center gap-2 text-small text-ink-muted">
                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" aria-hidden />
                This page will open Us for you as soon as you’re approved.
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

const COPY: Record<'pending' | 'rejected' | 'suspended', { title: string; body: string }> = {
  pending: {
    title: 'You’re on the list.',
    body: 'Us is opening up a few couples at a time. Your request is in, and we’ll let you in shortly.',
  },
  rejected: {
    title: 'We can’t let you in just now.',
    body: 'Your request to join Us wasn’t approved this time.',
  },
  suspended: {
    title: 'Your account is paused.',
    body: 'Access to Us has been paused for this account. If you think this is a mistake, get in touch.',
  },
};

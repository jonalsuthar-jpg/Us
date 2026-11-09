'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { reloadIfStale } from '@/lib/stale-deploy';

/** A page that threw: reload onto a newer build if that's the cause, otherwise say what broke. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    console.error('[us] page error', error);
    if (reloadIfStale(error)) setReloading(true);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      {reloading ? (
        <p className="text-body text-ink-soft">Getting the latest version…</p>
      ) : (
        <>
          <p className="font-display text-heading text-ink">Something went wrong on this page</p>
          <p className="text-small text-ink-soft">Try again, or go back home. If it keeps happening, send the line below.</p>
          <div className="flex gap-3">
            <Button onClick={reset}>Try again</Button>
            <Button variant="secondary" asChild>
              <Link href="/home">Home</Link>
            </Button>
          </div>
          <p className="max-w-full break-words font-mono text-micro text-ink-muted">
            {error.name}: {error.message}
            {error.digest ? ` · ${error.digest}` : ''}
          </p>
        </>
      )}
    </div>
  );
}

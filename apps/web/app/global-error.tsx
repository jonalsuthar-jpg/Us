'use client';

import { useEffect } from 'react';
import { reloadIfStale } from '@/lib/stale-deploy';

/** The whole app failed (the root layout threw): reload onto a newer build if that's why, else offer a reload. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error('[us] app error', error);
    reloadIfStale(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#FCFAFB', color: '#241933' }}>
        <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 20, margin: 0 }}>Us couldn’t load</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ border: 0, borderRadius: 999, padding: '10px 20px', background: '#241933', color: '#FCFAFB', fontSize: 15, cursor: 'pointer' }}
          >
            Reload
          </button>
          <p style={{ fontSize: 12, color: '#7A6D86', fontFamily: 'monospace', maxWidth: 480, wordBreak: 'break-word' }}>
            {error.name}: {error.message}
            {error.digest ? ` · ${error.digest}` : ''}
          </p>
        </div>
      </body>
    </html>
  );
}

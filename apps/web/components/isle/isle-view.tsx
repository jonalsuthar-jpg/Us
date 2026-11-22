'use client';

import { useIsle, type Seat } from '@us/shared/isle';
import { useCouple } from '@us/shared/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { IsleTable } from './isle-table';
import { useIsleSound } from './use-isle-sound';

/** The bots who make up the table: two when we play together, all three when one of us plays alone. */
const BOTS: Seat[] = [
  { id: 'bot:meera', name: 'Meera', bot: true },
  { id: 'bot:kabir', name: 'Kabir', bot: true },
  { id: 'bot:tara', name: 'Tara', bot: true },
];

/**
 * Isle straight onto the board: the game the two of us share, or with
 * ?solo=1 my game alone against three bots. The first time (or when nothing's
 * being played) a fresh island is dealt at once.
 */
export function IsleView() {
  const router = useRouter();
  const { me, partner } = useCouple();
  // Only ever drawn in the browser (the page loads it with ssr: false), so the address is there to read.
  const [solo] = useState(() => new URLSearchParams(window.location.search).get('solo') === '1');
  const { store, snap } = useIsle({ solo });
  const audio = useIsleSound();
  const [problem, setProblem] = useState<string | null>(null);
  const starting = useRef(false);

  const seats = (): Seat[] =>
    solo
      ? [{ id: me.id, name: me.display_name || 'You', bot: false }, ...BOTS]
      : [{ id: me.id, name: me.display_name || 'You', bot: false }, { id: partner.id, name: partner.display_name || 'Partner', bot: false }, ...BOTS.slice(0, 2)];
  const start = () => {
    if (!store || starting.current) return;
    starting.current = true;
    store
      .start(seats())
      .catch(() => setProblem('Couldn’t deal a new island. Try again in a moment.'))
      .finally(() => (starting.current = false));
  };

  useEffect(() => {
    if (store && snap.loaded && !snap.game) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, snap.loaded, snap.game]);

  if (!store || !snap.game || snap.seat < 0) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[#A9D8E8]">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/40 border-t-white" aria-label="Setting up the island" />
        {problem ? <p className="text-[14px] text-white">{problem}</p> : null}
      </div>
    );
  }
  return (
    <IsleTable
      {...audio}
      state={snap.game.state}
      me={snap.seat}
      botThinking={snap.botThinking}
      onMove={(a) => store.move(snap.seat, a)}
      onNewGame={start}
      onExit={() => router.push('/connect')}
    />
  );
}

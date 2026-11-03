'use client';

/**
 * Dev-only play lab: the three game boards, played on one screen by both
 * seats in turn (the same rules the app uses), plus a talk card flip. For
 * checking layout and animations without two signed-in accounts.
 */
import { applyMove, cardAt, DECKS, initialState, type BoardState, type ConnectFour, type GameKind, type Outcome, type TicTacToe, type WordChain } from '@us/shared';
import { notFound } from 'next/navigation';
import { useState } from 'react';
import { ConnectFourBoard, TicTacToeBoard, WordChainBoard } from '@/components/games/boards';
import { Confetti } from '@/components/games/confetti';

const KINDS: GameKind[] = ['tictactoe', 'connect4', 'wordchain'];

function Lab({ kind }: { kind: GameKind }) {
  const [state, setState] = useState<BoardState>(() => initialState(kind, ['a', 'b']));
  const [outcome, setOutcome] = useState<Outcome>({ status: 'active' });
  const [error, setError] = useState<string | null>(null);
  const [seat, setSeat] = useState<0 | 1>(0);
  const move = (m: number | string) => {
    try {
      const next = applyMove(kind, state, m, seat);
      setState(next.state);
      setOutcome(next.outcome);
      setSeat((s) => (s ? 0 : 1));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const canPlay = outcome.status === 'active' ? seat : null;
  return (
    <section className="space-y-3 rounded-[26px] border border-paper-edge p-4" data-kind={kind}>
      {outcome.status === 'won' ? <Confetti /> : null}
      <p className="text-small font-semibold text-ink" data-status>
        {kind}: {outcome.status === 'active' ? `seat ${seat} to move` : outcome.status === 'won' ? `seat ${outcome.winner} wins` : 'draw'}
      </p>
      {kind === 'tictactoe' ? <TicTacToeBoard state={state as TicTacToe} slots={['a', 'b']} canPlay={canPlay} onMove={move} /> : null}
      {kind === 'connect4' ? <ConnectFourBoard state={state as ConnectFour} slots={['a', 'b']} canPlay={canPlay} onMove={move} /> : null}
      {kind === 'wordchain' ? <WordChainBoard state={state as WordChain} slots={['a', 'b']} canPlay={canPlay} onMove={move} /> : null}
      {error ? <p className="text-small text-rose-700">{error}</p> : null}
    </section>
  );
}

export default function PlayLab() {
  const [index, setIndex] = useState(0);
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-2">
      {KINDS.map((k) => (
        <Lab key={k} kind={k} />
      ))}
      <section className="space-y-3 rounded-[26px] border border-paper-edge p-4">
        <p className="text-small font-semibold text-ink">Talk card · {DECKS[0]!.title}</p>
        <p className="flex min-h-[120px] items-center justify-center rounded-[20px] bg-rose-50 px-5 py-6 text-center font-display text-[21px] leading-[28px] text-ink">
          {cardAt({ deck: 'deep', seed: 7, index }) ?? 'End of the deck'}
        </p>
        <button type="button" onClick={() => setIndex((i) => i + 1)} className="rounded-full bg-rose-600 px-4 py-2 text-small font-semibold text-white">
          Next card
        </button>
      </section>
    </main>
  );
}

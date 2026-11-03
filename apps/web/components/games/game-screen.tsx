'use client';

import { CHAIN_GOAL, GAME_INFO, gameScore, IllegalMove, seatOf, type ConnectFour, type GameMove, type TicTacToe, type WordChain } from '@us/shared';
import { useCouple, useGames } from '@us/shared/react';
import { ArrowLeft, Flag, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { ConnectFourBoard, TicTacToeBoard, WordChainBoard, type SeatSlots } from './boards';
import { Confetti } from './confetti';

/** One game: whose turn, the board, and the end (with a rematch). */
export function GameScreen({ id }: { id: string }) {
  const { me, partner, mySlot, partnerSlot, partnerOnline } = useCouple();
  const { games, loading, move, resign, start } = useGames();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [giveUp, setGiveUp] = useState(false);
  const game = games.find((g) => g.id === id);

  if (!game) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <p className="font-serif text-lead italic text-ink-soft">{loading ? 'Setting up the board…' : 'This game isn’t here any more.'}</p>
        {!loading ? (
          <Link href="/connect" className="mt-4 inline-block font-semibold text-rose-600">
            Back to Connect
          </Link>
        ) : null}
      </div>
    );
  }

  const info = GAME_INFO[game.kind];
  const mySeat = seatOf(game, me.id);
  const players = (game.state as { players: [string, string] }).players;
  const slots: SeatSlots = [players[0] === me.id ? mySlot : partnerSlot, players[1] === me.id ? mySlot : partnerSlot];
  const myTurn = game.status === 'active' && game.turn === me.id;
  const over = game.status !== 'active';
  const iWon = game.winner === me.id;
  const together = game.kind === 'wordchain' && game.status === 'draw';
  const kindScore = gameScore(games, me.id, game.kind);

  const play = async (m: GameMove) => {
    if (busy || !myTurn || mySeat === null) return;
    setBusy(true);
    setError(null);
    try {
      await move(game, m);
    } catch (e) {
      setError(e instanceof IllegalMove ? e.message : /game_moved_on|not_your_turn/.test(String((e as Error).message)) ? 'The board changed. Here’s the latest.' : 'That move didn’t go through. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const rematch = async () => {
    const g = await start(game.kind);
    router.replace(`/connect/play/${g.id}`);
  };

  const status = over
    ? together
      ? `You made a ${CHAIN_GOAL}-word chain together 🎉`
      : game.status === 'draw'
        ? 'It’s a draw'
        : iWon
          ? game.status === 'abandoned'
            ? `${partner.display_name} gave up. You win 🏆`
            : 'You win 🏆'
          : game.status === 'abandoned'
            ? `You gave up. ${partner.display_name} wins`
            : `${partner.display_name} wins`
    : myTurn
      ? 'Your turn'
      : `${partner.display_name}’s turn${partnerOnline ? '' : ' (we’ll let them know)'}`;

  const board = {
    tictactoe: <TicTacToeBoard state={game.state as TicTacToe} slots={slots} canPlay={myTurn && !busy ? mySeat : null} onMove={play} />,
    connect4: <ConnectFourBoard state={game.state as ConnectFour} slots={slots} canPlay={myTurn && !busy ? mySeat : null} onMove={play} />,
    wordchain: <WordChainBoard state={game.state as WordChain} slots={slots} canPlay={myTurn && !busy ? mySeat : null} onMove={play} />,
  }[game.kind];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-5 py-6 sm:py-10">
      {over && (iWon || together) ? <Confetti key={game.id} /> : null}
      <header className="flex items-center gap-3">
        <Link href="/connect" aria-label="Back to Connect" className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-paper-sunken hover:text-ink">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-micro font-semibold uppercase tracking-[0.08em] text-teal-700">Play</p>
          <h1 className="font-display text-title text-ink">
            {info.emoji} {info.title}
          </h1>
        </div>
        {!over ? (
          <Button variant="quiet" size="sm" onClick={() => setGiveUp(true)}>
            <Flag className="h-4 w-4" /> {game.kind === 'wordchain' ? 'I’m stuck' : 'Give up'}
          </Button>
        ) : null}
      </header>

      <div className="flex items-center justify-between gap-3 rounded-[22px] border border-paper-edge bg-paper-raised px-4 py-3">
        <Player name="You" avatar={me.display_name} slot={mySlot} active={myTurn} wins={kindScore.me} />
        <p className={cn('text-center text-body font-semibold', myTurn ? 'text-rose-700' : over ? 'text-ink' : 'text-ink-soft')} aria-live="polite">
          {status}
        </p>
        <Player name={partner.display_name} avatar={partner.display_name} slot={partnerSlot} active={!over && !myTurn} wins={kindScore.partner} online={partnerOnline} right />
      </div>

      {board}

      {error ? <p className="text-center text-small text-rose-700">{error}</p> : null}

      {over ? (
        <div className="flex justify-center">
          <Button onClick={() => void rematch()}>
            <RotateCcw className="h-4 w-4" /> Rematch
          </Button>
        </div>
      ) : null}

      <Dialog
        open={giveUp}
        onOpenChange={setGiveUp}
        title={game.kind === 'wordchain' ? 'Out of words?' : 'Give up this game?'}
        description={`${partner.display_name} wins this one.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setGiveUp(false)}>
            Keep playing
          </Button>
          <Button
            onClick={() => {
              setGiveUp(false);
              void resign(game.id).catch(() => setError('Couldn’t end the game. Try again.'));
            }}
          >
            {game.kind === 'wordchain' ? 'I’m stuck' : 'Give up'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function Player({ name, avatar, slot, active, wins, online, right }: { name: string; avatar: string; slot: 'a' | 'b'; active: boolean; wins: number; online?: boolean; right?: boolean }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2', right && 'flex-row-reverse text-right')}>
      <Avatar name={avatar} slot={slot} size="sm" online={online} className={cn('transition-transform', active && 'scale-110')} />
      <span className="min-w-0">
        <span className="block truncate text-small font-semibold text-ink">{name}</span>
        <span className="block text-micro text-ink-muted">
          {wins} {wins === 1 ? 'win' : 'wins'}
        </span>
      </span>
    </span>
  );
}


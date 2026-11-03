'use client';

import {
  C4_COLS,
  C4_ROWS,
  CHAIN_GOAL,
  connectFour,
  ticTacToe,
  wordChain,
  type ConnectFour,
  type PartnerSlot,
  type Seat,
  type TicTacToe,
  type WordChain,
} from '@us/shared';
import { motion } from 'framer-motion';
import { SendHorizontal } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';

/** Each seat's colour: whoever sits there, in their own colour (a rose, b teal). */
export type SeatSlots = [PartnerSlot, PartnerSlot];

const DISC: Record<PartnerSlot, string> = { a: 'bg-rose-500', b: 'bg-teal-500' };
const INK: Record<PartnerSlot, string> = { a: 'text-rose-600', b: 'text-teal-600' };

interface BoardProps<S> {
  state: S;
  slots: SeatSlots;
  /** My seat, when it's my turn; null while waiting or after the end. */
  canPlay: Seat | null;
  onMove: (move: number | string) => void;
}

// ------------------------------------------------------------ tic-tac-toe ---

export function TicTacToeBoard({ state, slots, canPlay, onMove }: BoardProps<TicTacToe>) {
  const line = ticTacToe.line(state);
  return (
    <div role="grid" aria-label="Tic-tac-toe board" className="mx-auto grid aspect-square w-full max-w-[360px] grid-cols-3 gap-2.5">
      {state.cells.map((c, i) => {
        const winning = line?.includes(i);
        const free = c === -1 && canPlay !== null;
        return (
          <button
            key={i}
            type="button"
            role="gridcell"
            aria-label={c === -1 ? `Empty, row ${Math.floor(i / 3) + 1} column ${(i % 3) + 1}` : c === 0 ? 'X' : 'O'}
            disabled={!free}
            onClick={() => onMove(i)}
            className={cn(
              'flex items-center justify-center rounded-[22px] border-2 bg-paper-raised transition-colors',
              free ? 'border-paper-edge hover:border-gold-400 hover:bg-gold-50' : 'border-paper-edge',
              winning && 'border-gold-400 bg-gold-50',
            )}
          >
            {c !== -1 ? <Mark seat={c as Seat} slot={slots[c as Seat]} fresh={state.last === i} /> : null}
          </button>
        );
      })}
    </div>
  );
}

function Mark({ seat, slot, fresh }: { seat: Seat; slot: PartnerSlot; fresh: boolean }) {
  const draw = { initial: fresh ? { pathLength: 0 } : false, animate: { pathLength: 1 }, transition: { duration: 0.28, ease: 'easeOut' } } as const;
  return (
    <svg viewBox="0 0 40 40" className={cn('h-[62%] w-[62%]', INK[slot])} fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round">
      {seat === 0 ? (
        <>
          <motion.path d="M9 9 L31 31" {...draw} />
          <motion.path d="M31 9 L9 31" {...draw} transition={{ ...draw.transition, delay: fresh ? 0.12 : 0 }} />
        </>
      ) : (
        <motion.circle cx="20" cy="20" r="12" {...draw} />
      )}
    </svg>
  );
}

// ----------------------------------------------------------- connect four ---

export function ConnectFourBoard({ state, slots, canPlay, onMove }: BoardProps<ConnectFour>) {
  const line = connectFour.line(state);
  const inLine = (col: number, row: number) => !!line?.some((p) => p.col === col && p.row === row);
  return (
    <div className="mx-auto w-full max-w-[460px] rounded-[26px] bg-plum-600 p-2.5 shadow-[inset_0_-4px_0_rgba(0,0,0,0.18)] sm:p-3">
      <div role="grid" aria-label="Connect Four board" className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${C4_COLS}, 1fr)` }}>
        {Array.from({ length: C4_COLS }, (_, col) => {
          const open = canPlay !== null && connectFour.canDrop(state, col);
          return (
            <button
              key={col}
              type="button"
              aria-label={`Drop in column ${col + 1}`}
              disabled={!open}
              onClick={() => onMove(col)}
              className={cn('group flex flex-col-reverse gap-1.5 rounded-[14px] p-0.5 sm:gap-2', open && 'hover:bg-white/10')}
            >
              {Array.from({ length: C4_ROWS }, (_, row) => {
                const seat = connectFour.at(state, col, row);
                const fresh = state.last?.col === col && state.last.row === row;
                return (
                  <span key={row} className="relative aspect-square w-full overflow-hidden rounded-full bg-plum-900/45">
                    {seat !== -1 ? (
                      <motion.span
                        className={cn('absolute inset-0 rounded-full shadow-[inset_0_-3px_0_rgba(0,0,0,0.2)]', DISC[slots[seat as Seat]], inLine(col, row) && 'ring-4 ring-gold-300 ring-inset')}
                        initial={fresh ? { y: `-${(C4_ROWS - row) * 115}%` } : false}
                        animate={{ y: 0 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                      />
                    ) : null}
                  </span>
                );
              })}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- word chain ---

export function WordChainBoard({ state, slots, canPlay, onMove }: BoardProps<WordChain>) {
  const [word, setWord] = useState('');
  const next = wordChain.next(state);
  const problem = word.trim() ? wordChain.problem(state, word) : null;
  return (
    <div className="mx-auto w-full max-w-[460px] space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper-sunken">
          <motion.div className="h-full rounded-full bg-gold-400" animate={{ width: `${(state.words.length / CHAIN_GOAL) * 100}%` }} />
        </div>
        <span className="text-small font-semibold text-ink-soft">
          {state.words.length}/{CHAIN_GOAL}
        </span>
      </div>
      <ol className="flex flex-wrap gap-2" aria-label="The chain so far">
        {state.words.map((x, i) => (
          <motion.li
            key={x.w}
            initial={i === state.words.length - 1 ? { scale: 0.6, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            className={cn('rounded-full px-3 py-1.5 text-body font-semibold text-white', DISC[slots[x.by]])}
          >
            {x.w}
          </motion.li>
        ))}
        {!state.words.length ? <li className="text-small text-ink-soft">No words yet. The first one starts with the letter below.</li> : null}
      </ol>
      <div className="flex items-center justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-gold-100 font-display text-[34px] uppercase text-gold-800" aria-label={`Next word starts with ${next}`}>
          {next}
        </span>
      </div>
      {canPlay !== null ? (
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!word.trim() || problem) return;
            onMove(word);
            setWord('');
          }}
        >
          <div className="flex items-center gap-2 rounded-full border border-paper-edge bg-paper-raised p-1.5 pl-4 focus-within:border-gold-400">
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder={`A word starting with “${next.toUpperCase()}”`}
              aria-label="Your word"
              autoFocus
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted"
            />
            <button
              type="submit"
              aria-label="Play word"
              disabled={!word.trim() || !!problem}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white disabled:opacity-40"
            >
              <SendHorizontal className="h-[18px] w-[18px]" />
            </button>
          </div>
          {problem ? <p className="px-3 text-small text-rose-700">{problem}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

'use client';

import { DECKS, deckById, type DeckId } from '@us/shared';
import type { useCallCards } from '@us/shared/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Layers, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';

type Cards = ReturnType<typeof useCallCards>;

/**
 * Talk cards over the call: pick a deck, and the same card shows on both
 * screens. Either of us can deal the next one.
 */
export function CallCards({ cards, picking, onPicking, partnerName }: { cards: Cards; picking: boolean; onPicking: (on: boolean) => void; partnerName: string }) {
  const [spicy, setSpicy] = useState(false);
  const { table, card } = cards;
  if (!table && !picking) return null;

  const choose = (id: DeckId) => {
    onPicking(false);
    cards.open(id);
  };

  return (
    <div className="absolute inset-x-0 top-[76px] z-20 flex justify-center px-4">
      <motion.div
        initial={{ y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-[min(92vw,460px)] rounded-[26px] bg-paper-raised/95 p-4 text-ink shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-small font-semibold text-ink-soft">
            <Layers className="h-4 w-4" aria-hidden />
            {table ? `${deckById(table.deck).emoji} ${deckById(table.deck).title}` : 'Pick a deck'}
          </p>
          <div className="flex items-center gap-1">
            {table ? (
              <button type="button" onClick={() => onPicking(true)} className="rounded-full px-2.5 py-1 text-micro font-semibold text-rose-600 hover:bg-rose-50">
                Change deck
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Put the cards away"
              onClick={() => {
                onPicking(false);
                cards.close();
              }}
              className="rounded-full p-1.5 text-ink-muted hover:bg-paper-sunken hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {picking || !table ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              {DECKS.filter((d) => !d.spicy || spicy).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => choose(d.id)}
                  className={cn('rounded-[18px] border-2 px-3 py-3 text-left hover:border-rose-300', table?.deck === d.id ? 'border-rose-300 bg-rose-50' : 'border-paper-edge')}
                >
                  <span className="block text-[24px] leading-none">{d.emoji}</span>
                  <span className="mt-1.5 block text-small font-semibold">{d.title}</span>
                </button>
              ))}
            </div>
            {!spicy ? (
              <button type="button" onClick={() => setSpicy(true)} className="text-micro text-ink-muted underline-offset-2 hover:underline">
                Show the spicy deck 🌶️
              </button>
            ) : null}
            <p className="text-micro text-ink-muted">{partnerName} sees the same card as you.</p>
          </div>
        ) : (
          <>
            <AnimatePresence mode="wait">
              <motion.p
                key={`${table.deck}-${table.seed}-${table.index}`}
                initial={{ rotateY: -90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: 90, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="flex min-h-[120px] items-center justify-center rounded-[20px] bg-rose-50 px-5 py-6 text-center font-display text-[21px] leading-[28px] text-ink"
                aria-live="polite"
              >
                {card ?? 'That’s the whole deck. Pick another?'}
              </motion.p>
            </AnimatePresence>
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous card"
                disabled={!table.index}
                onClick={cards.back}
                className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-paper-sunken disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-micro text-ink-muted">
                {Math.min(table.index + 1, deckById(table.deck).cards.length)} / {deckById(table.deck).cards.length}
              </span>
              <button
                type="button"
                onClick={card ? cards.next : () => onPicking(true)}
                className="flex h-10 items-center gap-1 rounded-full bg-rose-600 px-4 text-small font-semibold text-white hover:bg-rose-700"
              >
                {card ? 'Next' : 'New deck'} <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

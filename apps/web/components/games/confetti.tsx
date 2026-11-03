'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';

const COLOURS = ['#E46B8A', '#3FA6A0', '#F3B33D', '#8E6BB8', '#7FB069'];

/** A short burst of paper confetti over the whole screen, for wins. */
export function Confetti({ pieces = 70 }: { pieces?: number }) {
  const reduced = useReducedMotion();
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        drift: (Math.random() - 0.5) * 30,
        delay: Math.random() * 0.35,
        spin: (Math.random() - 0.5) * 720,
        size: 6 + Math.random() * 7,
        colour: COLOURS[i % COLOURS.length]!,
        round: Math.random() > 0.6,
      })),
    [pieces],
  );
  if (reduced) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {bits.map((b) => (
        <motion.span
          key={b.id}
          className="absolute top-0"
          style={{ left: `${b.x}%`, width: b.size, height: b.round ? b.size : b.size * 0.45, background: b.colour, borderRadius: b.round ? 999 : 2 }}
          initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '105vh', x: `${b.drift}vw`, rotate: b.spin, opacity: [1, 1, 0.8, 0] }}
          transition={{ duration: 2.2 + Math.random(), delay: b.delay, ease: [0.2, 0.6, 0.4, 1] }}
        />
      ))}
    </div>
  );
}

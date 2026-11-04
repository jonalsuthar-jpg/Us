'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const CANDLES = ['#F3B33D', '#3FA6A0', '#E46B8A', '#8E6BB8', '#7FB069'];

/**
 * The birthday cake: candles that blow out, and a knife line that follows
 * `knife` (0 → 1) down through it. Sized by `size` in px; everything inside is
 * in hundredths of it.
 */
export function Cake({ size, lit, knife = 0, cut = false }: { size: number; lit: boolean; knife?: number; cut?: boolean }) {
  const u = size / 100;
  const tierTop = 34 * u;
  const cakeHeight = 52 * u;
  return (
    <div role="img" aria-label={lit ? 'A birthday cake with lit candles' : 'A birthday cake'} className="relative select-none" style={{ width: size, height: size }}>
      <div className="absolute rounded-full bg-[#F2E9EF]" style={{ left: 4 * u, right: 4 * u, bottom: 6 * u, height: 9 * u }} />
      <div className="absolute overflow-hidden bg-[#F7B9C8]" style={{ left: 12 * u, right: 12 * u, bottom: 10 * u, height: 30 * u, borderRadius: 6 * u }}>
        <div className="bg-[#FFF6F0]" style={{ height: 7 * u }} />
        <Drips u={u} count={7} />
        <div className="absolute inset-x-0 bg-[#E46B8A] opacity-60" style={{ bottom: 7 * u, height: 2.5 * u }} />
      </div>
      <div className="absolute overflow-hidden bg-[#F3D9A4]" style={{ left: 24 * u, right: 24 * u, top: tierTop, height: 22 * u, borderRadius: 5 * u }}>
        <div className="bg-[#FFF6F0]" style={{ height: 5.5 * u }} />
        <Drips u={u} count={5} />
        {[0.2, 0.5, 0.8].map((x) => (
          <div key={x} className="absolute rounded-full bg-[#E46B8A]" style={{ left: `${x * 100}%`, top: 12 * u, width: 2.4 * u, height: 2.4 * u }} />
        ))}
      </div>
      {CANDLES.map((colour, i) => (
        <div key={colour} className="absolute flex flex-col items-center" style={{ left: 30 * u + i * 9.6 * u, top: tierTop - 13 * u, width: 3 * u }}>
          <div className="flex items-end justify-center" style={{ height: 6 * u }}>
            <AnimatePresence initial={false}>
              {lit ? <Flame key="flame" u={u} delay={i * 0.09} /> : <motion.div key="smoke" initial={{ scale: 0 }} animate={{ scale: 1 }} className="rounded-full bg-[#C9BED3] opacity-70" style={{ width: 1.4 * u, height: 4 * u }} />}
            </AnimatePresence>
          </div>
          <div style={{ width: 3 * u, height: 13 * u, borderRadius: u, background: colour }} />
        </div>
      ))}
      {knife > 0 ? (
        <div className="absolute rounded-full bg-[#5B3F6E] opacity-55" style={{ left: size / 2 - 0.6 * u, top: tierTop, width: 1.2 * u, height: Math.min(1, knife) * cakeHeight }} />
      ) : null}
      {knife > 0 && !cut ? (
        <span className="pointer-events-none absolute" style={{ left: size / 2 - 2 * u, top: tierTop + knife * cakeHeight - 13 * u, fontSize: 14 * u, lineHeight: 1, transform: 'rotate(135deg)' }}>
          🔪
        </span>
      ) : null}
      {cut ? (
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }} className="absolute" style={{ right: -2 * u, bottom: 4 * u, fontSize: 26 * u, lineHeight: 1 }}>
          🍰
        </motion.span>
      ) : null}
    </div>
  );
}

function Drips({ u, count }: { u: number; count: number }) {
  return (
    <div className="-mt-px flex justify-around">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-b-full bg-[#FFF6F0]" style={{ width: 4 * u, height: (i % 2 ? 3 : 5) * u }} />
      ))}
    </div>
  );
}

function Flame({ u, delay }: { u: number; delay: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      exit={{ opacity: 0, scale: 0.4 }}
      animate={reduced ? undefined : { scaleY: [0.85, 1.15, 0.85], scaleX: [1, 0.88, 1] }}
      transition={{ duration: 0.45, repeat: Infinity, delay, ease: 'easeInOut' }}
      style={{ marginBottom: 0.6 * u }}
    >
      <div
        className="relative bg-[#FFB547] shadow-[0_0_12px_#FFB547]"
        style={{ width: 4 * u, height: 4 * u, borderRadius: '999px 0 999px 999px', transform: 'rotate(-45deg)' }}
      >
        <div className="absolute rounded-full bg-[#FFF3C4]" style={{ right: 0.7 * u, bottom: 0.7 * u, width: 2 * u, height: 2 * u }} />
      </div>
    </motion.div>
  );
}

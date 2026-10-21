'use client';

import { motion } from 'framer-motion';
import { tokens } from '@us/shared';

/**
 * The plum half of the auth screens. Its one moment: two circles — rose and
 * teal — drift in from opposite edges and settle into an overlap.
 */
export function AuthHero() {
  const ease = tokens.motion.ease.out;
  return (
    <aside className="relative flex min-h-[38dvh] flex-col justify-between overflow-hidden bg-plum-800 px-8 py-10 text-paper sm:px-12 lg:min-h-dvh lg:py-14">
      <span className="font-serif text-heading italic tracking-tight text-paper/90">Us</span>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
        <motion.div
          className="absolute h-56 w-56 rounded-full bg-rose-400/90 lg:h-80 lg:w-80"
          initial={{ x: -260, opacity: 0 }}
          animate={{ x: -52, opacity: 1 }}
          transition={{ duration: 1.6, ease }}
        />
        <motion.div
          className="absolute h-56 w-56 rounded-full bg-teal-500/90 mix-blend-screen lg:h-80 lg:w-80"
          initial={{ x: 260, opacity: 0 }}
          animate={{ x: 52, opacity: 1 }}
          transition={{ duration: 1.6, ease, delay: 0.08 }}
        />
      </div>

      <div className="relative max-w-md">
        <motion.h1
          className="text-balance font-serif text-[40px] font-light leading-[1.05] tracking-tight lg:text-[56px]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease, delay: 0.9 }}
        >
          Just the two <em className="font-normal">of you.</em>
        </motion.h1>
        <p className="mt-4 max-w-sm text-small text-plum-200">
          Calls, messages and the small rituals of a relationship — in a space nobody else can enter.
        </p>
      </div>
    </aside>
  );
}

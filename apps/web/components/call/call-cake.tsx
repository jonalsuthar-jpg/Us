'use client';

import type { useCallCake } from '@us/shared/react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { CakeCutter } from '@/components/birthday/birthday-room';
import { Confetti } from '@/components/games/confetti';

type CallCakeState = ReturnType<typeof useCallCake>;

/** The birthday cake over the call: the same knife on both screens, confetti on both when it's cut. */
export function CallCake({ cake, name }: { cake: CallCakeState; name: string }) {
  const state = cake.cake;
  if (!state) return null;
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute left-1/2 top-20 z-30 flex w-[min(92vw,380px)] -translate-x-1/2 flex-col items-center rounded-[26px] bg-plum-900/95 px-4 pb-5 pt-3 text-paper shadow-2xl"
      >
        <div className="flex w-full items-center justify-between">
          <span className="text-small font-semibold text-gold-300">🎂 Cut the cake together</span>
          <button type="button" aria-label="Put the cake away" onClick={cake.putAway} className="rounded-full p-1.5 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <CakeCutter size={230} knife={state.knife} cut={state.cut} onMove={cake.move} />
        <p className="text-center font-display text-lead">{state.cut ? `Happy birthday, ${name}! 🎉` : 'Drag the knife down through the cake'}</p>
      </motion.div>
      {state.cut ? <Confetti pieces={80} /> : null}
    </>
  );
}

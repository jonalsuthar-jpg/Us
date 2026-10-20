'use client';

import { MotionConfig as FMConfig } from 'framer-motion';
import { tokens } from '@us/shared';

/** Framer Motion honours prefers-reduced-motion app-wide, with our easing. */
export function MotionConfig({ children }: { children: React.ReactNode }) {
  return (
    <FMConfig reducedMotion="user" transition={{ duration: tokens.motion.duration.base / 1000, ease: tokens.motion.ease.out }}>
      {children}
    </FMConfig>
  );
}

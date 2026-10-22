'use client';

import * as D from '@radix-ui/react-dialog';
import { sparkNextLine, type SparkDivision, type SparkState } from '@us/shared';
import { Sparkles } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { Emblem } from './emblem';

const TWINKLES: { style: CSSProperties; size: number; color: string }[] = [
  { style: { left: '16%', top: '20%', animationDelay: '0ms' }, size: 18, color: '#FCC24F' },
  { style: { right: '18%', top: '26%', animationDelay: '600ms' }, size: 12, color: '#FF86A3' },
  { style: { right: '24%', top: '50%', animationDelay: '1100ms' }, size: 14, color: '#91E3D5' },
  { style: { left: '22%', top: '53%', animationDelay: '300ms' }, size: 10, color: '#FFD98A' },
];

/** The moment we reach a new rank: full screen, for both of us. */
export function RankUp({ division, state, onClose }: { division: SparkDivision | null; state: SparkState; onClose: () => void }) {
  return (
    <D.Root open={!!division} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Content className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-plum-900 px-8 text-center focus:outline-none">
          {division ? (
            <>
              {TWINKLES.map((t, i) => (
                <Sparkles
                  key={i}
                  aria-hidden
                  className="absolute animate-[us-twinkle_1.8s_ease-in-out_infinite]"
                  style={{ ...t.style, width: t.size, height: t.size, color: t.color, fill: t.color }}
                />
              ))}
              <div className="flex w-full max-w-sm flex-col items-center">
                <div className="relative flex h-64 w-64 items-center justify-center">
                  <span className="absolute h-56 w-56 rounded-full animate-[us-rank-glow_2.4s_ease-in-out_infinite]" style={{ backgroundColor: division.tier.colors[1] }} />
                  <Emblem division={division} className="relative h-[150px] w-[150px] animate-[us-rank-pop_0.9s_cubic-bezier(.2,1.4,.3,1)_both]" />
                </div>
                <div className="flex w-full flex-col items-center animate-[us-rise_0.6s_0.35s_cubic-bezier(.2,.8,.2,1)_both]">
                  <p className="mt-2 text-micro font-semibold uppercase tracking-[0.2em] text-gold-300">New rank</p>
                  <D.Title className="mt-1 font-display text-[42px] leading-[48px] text-paper">{division.name}</D.Title>
                  <D.Description className="mt-1.5 font-serif text-lead font-light italic text-plum-200">You two climbed together.</D.Description>
                  <p className="mt-4 text-small text-plum-300">{state.rank.division.index === division.index ? sparkNextLine(state) : ' '}</p>
                  <D.Close asChild>
                    <Button size="lg" block className="mt-10">
                      Keep going
                    </Button>
                  </D.Close>
                </div>
              </div>
            </>
          ) : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

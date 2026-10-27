'use client';

import { colorOf, DRAW_COLORS, hslToHex, isDrawColor, isLight, normalizeColor, type DrawColor } from '@us/shared';
import { Check } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';

const RECENT_KEY = 'us.draw.recent-colours';
const START: DrawColor[] = [1, 0, 6, 4, 2, 8];
let shared: DrawColor[] | null = null;
const listeners = new Set<(c: DrawColor[]) => void>();

/** The last six colours I drew with, kept in this browser. */
export function useRecentColours(): [DrawColor[], (c: DrawColor) => void] {
  const [recent, setRecent] = useState<DrawColor[]>(shared ?? START);
  useEffect(() => {
    listeners.add(setRecent);
    if (!shared) {
      try {
        const list = (JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown[]).filter(isDrawColor);
        shared = list.length ? list.slice(0, 6) : START;
      } catch {
        shared = START;
      }
      setRecent(shared);
    }
    return () => void listeners.delete(setRecent);
  }, []);
  const push = useCallback((c: DrawColor) => {
    const n = normalizeColor(c);
    const next = [n, ...(shared ?? START).filter((x) => colorOf(x) !== colorOf(n))].slice(0, 6);
    shared = next;
    listeners.forEach((fn) => fn(next));
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* private window */
    }
  }, []);
  return [recent, push];
}

export function Swatch({ c, size, selected, className }: { c: DrawColor; size: number; selected?: boolean; className?: string }) {
  const hex = colorOf(c);
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-full', isLight(hex) && 'border border-paper-edge', className)}
      style={{ width: size, height: size, background: hex }}
    >
      {selected ? <Check className="h-[45%] w-[45%]" strokeWidth={3} color={isLight(hex) ? '#241933' : '#FFFFFF'} aria-hidden /> : null}
    </span>
  );
}

const strip = 'h-[22px] w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-white';

/** The palette, a custom colour (hue and lightness, or the system picker), and recent colours. */
export function ColourDialog({ open, onOpenChange, value, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; value: DrawColor; onPick: (c: DrawColor) => void }) {
  const [recent] = useRecentColours();
  const [hue, setHue] = useState(260);
  const [light, setLight] = useState(55);
  const [custom, setCustom] = useState<string | null>(null);
  const shown = custom ?? hslToHex(hue, 0.8, light / 100);
  const current = colorOf(value);
  const pick = (c: DrawColor) => {
    onPick(c);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Colours" className="sm:w-[min(92vw,400px)]">
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Palette" className="grid grid-cols-5 justify-items-center gap-3">
          {DRAW_COLORS.map((c, i) => (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={current === c.hex}
              aria-label={c.name}
              title={c.name}
              onClick={() => pick(i)}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
            >
              <Swatch c={i} size={48} selected={current === c.hex} />
            </button>
          ))}
        </div>
        <section className="space-y-2.5 rounded-[18px] bg-paper-sunken p-3.5">
          <h3 className="text-micro font-bold uppercase tracking-[0.06em] text-ink-muted">Custom</h3>
          <input
            type="range"
            aria-label="Hue"
            min={0}
            max={360}
            value={hue}
            onChange={(e) => {
              setCustom(null);
              setHue(Number(e.target.value));
            }}
            className={strip}
            style={{ background: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}
          />
          <input
            type="range"
            aria-label="Lightness"
            min={0}
            max={100}
            value={light}
            onChange={(e) => {
              setCustom(null);
              setLight(Number(e.target.value));
            }}
            className={strip}
            style={{ background: `linear-gradient(90deg,#000,${hslToHex(hue, 0.8, 0.5)},#fff)` }}
          />
          <div className="flex items-center gap-2.5">
            <label className="relative cursor-pointer" title="Pick any colour">
              <Swatch c={shown} size={40} />
              <input type="color" aria-label="Pick any colour" value={shown.toLowerCase()} onChange={(e) => setCustom(e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
            <span className="flex-1 font-mono text-body font-semibold text-ink">{shown}</span>
            <Button size="sm" onClick={() => pick(shown)}>
              Use this colour
            </Button>
          </div>
        </section>
        <section className="space-y-2">
          <h3 className="text-micro font-bold uppercase tracking-[0.06em] text-ink-muted">Recent</h3>
          <div className="flex gap-2.5">
            {recent.map((r, i) => (
              <button key={`${String(r)}-${i}`} type="button" aria-label={`Recent colour ${colorOf(r)}`} onClick={() => pick(r)} className="rounded-full">
                <Swatch c={r} size={34} />
              </button>
            ))}
          </div>
        </section>
      </div>
    </Dialog>
  );
}

/** The "more colours" button: a little colour wheel with a plus. */
export function Wheel({ size = 40 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="flex items-center justify-center rounded-full"
      style={{ width: size, height: size, background: 'conic-gradient(#F5547C,#F3A823,#FFE14D,#37AC5F,#0C8F82,#2F6FDB,#634882,#F5547C)' }}
    >
      <span className="flex h-[55%] w-[55%] items-center justify-center rounded-full bg-white text-[16px] font-bold leading-none text-plum-800">+</span>
    </span>
  );
}

'use client';

import { replayTimeline, strokesAt, BOARD_H, BOARD_W, type DrawingFile } from '@us/shared';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { compose, loadImage } from './render';

const SPEEDS = [1, 2, 4] as const;

function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * A saved drawing redrawn stroke by stroke at the pace it was drawn (long
 * pauses squeezed), with play/pause, a scrubber and 1× / 2× / 4×.
 */
export function Replay({ file, photoUrl, tone = 'night', autoPlay = true, className }: { file: DrawingFile; photoUrl?: string | null; tone?: 'night' | 'paper'; autoPlay?: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ink = useRef<HTMLCanvasElement | null>(null);
  const timeline = useMemo(() => replayTimeline(file.strokes), [file.strokes]);
  const total = timeline.length ? timeline[timeline.length - 1]!.end : 0;
  const [t, setT] = useState(autoPlay ? 0 : total);
  const [playing, setPlaying] = useState(autoPlay);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    setT(autoPlay ? 0 : total);
    setPlaying(autoPlay);
  }, [file, autoPlay, total]);

  useEffect(() => {
    let live = true;
    if (photoUrl) void loadImage(photoUrl).then((i) => live && setPhoto(i)).catch(() => {});
    return () => {
      live = false;
    };
  }, [photoUrl]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) * speed;
      last = now;
      setT((v) => {
        const next = Math.min(total, v + dt);
        if (next >= total) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, total]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const w = Math.round(c.clientWidth * Math.min(window.devicePixelRatio || 1, 2));
    if (c.width !== w) {
      c.width = w;
      c.height = Math.round((w * BOARD_H) / BOARD_W);
    }
    ink.current ??= document.createElement('canvas');
    compose(c.getContext('2d')!, ink.current, strokesAt(file.strokes, t, timeline), file.bg, photo);
  }, [t, file, timeline, photo]);

  const night = tone === 'night';
  const done = t >= total;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="aspect-[3/4] overflow-hidden rounded-[16px] bg-white">
        <canvas ref={canvas} role="img" aria-label={`Replay, ${Math.round((t / (total || 1)) * 100)} percent drawn`} className="h-full w-full" />
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-label={playing ? 'Pause replay' : done ? 'Play again' : 'Play replay'}
          onClick={() => {
            if (done) setT(0);
            setPlaying((p) => !p || done);
          }}
          className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', night ? 'bg-paper text-plum-800' : 'bg-plum-800 text-paper')}
        >
          {playing ? <Pause className="h-4 w-4 fill-current" /> : done ? <RotateCcw className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
        </button>
        <div className="min-w-0 flex-1">
          <input
            type="range"
            aria-label="Replay position"
            min={0}
            max={total || 1}
            value={t}
            onChange={(e) => {
              setPlaying(false);
              setT(Number(e.target.value));
            }}
            className="w-full accent-rose-400"
          />
          <span className={cn('flex justify-between text-[12px]', night ? 'text-plum-200' : 'text-ink-muted')}>
            <span>{clock(t)}</span>
            <span>{clock(total)}</span>
          </span>
        </div>
        <div role="radiogroup" aria-label="Speed" className={cn('flex rounded-xl p-[3px]', night ? 'bg-plum-700' : 'bg-paper-sunken')}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={speed === s}
              onClick={() => setSpeed(s)}
              className={cn(
                'rounded-[9px] px-2 py-1.5 text-micro font-semibold',
                speed === s ? (night ? 'bg-paper text-plum-800' : 'bg-paper-raised text-ink') : night ? 'text-plum-200' : 'text-ink-soft',
              )}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

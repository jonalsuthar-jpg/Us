import { cn } from '@/lib/cn';

/** A record, turning while something plays. Pure decoration. */
export function Record({ playing, className }: { playing: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex aspect-square items-center justify-center rounded-full border-[6px] border-plum-900 motion-safe:animate-record',
        !playing && '[animation-play-state:paused]',
        className,
      )}
      // The grooves.
      style={{ background: 'repeating-radial-gradient(circle, #0D0814 0 7px, #392751 7px 8px)', boxShadow: '0 30px 60px -30px rgba(0,0,0,0.8)' }}
    >
      <span className="relative flex h-[34%] w-[34%] items-center justify-center rounded-full bg-rose-400">
        <span className="absolute left-[14%] top-[16%] h-[38%] w-[38%] rounded-full bg-gold-400" />
        <span className="relative h-[12%] w-[12%] rounded-full bg-plum-950" />
      </span>
    </span>
  );
}

const DELAYS = [-0.2, -0.6, -0.9, -0.4, -0.7, -0.1, -0.85, -0.3, -0.55, -0.15, -0.95, -0.45];

/** Sound bars, moving while something plays and resting when it's paused. */
export function SoundBars({ playing, count = 4, className, barClassName }: { playing: boolean; count?: number; className?: string; barClassName?: string }) {
  return (
    <span aria-hidden className={cn('flex items-end gap-[3px]', className)}>
      {DELAYS.slice(0, count).map((d, i) => (
        <span
          key={i}
          className={cn(
            'h-full w-1 origin-bottom rounded-full bg-rose-300 motion-safe:animate-eq',
            !playing && 'scale-y-[0.3] opacity-40 [animation-play-state:paused]',
            barClassName,
          )}
          style={{ animationDelay: `${d}s` }}
        />
      ))}
    </span>
  );
}

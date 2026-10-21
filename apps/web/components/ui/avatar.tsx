import type { PartnerSlot } from '@us/shared';
import { cn } from '@/lib/cn';

const SIZES = { sm: 'h-8 w-8 text-micro', md: 'h-11 w-11 text-small', lg: 'h-20 w-20 text-title', xl: 'h-32 w-32 text-hero' };

const SLOT = {
  a: 'bg-rose-100 text-rose-800 ring-rose-400',
  b: 'bg-teal-100 text-teal-800 ring-teal-500',
};

interface AvatarProps {
  name: string;
  slot: PartnerSlot;
  src?: string | null;
  size?: keyof typeof SIZES;
  /** Presence dot. */
  online?: boolean;
  className?: string;
}

/** Initial in the display serif on the person's colour — never a grey placeholder. */
export function Avatar({ name, slot, src, size = 'md', online, className }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '·';
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        className={cn(
          'inline-flex items-center justify-center overflow-hidden rounded-full font-serif italic ring-2 ring-offset-2 ring-offset-paper',
          SIZES[size],
          SLOT[slot],
        )}
        aria-hidden={!src}
      >
        {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initial}
      </span>
      {online !== undefined && (
        <span
          className={cn(
            'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-paper',
            online ? 'bg-sage-400' : 'bg-plum-200',
          )}
          aria-label={online ? `${name} is here now` : `${name} is away`}
          role="img"
        />
      )}
    </span>
  );
}

/**
 * The couple's mark: two overlapping circles in each person's colour.
 * Appears on auth, pairing and the nav — it's the brand.
 */
export function Seal({ size = 40, joined = true, className }: { size?: number; joined?: boolean; className?: string }) {
  const r = size * 0.32;
  const offset = joined ? size * 0.18 : size * 0.34;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden>
      <circle cx={size / 2 - offset} cy={size / 2} r={r} className="fill-rose-400 transition-all duration-slow ease-out" />
      <circle
        cx={size / 2 + offset}
        cy={size / 2}
        r={r}
        className="fill-teal-500 mix-blend-multiply transition-all duration-slow ease-out dark:opacity-90 dark:mix-blend-normal"
      />
    </svg>
  );
}

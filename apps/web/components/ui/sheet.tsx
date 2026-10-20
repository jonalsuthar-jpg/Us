import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * Surfaces. Deliberately not one card style repeated everywhere:
 *  - paper:  a sheet lifted off the page (hairline + a soft, warm, offset shadow)
 *  - inset:  a recessed well, for grouped controls
 *  - note:   a single-edge rule in a module colour, for highlighted content
 *  - night:  plum, for call screens and focused moments
 */
const styles = cva('', {
  variants: {
    tone: {
      paper:
        'rounded-sheet border border-paper-edge bg-paper-raised shadow-[0_1px_0_rgba(36,25,51,0.04),0_12px_32px_-18px_rgba(36,25,51,0.28)]',
      inset: 'rounded-sheet bg-paper-sunken',
      note: 'rounded-r-sheet border-l-[3px] bg-paper-raised',
      night: 'rounded-sheet bg-plum-800 text-paper',
    },
    accent: {
      none: '',
      rose: 'border-l-rose-400',
      teal: 'border-l-teal-500',
      gold: 'border-l-gold-400',
      sage: 'border-l-sage-400',
      plum: 'border-l-plum-500',
    },
    pad: { none: '', sm: 'p-4', md: 'p-6', lg: 'p-8' },
  },
  defaultVariants: { tone: 'paper', accent: 'none', pad: 'md' },
});

export interface SheetProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof styles> {}

export function Sheet({ tone, accent, pad, className, ...props }: SheetProps) {
  return <div className={cn(styles({ tone, accent, pad }), className)} {...props} />;
}

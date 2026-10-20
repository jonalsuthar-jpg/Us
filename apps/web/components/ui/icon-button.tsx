import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const styles = cva(
  [
    'inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-quick',
    'disabled:pointer-events-none disabled:opacity-40',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2',
  ],
  {
    variants: {
      tone: {
        paper: 'text-ink-soft hover:bg-paper-sunken hover:text-ink focus-visible:ring-offset-paper',
        rose: 'bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:ring-offset-paper',
        night: 'bg-white/10 text-paper hover:bg-white/20 focus-visible:ring-offset-plum-800',
        /** Toggled-off state on call screens: inverted so "off" is unmistakable. */
        nightOff: 'bg-paper text-plum-800 hover:bg-paper-sunken focus-visible:ring-offset-plum-800',
        end: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-offset-plum-800',
        accept: 'bg-sage-500 text-white hover:bg-sage-600 focus-visible:ring-offset-plum-800',
      },
      size: { sm: 'h-9 w-9', md: 'h-11 w-11', lg: 'h-14 w-14', xl: 'h-[72px] w-[72px]' },
    },
    defaultVariants: { tone: 'paper', size: 'md' },
  },
);

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof styles> {
  /** Required: icon-only buttons must have an accessible name. */
  label: string;
  pressed?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tone, size, pressed, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(styles({ tone, size }), className)}
      {...props}
    >
      {children}
    </button>
  );
});

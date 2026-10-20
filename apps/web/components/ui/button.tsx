import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const buttonStyles = cva(
  [
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-sans font-medium',
    'transition-[background-color,color,box-shadow,transform] duration-quick ease-out',
    'active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
  ],
  {
    variants: {
      variant: {
        /** The one thing to do on a screen. */
        primary: 'bg-rose-600 text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)] hover:bg-rose-700',
        /** Ink outline — secondary actions on paper. */
        secondary: 'border border-ink/20 bg-transparent text-ink hover:border-ink/40 hover:bg-paper-sunken',
        /** Text-only, for tertiary actions. */
        quiet: 'bg-transparent text-ink-soft underline-offset-4 hover:text-ink hover:underline',
        /** On plum surfaces (call screens). */
        night: 'bg-white/10 text-paper backdrop-blur hover:bg-white/20 focus-visible:ring-offset-plum-800',
        /** Ending things (calls). Deep rose, never alarm-red. */
        end: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-offset-plum-800',
        accept: 'bg-sage-500 text-white hover:bg-sage-600 focus-visible:ring-offset-plum-800',
      },
      size: {
        sm: 'h-9 rounded-control px-3.5 text-small',
        md: 'h-11 rounded-control px-5 text-body',
        lg: 'h-14 rounded-control px-7 text-lead',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild, loading, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      className={cn(buttonStyles({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </Comp>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
    />
  );
}

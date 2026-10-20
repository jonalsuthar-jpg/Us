import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const inputStyles = cn(
  'w-full rounded-control border border-paper-edge bg-paper-raised px-4 text-body text-ink placeholder:text-ink-muted/70',
  'transition-[border-color,box-shadow] duration-quick',
  'hover:border-ink/25 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-400/15',
  'aria-[invalid=true]:border-rose-600',
);

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

/** Label + input + hint/error, wired for screen readers. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, className, id, ...props },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-small font-medium text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(inputStyles, 'h-12', className)}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-small text-rose-700" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-small text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

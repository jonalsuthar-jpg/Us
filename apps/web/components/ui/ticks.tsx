import type { MessageStatus } from '@us/shared';
import { AlertCircle, Clock3 } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * WhatsApp-style receipts, drawn inside my (filled) bubble:
 *   pending  → clock
 *   sent     → single tick, translucent
 *   delivered→ double tick, translucent
 *   read     → double tick, warm gold
 */
export function Ticks({
  status,
  pending,
  failed,
  className,
}: {
  status: MessageStatus;
  pending?: boolean;
  failed?: boolean;
  className?: string;
}) {
  if (failed) return <AlertCircle className={cn('h-3.5 w-3.5 text-gold-200', className)} aria-label="Not sent" />;
  if (pending) return <Clock3 className={cn('h-3 w-3 opacity-70', className)} aria-label="Sending" />;

  const label = { sent: 'Sent', delivered: 'Delivered', read: 'Read' }[status];
  const double = status !== 'sent';
  return (
    <svg
      viewBox="0 0 18 11"
      className={cn('h-[11px] w-[18px]', status === 'read' ? 'text-gold-200' : 'opacity-65', className)}
      role="img"
      aria-label={label}
    >
      <path d="M1 6.2 4.3 9.4 11.2 1.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {double && (
        <path d="M7.4 8.6 8.3 9.4 15.2 1.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

import { formatClock, type Message, type PartnerSlot } from '@us/shared';
import { Ticks } from '@/components/ui/ticks';
import { cn } from '@/lib/cn';

const MINE: Record<PartnerSlot, string> = { a: 'bg-rose-600 text-white', b: 'bg-teal-600 text-white' };
const THEIRS: Record<PartnerSlot, string> = {
  a: 'bg-rose-50 text-ink border border-rose-200/70',
  b: 'bg-teal-50 text-ink border border-teal-200/70',
};

interface BubbleProps {
  message: Message;
  mine: boolean;
  slot: PartnerSlot;
  authorName: string;
  /** First / last of a run from the same sender — controls spacing + tail. */
  first: boolean;
  last: boolean;
  onRetry?: () => void;
}

export function Bubble({ message, mine, slot, authorName, first, last, onRetry }: BubbleProps) {
  return (
    <li className={cn('flex flex-col', mine ? 'items-end' : 'items-start', first ? 'mt-3' : 'mt-0.5')}>
      <div
        className={cn(
          'relative max-w-[min(78%,34rem)] rounded-bubble px-3.5 pb-1.5 pt-2 text-body',
          mine ? MINE[slot] : THEIRS[slot],
          last && (mine ? 'rounded-br-hair' : 'rounded-bl-hair'),
          message.pending && 'opacity-80',
        )}
      >
        <span className="sr-only">{mine ? 'You' : authorName}: </span>
        <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.body}</span>
        {/* Meta floats bottom-right; the spacer reserves room on the last line. */}
        <span aria-hidden className="inline-block w-[4.25rem]" />
        <span
          className={cn(
            'absolute bottom-1.5 right-3 flex items-center gap-1 text-[11px] leading-none',
            mine ? 'text-white/75' : 'text-ink-muted',
          )}
        >
          <time dateTime={message.created_at} suppressHydrationWarning>{formatClock(message.created_at)}</time>
          {mine && <Ticks status={message.status} pending={message.pending} failed={message.failed} />}
        </span>
      </div>
      {message.failed && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded text-micro font-medium text-rose-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          Not sent — tap to retry
        </button>
      )}
    </li>
  );
}

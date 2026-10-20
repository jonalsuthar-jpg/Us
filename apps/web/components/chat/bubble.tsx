import { formatClock, formatVoiceLength, groupReactions, QUICK_REACTIONS, type Message, type PartnerSlot } from '@us/shared';
import { Copy, Pin, PinOff, Reply } from 'lucide-react';
import type { ReactNode } from 'react';
import { Ticks } from '@/components/ui/ticks';
import { cn } from '@/lib/cn';

const MINE: Record<PartnerSlot, string> = {
  a: 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-[0_6px_16px_-10px_rgba(196,29,85,0.7)]',
  b: 'bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-[0_6px_16px_-10px_rgba(10,119,109,0.7)]',
};
// Their messages: a clean raised card, tinted only at the edge with their colour.
const THEIRS: Record<PartnerSlot, string> = {
  a: 'bg-paper-raised text-ink border border-rose-200/60 shadow-[0_4px_14px_-10px_rgba(36,25,51,0.35)]',
  b: 'bg-paper-raised text-ink border border-teal-200/60 shadow-[0_4px_14px_-10px_rgba(36,25,51,0.35)]',
};

export interface ReplyQuote {
  id: string;
  author: string;
  text: string;
}

interface BubbleProps {
  message: Message;
  mine: boolean;
  slot: PartnerSlot;
  authorName: string;
  /** Needed to mark my own reactions; omit in static previews. */
  myId?: string;
  /** First / last of a run from the same sender — controls spacing + tail. */
  first: boolean;
  last: boolean;
  /** Signed URL for a photo / voice note (or the local preview while sending). */
  mediaUrl?: string;
  quote?: ReplyQuote | null;
  /** The action bar (reactions, reply, pin) is open on this message. */
  active?: boolean;
  highlighted?: boolean;
  onToggleActive?: () => void;
  onRetry?: () => void;
  onReact?: (emoji: string | null) => void;
  onReply?: () => void;
  onPin?: (pinned: boolean) => void;
  onOpenPhoto?: (url: string) => void;
  onJumpTo?: (id: string) => void;
}

export function Bubble({
  message,
  mine,
  slot,
  authorName,
  myId = '',
  first,
  last,
  mediaUrl,
  quote,
  active,
  highlighted,
  onToggleActive,
  onRetry,
  onReact,
  onReply,
  onPin,
  onOpenPhoto,
  onJumpTo,
}: BubbleProps) {
  const reactions = groupReactions(message.reactions, myId);
  const myReaction = message.reactions?.[myId] ?? null;
  const url = mediaUrl ?? message.localUri;
  const hasText = !!message.body?.trim();
  const settled = !message.pending && !message.failed;

  return (
    <li
      id={`msg-${message.id}`}
      className={cn('group/msg flex flex-col', mine ? 'items-end' : 'items-start', first ? 'mt-3' : 'mt-0.5', reactions.length && 'mb-3')}
    >
      {active && settled ? (
        <div
          role="toolbar"
          aria-label="Message actions"
          className={cn('mb-1 flex items-center gap-0.5 rounded-full border border-paper-edge bg-paper-raised p-1 shadow-[0_8px_24px_-12px_rgba(36,25,51,0.4)]')}
        >
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={myReaction === e ? `Remove ${e}` : `React ${e}`}
              aria-pressed={myReaction === e}
              onClick={() => onReact?.(myReaction === e ? null : e)}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full text-[20px] transition-transform hover:scale-110 hover:bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                myReaction === e && 'bg-rose-50',
              )}
            >
              {e}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-paper-edge" aria-hidden />
          <ToolButton label="Reply" onClick={onReply}>
            <Reply className="h-4 w-4" />
          </ToolButton>
          <ToolButton label={message.pinned_at ? 'Unpin' : 'Pin'} onClick={() => onPin?.(!message.pinned_at)}>
            {message.pinned_at ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </ToolButton>
          {hasText ? (
            <ToolButton label="Copy" onClick={() => void navigator.clipboard?.writeText(message.body ?? '')}>
              <Copy className="h-4 w-4" />
            </ToolButton>
          ) : null}
        </div>
      ) : null}

      <div className="relative max-w-[min(78%,34rem)]">
        <div
          onClick={(e) => {
            // Taps on links, media controls and quotes do their own thing.
            if ((e.target as HTMLElement).closest('a,button,audio')) return;
            onToggleActive?.();
          }}
          className={cn(
            'relative cursor-default rounded-bubble text-body transition-shadow',
            url && message.media_kind === 'image' ? 'overflow-hidden p-1' : 'px-3.5 pb-1.5 pt-2',
            mine ? MINE[slot] : THEIRS[slot],
            last && (mine ? 'rounded-br-hair' : 'rounded-bl-hair'),
            message.pending && 'opacity-80',
            (active || highlighted) && 'ring-2 ring-gold-400 ring-offset-2 ring-offset-paper',
          )}
        >
          <span className="sr-only">{mine ? 'You' : authorName}: </span>

          {quote ? (
            <button
              type="button"
              onClick={() => onJumpTo?.(quote.id)}
              className={cn(
                'mb-1.5 block w-full rounded-[10px] border-l-[3px] px-2.5 py-1.5 text-left text-small focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                mine ? 'border-white/70 bg-white/15' : 'border-ink/25 bg-paper-sunken',
                url && message.media_kind === 'image' && 'm-1 w-[calc(100%-0.5rem)]',
              )}
            >
              <span className={cn('block font-medium', mine ? 'text-white' : 'text-ink')}>{quote.author}</span>
              <span className={cn('line-clamp-2', mine ? 'text-white/85' : 'text-ink-soft')}>{quote.text}</span>
            </button>
          ) : null}

          {message.media_kind === 'image' ? (
            url ? (
              <button type="button" onClick={() => onOpenPhoto?.(url)} className="block cursor-zoom-in focus-visible:outline-none" aria-label="Open photo">
                <img
                  src={url}
                  alt=""
                  className="max-h-80 w-full rounded-[14px] object-cover"
                  style={message.media_meta?.width && message.media_meta?.height ? { aspectRatio: `${message.media_meta.width} / ${message.media_meta.height}` } : undefined}
                />
              </button>
            ) : (
              <span className="block h-48 w-64 animate-pulse rounded-[14px] bg-black/10" aria-label="Photo loading" />
            )
          ) : null}

          {message.media_kind === 'audio' ? (
            <span className="flex min-w-[220px] flex-col gap-1 py-0.5">
              {url ? (
                <audio controls preload="metadata" src={url} className="h-9 w-full" aria-label={`Voice note, ${formatVoiceLength(message.media_meta?.duration_ms)}`} />
              ) : (
                <span className="h-9 animate-pulse rounded-full bg-black/10" />
              )}
              <span className={cn('text-micro', mine ? 'text-white/80' : 'text-ink-muted')}>🎤 {formatVoiceLength(message.media_meta?.duration_ms)}</span>
            </span>
          ) : null}

          {hasText ? (
            <span className={cn('whitespace-pre-wrap break-words [overflow-wrap:anywhere]', url && message.media_kind === 'image' && 'block px-2.5 pb-1 pt-1.5')}>
              {message.body}
            </span>
          ) : null}
          {/* Meta floats bottom-right; the spacer reserves room on the last line. */}
          <span aria-hidden className={cn('inline-block', message.pinned_at ? 'w-[5.25rem]' : 'w-[4.25rem]')} />
          <span
            className={cn(
              'absolute bottom-1.5 right-3 flex items-center gap-1 text-[11px] leading-none',
              mine ? 'text-white/75' : 'text-ink-muted',
              url && message.media_kind === 'image' && !hasText && 'rounded-full bg-black/40 px-1.5 py-1 text-white',
            )}
          >
            {message.pinned_at ? <Pin className="h-3 w-3" aria-label="Pinned" /> : null}
            <time dateTime={message.created_at} suppressHydrationWarning>
              {formatClock(message.created_at)}
            </time>
            {mine && <Ticks status={message.status} pending={message.pending} failed={message.failed} />}
          </span>
        </div>

        {reactions.length ? (
          <span className="absolute -bottom-3.5 left-3 flex gap-1">
            {reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onReact?.(r.mine ? null : r.emoji)}
                aria-label={`${r.emoji} ${r.count}${r.mine ? ', yours. Remove' : ''}`}
                className={cn(
                  'flex h-6 items-center gap-0.5 rounded-full border bg-paper-raised px-1.5 text-[13px] leading-none shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                  r.mine ? 'border-rose-300' : 'border-paper-edge',
                )}
              >
                {r.emoji}
                {r.count > 1 ? <span className="text-micro text-ink-muted">{r.count}</span> : null}
              </button>
            ))}
          </span>
        ) : null}
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

function ToolButton({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-paper-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
    >
      {children}
    </button>
  );
}

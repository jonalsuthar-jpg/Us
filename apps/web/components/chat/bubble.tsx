import { formatClock, formatVoiceLength, groupReactions, isGiphyUrl, isLinkedMedia, isOurStickerPath, messagePreview, MORE_REACTIONS, QUICK_REACTIONS, type Message, type PartnerSlot } from '@us/shared';
import { Ban, Copy, Download, Pin, PinOff, Plus, Reply, Sticker, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Ticks } from '@/components/ui/ticks';
import { cn } from '@/lib/cn';

// Mine: a light wash of my colour with dark text, so every word reads clearly.
const MINE: Record<PartnerSlot, string> = {
  a: 'bg-rose-100 text-ink shadow-[0_1px_0.5px_rgba(20,14,28,0.08)]',
  b: 'bg-teal-100 text-ink shadow-[0_1px_0.5px_rgba(20,14,28,0.08)]',
};
const THEIRS: Record<PartnerSlot, string> = {
  a: 'bg-paper-raised text-ink shadow-[0_1px_0.5px_rgba(20,14,28,0.08)]',
  b: 'bg-paper-raised text-ink shadow-[0_1px_0.5px_rgba(20,14,28,0.08)]',
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
  /** Keep a sticker we made (sent in chat) in Our stickers. */
  onKeepSticker?: () => void;
  onOpenPhoto?: (url: string) => void;
  /** Photos, videos, GIFs and stickers: save as a file. */
  onDownload?: () => void;
  onDelete?: () => void;
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
  onKeepSticker,
  onOpenPhoto,
  onDownload,
  onDelete,
  onJumpTo,
}: BubbleProps) {
  const reactions = groupReactions(message.reactions, myId);
  const myReaction = message.reactions?.[myId] ?? null;
  const url = mediaUrl ?? message.localUri;
  const hasText = !!message.body?.trim();
  const settled = !message.pending && !message.failed;
  // GIFs and stickers: GIPHY links, or a sticker we made (a file in our chat
  // folder). Stickers float without a bubble.
  const giphy = isLinkedMedia(message.media_kind) && isGiphyUrl(message.media_meta?.url) ? message.media_meta!.url! : null;
  const ours = message.media_kind === 'sticker' && !!message.media_path ? (url ?? null) : null;
  const linked = giphy ?? ours;
  const sticker = message.media_kind === 'sticker' && !!(giphy || message.media_path);
  const deleted = !!message.deleted_at;
  // A GIF or sticker whose file isn't here yet: hold its place, so it never looks empty.
  const waiting = isLinkedMedia(message.media_kind) && !linked && !!message.media_path;
  const still = giphy ? (message.localUri ?? (typeof message.media_meta?.still === 'string' ? message.media_meta.still : undefined)) : undefined;
  const hasMedia = !deleted && !!message.media_kind && message.media_kind !== 'audio';
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!active) setMore(false);
  }, [active]);
  const reactButton = (e: string) => (
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
  );

  return (
    <li
      id={`msg-${message.id}`}
      className={cn('group/msg flex flex-col', mine ? 'items-end' : 'items-start', first ? 'mt-3' : 'mt-0.5', reactions.length && 'mb-3')}
    >
      {active && settled ? (
        <div
          role="toolbar"
          aria-label="Message actions"
          className={cn(
            // Wraps rather than running off a phone-width screen.
            'mb-1 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-0.5 rounded-[22px] border border-paper-edge bg-paper-raised p-1 shadow-[0_8px_24px_-12px_rgba(36,25,51,0.4)] sm:max-w-md',
            mine ? 'justify-end' : 'justify-start',
          )}
        >
          {deleted ? null : (
            <>
              {QUICK_REACTIONS.map(reactButton)}
              <ToolButton label={more ? 'Fewer reactions' : 'More reactions'} onClick={() => setMore((v) => !v)}>
                <Plus className="h-4 w-4" />
              </ToolButton>
              {more ? <div className="flex w-full flex-wrap gap-0.5 border-y border-paper-edge py-1">{MORE_REACTIONS.map(reactButton)}</div> : null}
              <span className="mx-1 h-6 w-px bg-paper-edge" aria-hidden />
              <ToolButton label="Reply" onClick={onReply}>
                <Reply className="h-4 w-4" />
              </ToolButton>
              <ToolButton label={message.pinned_at ? 'Unpin' : 'Pin'} onClick={() => onPin?.(!message.pinned_at)}>
                {message.pinned_at ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              </ToolButton>
              {onKeepSticker && message.media_kind === 'sticker' && isOurStickerPath(message.media_path) ? (
                <ToolButton label="Save sticker" onClick={onKeepSticker}>
                  <Sticker className="h-4 w-4" />
                </ToolButton>
              ) : null}
              {hasText ? (
                <ToolButton label="Copy" onClick={() => void navigator.clipboard?.writeText(message.body ?? '')}>
                  <Copy className="h-4 w-4" />
                </ToolButton>
              ) : null}
              {hasMedia && onDownload ? (
                <ToolButton label="Download" onClick={onDownload}>
                  <Download className="h-4 w-4" />
                </ToolButton>
              ) : null}
            </>
          )}
          {onDelete ? (
            <ToolButton label="Delete" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
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
          onDoubleClick={(e) => {
            // Double-tap toggles a heart.
            if (!settled || (e.target as HTMLElement).closest('a,button,audio')) return;
            window.getSelection()?.removeAllRanges();
            onReact?.(myReaction === '❤️' ? null : '❤️');
          }}
          className={cn(
            'relative cursor-default rounded-bubble text-body transition-shadow',
            (url && message.media_kind === 'image') || linked || waiting ? 'overflow-hidden p-1' : 'px-3.5 pb-1.5 pt-2',
            sticker ? 'bg-transparent shadow-none' : mine ? MINE[slot] : THEIRS[slot],
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
                mine ? 'border-rose-600 bg-paper-raised/60' : 'border-ink/25 bg-paper-sunken',
                url && message.media_kind === 'image' && 'm-1 w-[calc(100%-0.5rem)]',
              )}
            >
              <span className="block font-semibold text-ink">{quote.author}</span>
              <span className="line-clamp-2 text-ink-soft">{quote.text}</span>
            </button>
          ) : null}

          {waiting ? (
            <span
              className={cn('flex items-center justify-center rounded-[18px] bg-black/5', sticker ? 'w-36' : 'w-60')}
              style={{ aspectRatio: message.media_meta?.width && message.media_meta?.height ? `${message.media_meta.width} / ${message.media_meta.height}` : '1' }}
              aria-label={sticker ? 'Sticker loading' : 'GIF loading'}
            >
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-ink/20 border-t-ink/50" />
            </span>
          ) : null}
          {linked ? (
            <img
              src={linked}
              alt={sticker ? 'Sticker' : 'GIF'}
              loading="lazy"
              className={cn('block max-w-full bg-contain bg-center bg-no-repeat object-contain', sticker ? 'w-36' : 'w-60 rounded-[14px]')}
              // GIPHY: the still frame (or my picker's preview) shows while the GIF loads.
              style={{
                aspectRatio: message.media_meta?.width && message.media_meta?.height ? `${message.media_meta.width} / ${message.media_meta.height}` : undefined,
                backgroundImage: still ? `url(${still})` : undefined,
              }}
            />
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

          {message.media_kind === 'video' ? (
            url ? (
              <video
                controls
                playsInline
                preload="metadata"
                src={url}
                className="block max-h-96 w-72 max-w-full rounded-[14px] bg-black"
                style={message.media_meta?.width && message.media_meta?.height ? { aspectRatio: `${message.media_meta.width} / ${message.media_meta.height}` } : undefined}
                aria-label={`Video, ${formatVoiceLength(message.media_meta?.duration_ms)}`}
              />
            ) : (
              <span className="block h-48 w-64 animate-pulse rounded-[14px] bg-black/20" aria-label="Video loading" />
            )
          ) : null}

          {message.media_kind === 'audio' ? (
            <span className="flex min-w-[220px] flex-col gap-1 py-0.5">
              {url ? (
                <audio controls preload="metadata" src={url} className="h-9 w-full" aria-label={`Voice note, ${formatVoiceLength(message.media_meta?.duration_ms)}`} />
              ) : (
                <span className="h-9 animate-pulse rounded-full bg-black/10" />
              )}
              <span className="text-micro text-ink-muted">🎤 {formatVoiceLength(message.media_meta?.duration_ms)}</span>
            </span>
          ) : null}

          {deleted ? (
            <span className="inline-flex items-center gap-1.5 italic text-ink-muted">
              <Ban className="h-3.5 w-3.5" aria-hidden />
              {mine ? 'You deleted this message' : 'This message was deleted'}
            </span>
          ) : null}
          {hasText ? (
            <span className={cn('whitespace-pre-wrap break-words [overflow-wrap:anywhere]', url && message.media_kind === 'image' && 'block px-2.5 pb-1 pt-1.5')}>
              {message.body}
            </span>
          ) : null}
          {/* Encrypted, and this browser can't open it (yet). */}
          {message.e2ee === 'locked' || message.e2ee === 'failed' ? <span className="italic text-ink-muted">{messagePreview(message)}</span> : null}
          {/* Meta floats bottom-right; the spacer reserves room on the last line. */}
          <span aria-hidden className={cn('inline-block', message.pinned_at ? 'w-[5.25rem]' : 'w-[4.25rem]')} />
          <span
            className={cn(
              'absolute bottom-1.5 right-3 flex items-center gap-1 text-[12px] leading-none text-ink-muted',
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

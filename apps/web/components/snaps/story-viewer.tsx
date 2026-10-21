'use client';

import * as D from '@radix-ui/react-dialog';
import {
  deleteSnap,
  formatClock,
  keepSnap,
  markSnapSeen,
  reactToSnap,
  replyToSnap,
  SNAP_REACTIONS,
  SNAP_SHOW_MS,
  snapTimeLeft,
  type Snap,
} from '@us/shared';
import { useCouple } from '@us/shared/react';
import { BookmarkCheck, BookmarkPlus, Check, Send, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { cn } from '@/lib/cn';

interface Props {
  /** The story being watched: my snaps or my partner's, oldest first. */
  snaps: Snap[] | null;
  start: number;
  kept: Set<string>;
  onClose: () => void;
  mutate: <R>(write: () => Promise<R>) => Promise<R>;
}

/**
 * Full-screen story. Each snap shows for a few seconds; click the left third
 * to go back, anywhere else to go on; hold to pause. My partner's snaps get
 * reactions and a reply box; mine show whether they've been seen.
 */
export function StoryViewer({ snaps, start, kept, onClose, mutate }: Props) {
  const { sb, me, partner } = useCouple();
  const [index, setIndex] = useState(start);
  const [progress, setProgress] = useState(0);
  const [held, setHeld] = useState(false);
  const [typing, setTyping] = useState(false);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = !!snaps?.length;
  const snap = snaps?.[Math.min(index, (snaps?.length ?? 1) - 1)];
  const mine = snap?.author_id === me.id;
  const paused = held || typing || busy;

  useEffect(() => {
    if (snaps) setIndex(start);
    // Only when a story opens, not as its snaps refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!snaps, start]);

  // My partner's snap: mark it seen the first time it's on screen.
  const snapId = snap?.id;
  useEffect(() => {
    if (!snap || mine || snap.seen_at) return;
    void mutate(() => markSnapSeen(sb, snap.id)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapId]);

  useEffect(() => {
    setProgress(0);
    setNote(null);
  }, [snapId]);

  // Advance through the story; paused while held, typing or saving.
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!open || paused) {
      last.current = null;
      return;
    }
    let frame = requestAnimationFrame(function tick(t) {
      if (last.current !== null) {
        const step = (t - last.current) / SNAP_SHOW_MS;
        setProgress((p) => Math.min(1, p + step));
      }
      last.current = t;
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, paused, snapId]);
  useEffect(() => {
    if (progress >= 1) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  function next() {
    if (!snaps) return;
    if (index + 1 < snaps.length) setIndex(index + 1);
    else onClose();
  }
  function back() {
    if (index > 0) setIndex(index - 1);
    else setProgress(0);
  }

  async function act(label: string, write: () => Promise<unknown>) {
    setBusy(true);
    setNote(null);
    try {
      await mutate(write);
      setNote(label);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    if (!snap || !reply.trim()) return;
    const text = reply;
    setReply('');
    (document.activeElement as HTMLElement | null)?.blur();
    await act('Sent to your chat', () => replyToSnap(sb, snap, me.id, text));
  }

  return (
    <D.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-black" />
        <D.Content className="fixed inset-0 z-[60] flex flex-col bg-black text-white focus:outline-none" aria-describedby={undefined}>
          <D.Title className="sr-only">{mine ? 'Your snaps' : `${partner.display_name}’s snaps`}</D.Title>
          {snap ? (
            <>
              <div className="absolute inset-x-0 top-0 z-10 space-y-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <div className="flex gap-1" aria-hidden>
                  {snaps!.map((s, i) => (
                    <span key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                      <span className="block h-full bg-white" style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }} />
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-small">
                    <span className="font-semibold">{mine ? 'You' : partner.display_name}</span>
                    <span className="text-white/70">
                      {' '}
                      · {formatClock(snap.created_at)} · {snapTimeLeft(snap.expires_at)}
                    </span>
                  </p>
                  <D.Close aria-label="Close" className="rounded-full p-2 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
                    <X className="h-5 w-5" />
                  </D.Close>
                </div>
              </div>

              <div
                className="relative flex min-h-0 flex-1 select-none items-center justify-center"
                onPointerDown={() => setHeld(true)}
                onPointerUp={(e) => {
                  setHeld(false);
                  const { left, width } = e.currentTarget.getBoundingClientRect();
                  if (e.clientX - left < width / 3) back();
                  else next();
                }}
                onPointerLeave={() => setHeld(false)}
              >
                {snap.url ? <img src={snap.url} alt={snap.caption ?? 'Snap'} draggable={false} className="max-h-full max-w-full object-contain" /> : null}
                {snap.caption ? (
                  <p className="absolute inset-x-6 bottom-6 mx-auto max-w-lg rounded-control bg-black/55 px-4 py-2 text-center text-body backdrop-blur">{snap.caption}</p>
                ) : null}
              </div>

              <div className="space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                {note ? (
                  <p role="status" className="text-center text-small text-white/80">
                    {note}
                  </p>
                ) : null}
                {mine ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-1.5 text-small text-white/80">
                      {snap.seen_at ? (
                        <>
                          <Check className="h-4 w-4" aria-hidden /> Seen {formatClock(snap.seen_at)}
                          {snap.reaction ? <span className="ml-1 text-lead">{snap.reaction}</span> : null}
                        </>
                      ) : (
                        `Not seen yet`
                      )}
                    </p>
                    <div className="flex gap-2">
                      <KeepButton kept={kept.has(snap.id)} busy={busy} onKeep={() => void act('Kept in Memories', () => keepSnap(sb, snap, me.id, 'A snap'))} />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act('Deleted', () => deleteSnap(sb, snap))}
                        className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-small hover:bg-white/20 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden /> Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-1" role="group" aria-label="React">
                        {SNAP_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            disabled={busy}
                            aria-pressed={snap.reaction === emoji}
                            onClick={() => void act('', () => reactToSnap(sb, snap.id, snap.reaction === emoji ? null : emoji))}
                            className={cn(
                              'rounded-full p-1.5 text-[24px] leading-none transition-transform hover:scale-110 disabled:opacity-50',
                              snap.reaction === emoji && 'bg-white/25',
                            )}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <KeepButton
                        kept={kept.has(snap.id)}
                        busy={busy}
                        onKeep={() => void act('Kept in Memories', () => keepSnap(sb, snap, me.id, `A snap from ${partner.display_name}`))}
                      />
                    </div>
                    <form onSubmit={sendReply} className="flex gap-2">
                      <input
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        onFocus={() => setTyping(true)}
                        onBlur={() => setTyping(false)}
                        maxLength={4000}
                        placeholder={`Reply to ${partner.display_name}…`}
                        className="h-11 min-w-0 flex-1 rounded-full bg-white/10 px-4 text-body text-white placeholder:text-white/60 focus:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                      />
                      <button
                        type="submit"
                        aria-label="Send reply"
                        disabled={!reply.trim() || busy}
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-600 hover:bg-rose-700 disabled:opacity-40"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </form>
                  </>
                )}
              </div>
            </>
          ) : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function KeepButton({ kept, busy, onKeep }: { kept: boolean; busy: boolean; onKeep: () => void }) {
  return (
    <button
      type="button"
      disabled={busy || kept}
      onClick={onKeep}
      className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-small hover:bg-white/20 disabled:opacity-70"
    >
      {kept ? <BookmarkCheck className="h-4 w-4" aria-hidden /> : <BookmarkPlus className="h-4 w-4" aria-hidden />}
      {kept ? 'In Memories' : 'Keep'}
    </button>
  );
}

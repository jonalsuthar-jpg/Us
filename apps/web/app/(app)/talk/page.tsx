'use client';

import { clusters, formatDay, groupByDay, listPinned, messagePreview, searchMessages, snapReplyQuote, type Message } from '@us/shared';
import { useCallManager, useChatMedia, useCouple, useCoupleData, useFeature, useMessages, useSnaps, useTyping } from '@us/shared/react';
import { ChevronsDown, Phone, Pin, Search, Video } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MobileSettingsLink } from '@/components/app/app-shell';
import { FeatureOff } from '@/components/app/feature-off';
import { Bubble, type ReplyQuote } from '@/components/chat/bubble';
import { CallEntry } from '@/components/chat/call-entry';
import { Composer } from '@/components/chat/composer';
import { DoodleDialog } from '@/components/draw/doodle-dialog';
import { env } from '@/lib/env';
import { GifPicker } from '@/components/chat/gif-picker';
import { TypingBubble } from '@/components/chat/typing-bubble';
import { Avatar } from '@/components/ui/avatar';
import { Dialog } from '@/components/ui/dialog';
import { Lightbox } from '@/components/ui/lightbox';
import { Spinner } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { PrivacyBadge } from '@/components/ui/privacy';
import { usePageActive } from '@/lib/hooks';
import { shrinkPhoto } from '@/lib/image';

export default function TalkPage() {
  const chat = useFeature('chat');
  if (!chat) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-10 sm:py-14">
        <FeatureOff />
      </div>
    );
  }
  return <Thread />;
}

function Thread() {
  const { sb, couple, me, partner, mySlot, partnerSlot, partnerOnline, photoOf } = useCouple();
  const partnerPhoto = photoOf(partnerSlot);
  const active = usePageActive();
  const { messages, loading, hasOlder, loadOlder, send, retry, react, pin } = useMessages({ viewing: active });
  const media = useChatMedia(messages);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [panel, setPanel] = useState<'search' | 'pins' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const draw = useFeature('draw');
  const [doodle, setDoodle] = useState(false);

  // Pinned messages (any age). Refreshes on a partner's pin ping and when a loaded message's pin changes.
  const pins = useCoupleData('chat:pins', () => listPinned(sb, couple.id), [sb, couple.id]);
  const pinSignature = messages.map((m) => (m.pinned_at ? m.id : '')).join('');
  useEffect(() => {
    void pins.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinSignature]);

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const authorOf = (m: Pick<Message, 'sender_id'>) => (m.sender_id === me.id ? 'You' : partner.display_name);
  const snaps = useSnaps();
  const quoteFor = (m: Message): ReplyQuote | null => {
    const snap = snapReplyQuote(m, me.id, partner.display_name, [...(snaps.data?.mine ?? []), ...(snaps.data?.partner ?? [])]);
    if (snap) return { id: `snap-${m.snap_id}`, ...snap };
    if (!m.reply_to) return null;
    const r = byId.get(m.reply_to);
    return r ? { id: r.id, author: authorOf(r), text: messagePreview(r) } : { id: m.reply_to, author: 'Earlier message', text: 'Scroll up to see it' };
  };

  function jumpTo(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return false;
    stick.current = false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlight(id);
    setTimeout(() => setHighlight(null), 1600);
    return true;
  }

  const [gifs, setGifs] = useState(false);

  function sendWithReply(text: string, extras: Parameters<typeof send>[1] = {}) {
    stick.current = true;
    send(text, { ...extras, replyTo: replyTo?.id ?? null });
    setReplyTo(null);
  }

  async function sendPhoto(file: File, caption: string) {
    const { blob, type } = await shrinkPhoto(file);
    let meta: { width: number; height: number } | null = null;
    try {
      const bmp = await createImageBitmap(blob);
      meta = { width: bmp.width, height: bmp.height };
      bmp.close();
    } catch {
      // size is only a layout hint
    }
    sendWithReply(caption, { media: { kind: 'image', meta, localUri: URL.createObjectURL(blob), upload: { body: blob, contentType: type } } });
  }

  function sendVoice(blob: Blob, durationMs: number) {
    sendWithReply('', {
      media: { kind: 'audio', meta: { duration_ms: Math.round(durationMs) }, localUri: URL.createObjectURL(blob), upload: { body: blob, contentType: blob.type } },
    });
  }

  const fail = (e: unknown) => {
    setActionError((e as Error).message ?? 'That didn’t work. Try again.');
    setTimeout(() => setActionError(null), 4000);
  };
  const { partnerTyping, onComposerChange, onComposerSent } = useTyping();
  const calls = useCallManager();

  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // Scrolled well up: a button back to the latest, counting what arrived meanwhile.
  const [away, setAway] = useState(false);
  const [newBelow, setNewBelow] = useState(0);
  const newest = messages[messages.length - 1];
  const seenNewest = useRef(newest?.id);
  useEffect(() => {
    if (!newest || newest.id === seenNewest.current) return;
    seenNewest.current = newest.id;
    if (!away) return;
    if (newest.sender_id === me.id) toLatest();
    else setNewBelow((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newest, away, me.id]);
  function toLatest() {
    const el = scroller.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setNewBelow(0);
  }

  // Stay pinned to the bottom unless the reader has scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, partnerTyping, loading]);

  useEffect(() => {
    document.title = `${partner.display_name} · Us`;
  }, [partner.display_name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setActiveId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const latestPin = pins.data?.[0];

  const status = partnerTyping ? 'typing…' : partnerOnline ? 'online' : 'away';

  return (
    <div className="flex h-[calc(100dvh-64px-env(safe-area-inset-bottom))] flex-col bg-chat lg:h-dvh">
      <header className="flex items-center gap-3 border-b border-paper-edge bg-paper-raised px-4 py-2.5 sm:px-8">
        {partnerPhoto ? (
          <button
            type="button"
            onClick={() => setPhoto(partnerPhoto)}
            aria-label={`Open ${partner.display_name}'s photo`}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            <Avatar name={partner.display_name} slot={partnerSlot} online={partnerOnline} />
          </button>
        ) : (
          <Avatar name={partner.display_name} slot={partnerSlot} online={partnerOnline} />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lead text-ink">{partner.display_name}</h1>
          <p className={partnerTyping || partnerOnline ? 'text-micro font-medium text-teal-700' : 'text-micro text-ink-muted'}>{status}</p>
        </div>
        <PrivacyBadge privacy="shared" partnerName={partner.display_name} compact className="hidden sm:inline-flex" />
        <IconButton label="Search messages" onClick={() => setPanel('search')}>
          <Search className="h-5 w-5" />
        </IconButton>
        <IconButton label={`Voice call ${partner.display_name}`} onClick={() => void calls.startCall('audio')}>
          <Phone className="h-5 w-5" />
        </IconButton>
        <IconButton label={`Video call ${partner.display_name}`} onClick={() => void calls.startCall('video')}>
          <Video className="h-[22px] w-[22px]" />
        </IconButton>
        <MobileSettingsLink />
      </header>

      {latestPin ? (
        <button
          type="button"
          onClick={() => setPanel('pins')}
          className="flex items-center gap-3 border-b border-paper-edge/80 bg-gold-50/60 px-4 py-2 text-left hover:bg-gold-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400 sm:px-8"
        >
          <Pin className="h-4 w-4 shrink-0 text-gold-700" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-micro font-medium text-gold-700">
              Pinned{pins.data!.length > 1 ? ` · ${pins.data!.length}` : ''}
            </span>
            <span className="block truncate text-small text-ink">{messagePreview(latestPin)}</span>
          </span>
        </button>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            const below = el.scrollHeight - el.scrollTop - el.clientHeight;
            stick.current = below < 80;
            const up = below > 400;
            if (up !== away) {
              setAway(up);
              if (!up) setNewBelow(0);
            }
          }}
          className="scrollbar-quiet flex-1 overflow-y-auto px-4 sm:px-8"
        >
          <div className="mx-auto max-w-3xl pb-2 pt-6">
            {loading ? (
              <div className="flex justify-center py-20">
                <Spinner className="h-5 w-5 text-rose-400" />
              </div>
            ) : messages.length === 0 ? (
              <EmptyThread name={partner.display_name} />
            ) : (
              <>
                {hasOlder && (
                  <div className="mb-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        stick.current = false;
                        void loadOlder();
                      }}
                      className="rounded-full px-3 py-1 text-small text-ink-muted hover:bg-paper-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                    >
                      Earlier messages
                    </button>
                  </div>
                )}
                {groupByDay(messages).map((group) => (
                  <section key={group.key} aria-label={group.day}>
                    <DayDivider label={group.day} />
                    <ol>
                      {group.items.map((m, i) =>
                        m.kind === 'call' ? (
                          <CallEntry key={m.id} message={m} myId={me.id} onCallBack={(media) => void calls.startCall(media)} />
                        ) : (
                          <Bubble
                            key={m.id}
                            message={m}
                            mine={m.sender_id === me.id}
                            slot={m.sender_id === me.id ? mySlot : partnerSlot}
                            authorName={partner.display_name}
                            myId={me.id}
                            first={!clusters(group.items[i - 1], m)}
                            last={!clusters(m, group.items[i + 1])}
                            mediaUrl={m.media_path ? media[m.media_path] : undefined}
                            quote={quoteFor(m)}
                            active={activeId === m.id}
                            highlighted={highlight === m.id}
                            onToggleActive={() => setActiveId((id) => (id === m.id ? null : m.id))}
                            onRetry={() => retry(m.id)}
                            onReact={(emoji) => {
                              setActiveId(null);
                              void react(m.id, emoji).catch(fail);
                            }}
                            onReply={() => {
                              setActiveId(null);
                              setReplyTo(m);
                            }}
                            onPin={(p) => {
                              setActiveId(null);
                              void pin(m.id, p).catch(fail);
                            }}
                            onOpenPhoto={setPhoto}
                            onJumpTo={(id) => void jumpTo(id)}
                          />
                        ),
                      )}
                    </ol>
                  </section>
                ))}
              </>
            )}
            <TypingBubble visible={partnerTyping} name={partner.display_name} slot={partnerSlot} />
          </div>
        </div>
        {away ? (
          <button
            type="button"
            onClick={toLatest}
            aria-label={newBelow ? `Go to latest, ${newBelow} new` : 'Go to latest'}
            className="absolute bottom-3 right-4 flex h-11 w-11 items-center justify-center rounded-full border border-paper-edge bg-paper-raised text-ink-soft shadow-[0_8px_24px_-12px_rgba(36,25,51,0.5)] transition-colors hover:bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 sm:right-8"
          >
            <ChevronsDown className="h-5 w-5" />
            {newBelow ? (
              <span className="absolute -top-2 min-w-[20px] rounded-full bg-rose-600 px-1.5 text-center text-[11px] font-semibold leading-[18px] text-white">
                {newBelow > 99 ? '99+' : newBelow}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>

      <Dialog open={panel === 'search'} onOpenChange={(o) => !o && setPanel(null)} title="Search messages">
        {panel === 'search' ? (
          <SearchPanel
            authorOf={authorOf}
            onPick={(m) => {
              setPanel(null);
              if (!jumpTo(m.id)) fail(new Error(`That one is from ${formatDay(m.created_at)}. Tap “Earlier messages” to load it.`));
            }}
          />
        ) : null}
      </Dialog>
      <Dialog open={panel === 'pins'} onOpenChange={(o) => !o && setPanel(null)} title="Pinned" description="Either of you can pin or unpin.">
        <MessageList
          items={pins.data ?? []}
          empty="Nothing pinned."
          authorOf={authorOf}
          onPick={(m) => {
            setPanel(null);
            if (!jumpTo(m.id)) fail(new Error(`That one is from ${formatDay(m.created_at)}. Tap “Earlier messages” to load it.`));
          }}
        />
      </Dialog>
      <Lightbox src={photo} label="Photo" onClose={() => setPhoto(null)} />

      <div className="px-3 pb-3 pt-1 sm:px-8 sm:pb-6">
        <div className="mx-auto max-w-3xl">
          {actionError ? (
            <p role="alert" className="mb-2 px-2 text-small text-rose-700">
              {actionError}
            </p>
          ) : null}
          <Composer
            partnerName={partner.display_name}
            onChange={onComposerChange}
            replyTo={replyTo ? { id: replyTo.id, author: authorOf(replyTo), text: messagePreview(replyTo) } : null}
            onCancelReply={() => setReplyTo(null)}
            onSend={(t) => {
              onComposerSent();
              sendWithReply(t);
            }}
            onPhoto={(f, caption) => void sendPhoto(f, caption).catch(fail)}
            onVoice={sendVoice}
            onGif={env.giphyKey ? () => setGifs(true) : undefined}
            onDoodle={draw ? () => setDoodle(true) : undefined}
          />
          {draw ? <DoodleDialog open={doodle} onOpenChange={setDoodle} mode="chat" onChatPhoto={(f) => void sendPhoto(f, '').catch(fail)} /> : null}
          <GifPicker
            open={gifs}
            onOpenChange={setGifs}
            onPick={(kind, gif) => {
              setGifs(false);
              sendWithReply('', { media: { kind, meta: { url: gif.url, width: gif.width, height: gif.height } } });
            }}
          />
        </div>
      </div>
    </div>
  );
}

function MessageList({ items, empty, onPick, authorOf }: { items: Message[]; empty: string; onPick: (m: Message) => void; authorOf: (m: Message) => string }) {
  if (!items.length) return <p className="py-6 text-center text-small text-ink-muted">{empty}</p>;
  return (
    <ul className="-mx-2 max-h-[60vh] space-y-1 overflow-y-auto">
      {items.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onPick(m)}
            className="w-full rounded-control px-2 py-2 text-left hover:bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            <span className="block text-micro text-ink-muted">
              {authorOf(m)} · {formatDay(m.created_at)}
            </span>
            <span className="line-clamp-2 text-small text-ink">{messagePreview(m)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SearchPanel({ onPick, authorOf }: { onPick: (m: Message) => void; authorOf: (m: Message) => string }) {
  const { sb, couple } = useCouple();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Message[] | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) return setResults(null);
    let cancelled = false;
    const t = setTimeout(() => {
      void searchMessages(sb, couple.id, q)
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, sb, couple.id]);
  return (
    <div className="space-y-3">
      <input
        autoFocus
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Words you remember…"
        aria-label="Search messages"
        className="h-11 w-full rounded-control border border-paper-edge bg-paper px-4 text-body text-ink placeholder:text-ink-muted/70 focus:border-rose-300 focus:outline-none"
      />
      {results ? <MessageList items={results} empty="Nothing found." onPick={onPick} authorOf={authorOf} /> : null}
    </div>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex justify-center" role="separator" aria-label={label}>
      <span className="rounded-lg bg-paper-raised px-3 py-1 text-micro font-medium text-ink-soft shadow-[0_1px_0.5px_rgba(20,14,28,0.08)]">{label}</span>
    </div>
  );
}

function EmptyThread({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <p className="font-serif text-title font-light italic text-ink">Say the first thing.</p>
      <p className="mt-2 max-w-xs text-small text-ink-muted">
        Only you and {name} can ever read this thread.
      </p>
    </div>
  );
}

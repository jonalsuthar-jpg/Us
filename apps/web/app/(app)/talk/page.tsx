'use client';

import { clusters, groupByDay } from '@us/shared';
import { useCallManager, useCouple, useMessages, useTyping } from '@us/shared/react';
import { Phone, Video } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Bubble } from '@/components/chat/bubble';
import { CallEntry } from '@/components/chat/call-entry';
import { Composer } from '@/components/chat/composer';
import { TypingBubble } from '@/components/chat/typing-bubble';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { PrivacyBadge } from '@/components/ui/privacy';
import { usePageActive } from '@/lib/hooks';

export default function TalkPage() {
  const { me, partner, mySlot, partnerSlot, partnerOnline } = useCouple();
  const active = usePageActive();
  const { messages, loading, hasOlder, loadOlder, send, retry } = useMessages({ viewing: active });
  const { partnerTyping, onComposerChange, onComposerSent } = useTyping();
  const calls = useCallManager();

  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // Stay pinned to the bottom unless the reader has scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, partnerTyping, loading]);

  useEffect(() => {
    document.title = `${partner.display_name} · Us`;
  }, [partner.display_name]);

  const status = partnerTyping ? 'typing…' : partnerOnline ? 'here now' : 'away';

  return (
    <div className="flex h-[calc(100dvh-64px-env(safe-area-inset-bottom))] flex-col lg:h-dvh">
      <header className="flex items-center gap-3 border-b border-paper-edge/80 px-4 py-3 sm:px-8">
        <Avatar name={partner.display_name} slot={partnerSlot} online={partnerOnline} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-heading text-ink">{partner.display_name}</h1>
          <p className={partnerTyping ? 'text-small italic text-rose-700' : 'text-small text-ink-muted'}>{status}</p>
        </div>
        <PrivacyBadge privacy="shared" partnerName={partner.display_name} compact className="hidden sm:inline-flex" />
        <IconButton label={`Voice call ${partner.display_name}`} tone="rose" onClick={() => void calls.startCall('audio')}>
          <Phone className="h-5 w-5" />
        </IconButton>
        <IconButton label={`Video call ${partner.display_name}`} tone="rose" onClick={() => void calls.startCall('video')}>
          <Video className="h-5 w-5" />
        </IconButton>
      </header>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
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
                          first={!clusters(group.items[i - 1], m)}
                          last={!clusters(m, group.items[i + 1])}
                          onRetry={() => retry(m.id)}
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

      <div className="px-3 pb-3 pt-1 sm:px-8 sm:pb-6">
        <div className="mx-auto max-w-3xl">
          <Composer
            partnerName={partner.display_name}
            onChange={onComposerChange}
            onSend={(t) => {
              stick.current = true;
              onComposerSent();
              send(t);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-6 flex items-center gap-4" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-paper-edge" />
      <span className="font-display text-small italic text-ink-muted">{label}</span>
      <span className="h-px flex-1 bg-paper-edge" />
    </div>
  );
}

function EmptyThread({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <p className="font-display text-title font-light italic text-ink">Say the first thing.</p>
      <p className="mt-2 max-w-xs text-small text-ink-muted">
        Only you and {name} can ever read this thread.
      </p>
    </div>
  );
}

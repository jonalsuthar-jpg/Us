'use client';

import {
  daysTogether,
  formatEventTime,
  freshStatus,
  getHome,
  sendTap,
  setCouplePhoto,
  setMyStatus,
  STATUS_MAX,
  STATUS_PRESETS,
  TAP_TOPIC,
  timeAgo,
  type PartnerSlot,
  type Status,
} from '@us/shared';
import { useCallManager, useCouple, useCoupleData, useTyping } from '@us/shared/react';
import { CalendarHeart, Camera, ChevronRight, HeartHandshake, HeartPulse, MessageCircleHeart, Pencil, Phone, Sparkles, Video } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { MobileSettingsLink } from '@/components/app/app-shell';
import { ErrorNote } from '@/components/app/module-header';
import { PlantCard } from '@/components/plant/plant-card';
import { SnapRow } from '@/components/snaps/snap-row';
import { Avatar } from '@/components/ui/avatar';
import { Button, Spinner } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Lightbox } from '@/components/ui/lightbox';
import { Chip } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { shrinkPhoto } from '@/lib/image';
import { ComingUp } from './countdowns';
import { SafetyCard } from './safety';

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** The page the app opens on: the two of you, how you both are, and what's next. */
export function Home() {
  const { sb, couple, me, partner, mySlot, partnerSlot, partnerOnline, unread, channel } = useCouple();
  const { partnerTyping } = useTyping();
  const calls = useCallManager();
  const home = useCoupleData('home', () => getHome(sb, { coupleId: couple.id, meId: me.id }), [sb, couple.id, me.id]);
  const [editingStatus, setEditingStatus] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [hello, setHello] = useState('Hello');

  // Home summarises every area, so any change my partner makes anywhere refreshes it.
  const { reload } = home;
  useEffect(() => channel.changes.on((e) => e.from !== me.id && void reload()), [channel, me.id, reload]);
  useEffect(() => setHello(greeting()), []);

  // "Thinking of you": send one, and show a heart when theirs arrives while Home is open.
  const [tapState, setTapState] = useState<'idle' | 'sent' | 'wait'>('idle');
  const [heart, setHeart] = useState(false);
  useEffect(
    () =>
      channel.changes.on((e) => {
        if (e.topic !== TAP_TOPIC || e.from === me.id) return;
        setHeart(true);
        setTimeout(() => setHeart(false), 2600);
      }),
    [channel, me.id],
  );
  async function tap() {
    try {
      await sendTap(sb, couple.id, me.id);
      channel.sendChanged(TAP_TOPIC);
      setTapState('sent');
    } catch (e) {
      setTapState(String((e as Error).message).includes('too_soon') ? 'wait' : 'idle');
    }
    setTimeout(() => setTapState('idle'), 2500);
  }

  const d = home.data;
  const myStatus = d ? freshStatus(d.me) : null;
  const theirStatus = d ? freshStatus(d.partner) : null;
  const myName = d?.me.display_name ?? me.display_name;
  const theirName = d?.partner.display_name ?? partner.display_name;
  const days = daysTogether(couple.paired_at);

  async function changePhoto(file: File) {
    if (!d) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const { blob, type } = await shrinkPhoto(file);
      await home.mutate(() => setCouplePhoto(sb, d.couple, blob, type));
    } catch (e) {
      setPhotoError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 sm:px-10 sm:py-12">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-small text-ink-muted" suppressHydrationWarning>
            {hello},
          </p>
          <h1 className="font-display text-title text-ink sm:text-[40px] sm:leading-[1.1]">{myName}</h1>
        </div>
        <MobileSettingsLink />
      </header>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void changePhoto(f);
        }}
      />

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        {/* The two of you */}
        <section aria-label="The two of you" className="relative overflow-hidden rounded-[28px] bg-plum-800 shadow-[0_24px_48px_-28px_rgba(36,25,51,0.6)]">
          {d?.photoUrl ? (
            <button
              type="button"
              onClick={() => setViewing(d.photoUrl)}
              aria-label="Photo of you two. Open full screen"
              className="block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400"
            >
              <img src={d.photoUrl} alt="" className="aspect-[4/3] w-full object-cover" />
            </button>
          ) : (
            <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden">
              <span aria-hidden className="absolute h-64 w-64 -translate-x-14 rounded-full bg-rose-400/90 blur-[2px]" />
              <span aria-hidden className="absolute h-64 w-64 translate-x-14 rounded-full bg-teal-500/80 mix-blend-screen blur-[2px]" />
              <Button variant="night" size="sm" className="relative" loading={photoBusy} onClick={() => fileInput.current?.click()}>
                {!photoBusy && <Camera className="h-4 w-4" />} Add a photo of you two
              </Button>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-plum-950/90 via-plum-900/60 to-transparent px-6 pb-5 pt-16">
            <div className="min-w-0">
              <p className="truncate font-display text-heading text-paper sm:text-title">
                {myName} &amp; {theirName}
              </p>
              <p className="text-small text-plum-200">
                Together <span className="font-semibold text-gold-300">{days}</span> {days === 1 ? 'day' : 'days'}
              </p>
            </div>
            {d?.photoUrl ? (
              <IconButton label="Change photo of you two" tone="night" size="sm" onClick={() => fileInput.current?.click()}>
                {photoBusy ? <Spinner /> : <Camera className="h-4 w-4" />}
              </IconButton>
            ) : null}
          </div>
        </section>

        <div className="space-y-6">
          {photoError ? <ErrorNote>{photoError}</ErrorNote> : null}

          <SnapRow />

          {/* How you both are */}
          <div className="grid grid-cols-2 gap-3">
            <StatusCard
              who={theirName}
              slot={partnerSlot}
              status={theirStatus}
              presence={partnerTyping ? 'typing…' : partnerOnline ? 'here now' : 'away'}
              online={partnerOnline}
              empty="No status yet"
            />
            <StatusCard who="You" slot={mySlot} status={myStatus} empty="How are you?" onEdit={() => setEditingStatus(true)} />
          </div>

          {/* Reach each other */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            <Action label="Message" href="/talk" badge={unread}>
              <MessageCircleHeart className="h-5 w-5" />
            </Action>
            <Action label="Voice call" onClick={() => void calls.startCall('audio')}>
              <Phone className="h-5 w-5" />
            </Action>
            <Action label="Video call" onClick={() => void calls.startCall('video')}>
              <Video className="h-5 w-5" />
            </Action>
            <Action label={tapState === 'sent' ? 'Sent 💗' : tapState === 'wait' ? 'One moment' : 'Thinking of you'} onClick={() => void tap()}>
              <HeartPulse className={cn('h-5 w-5', tapState === 'sent' && 'animate-ping')} />
            </Action>
          </div>

          {d?.taps ? (
            <Sheet tone="note" accent="rose" pad="sm" className="flex items-center gap-3">
              <span className="text-[26px]" aria-hidden>
                💗
              </span>
              <p className="text-small text-ink">
                <span className="font-medium">{theirName}</span> is thinking of you
                <span className="text-ink-muted" suppressHydrationWarning>
                  {' '}
                  · {d.taps.count > 1 ? `${d.taps.count} times today, last ` : ''}
                  {timeAgo(d.taps.latest)}
                </span>
              </p>
            </Sheet>
          ) : null}

          {d?.nudged ? (
            <Sheet tone="note" accent="rose" pad="sm">
              <p className="font-serif text-lead italic text-ink">{theirName} could use a little extra care today.</p>
              <p className="mt-1 text-small text-ink-soft">A message, a call, or something small that says you noticed.</p>
            </Sheet>
          ) : null}
        </div>
      </div>

      {home.error && !d ? <ErrorNote>{home.error}</ErrorNote> : null}
      {!d && home.loading ? (
        <div className="flex justify-center py-6">
          <Spinner className="h-5 w-5 text-rose-400" />
        </div>
      ) : null}

      {d ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <ComingUp countdowns={d.countdowns} mutate={home.mutate} />
          <SafetyCard />
        </div>
      ) : null}

      {d ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card
            href="/plan"
            icon={<CalendarHeart className="h-5 w-5 text-plum-700" />}
            eyebrow="Next up"
            title={d.nextEvent ? d.nextEvent.title : 'Nothing planned yet'}
            detail={
              d.nextEvent
                ? `${new Date(d.nextEvent.starts_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${formatEventTime(d.nextEvent)}`
                : 'Plan a date, a trip, or a quiet night in.'
            }
          />
          <Link
            href="/memory"
            className="group block rounded-sheet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            <Sheet pad="none" className="h-full overflow-hidden transition-transform duration-base group-hover:-translate-y-0.5">
              {d.memoryPhotoUrl ? <img src={d.memoryPhotoUrl} alt="" className="aspect-[16/9] w-full object-cover" /> : null}
              <div className="space-y-1 p-5">
                <p className="flex items-center gap-1.5 text-micro font-medium text-gold-700">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  {d.memory?.yearsAgo ? `On this day · ${d.memory.yearsAgo} ${d.memory.yearsAgo === 1 ? 'year' : 'years'} ago` : 'A memory'}
                </p>
                <p className="line-clamp-2 font-display text-heading text-ink">{d.memory ? d.memory.title : 'Keep your first memory'}</p>
                {!d.memory ? <p className="text-small text-ink-soft">A photo, a line, the date — the start of your story.</p> : null}
              </div>
            </Sheet>
          </Link>
          <Card
            href="/connect"
            icon={<HeartHandshake className="h-5 w-5 text-teal-700" />}
            eyebrow="Connect"
            title="Today’s question"
            detail="One question a day. Your answers open once you’ve both replied."
          />
        </div>
      ) : null}

      {d ? <PlantCard /> : null}

      <Dialog open={editingStatus} onOpenChange={setEditingStatus} title="Your status" description={`${theirName} sees this on their Home. It fades after a day.`}>
        {editingStatus ? (
          <StatusForm
            initial={myStatus}
            onSave={async (s) => {
              await home.mutate(() => setMyStatus(sb, me.id, s));
              setEditingStatus(false);
            }}
          />
        ) : null}
      </Dialog>
      <Lightbox src={viewing} label="Photo of you two" onClose={() => setViewing(null)} />
      {heart ? (
        <div role="status" className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <span className="animate-[us-heart_2.6s_ease-out_forwards] text-[120px] drop-shadow-xl motion-reduce:animate-none" aria-hidden>
            💗
          </span>
          <span className="sr-only">{theirName} is thinking of you</span>
        </div>
      ) : null}
    </div>
  );
}

function StatusCard({
  who,
  slot,
  status,
  presence,
  online,
  empty,
  onEdit,
}: {
  who: string;
  slot: PartnerSlot;
  status: Status | null;
  presence?: string;
  online?: boolean;
  empty: string;
  onEdit?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2">
        <Avatar name={who} slot={slot} size="sm" online={online} />
        <span className="min-w-0 flex-1 truncate text-small font-semibold text-ink">{who}</span>
        {onEdit ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-700" aria-hidden>
            <Pencil className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </span>
      {status ? (
        <>
          {/* Emoji inline with the words keeps the card short. */}
          <span className="mt-2 block line-clamp-2 font-medium text-ink">
            {status.emoji ? `${status.emoji} ` : ''}
            {status.text ?? ''}
          </span>
          <span className="mt-1 block text-micro text-ink-muted" suppressHydrationWarning>
            {timeAgo(status.at)}
            {presence ? ` · ${presence}` : ''}
          </span>
        </>
      ) : (
        <>
          <span className={cn('mt-2 block', onEdit ? 'font-medium text-rose-700' : 'text-ink-soft')}>{onEdit ? 'Set your status' : empty}</span>
          {presence ? <span className="mt-1 block text-micro text-ink-muted">{presence}</span> : null}
        </>
      )}
    </>
  );
  const surface = cn(
    'block h-full w-full rounded-sheet border bg-paper-raised p-4 text-left shadow-[0_12px_32px_-22px_rgba(36,25,51,0.4)]',
    slot === 'a' ? 'border-rose-200' : 'border-teal-200',
  );
  return onEdit ? (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Your status: ${status?.text ?? 'not set'}. Change`}
      className={cn(surface, 'transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400')}
    >
      {body}
    </button>
  ) : (
    <div className={surface}>{body}</div>
  );
}

function StatusForm({ initial, onSave }: { initial: Status | null; onSave: (s: { emoji: string | null; text: string | null } | null) => Promise<void> }) {
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (s: Parameters<typeof onSave>[0]) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(s);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <form
      className="space-y-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void run({ emoji, text });
      }}
    >
      <div className="flex flex-wrap gap-2">
        {STATUS_PRESETS.map((p) => (
          <Chip
            key={p.text}
            selected={emoji === p.emoji && text === p.text}
            onClick={() => {
              setEmoji(p.emoji);
              setText(p.text);
            }}
          >
            <span aria-hidden>{p.emoji}</span> {p.text}
          </Chip>
        ))}
      </div>
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Field label="Emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} className="text-center text-lead" />
        <Field label="Or in your words" value={text} onChange={(e) => setText(e.target.value)} maxLength={STATUS_MAX} placeholder="e.g. thinking of you" />
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <div className="flex items-center justify-between gap-3">
        {initial ? (
          <Button type="button" variant="quiet" disabled={busy} onClick={() => void run(null)}>
            Clear my status
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" loading={busy} disabled={!emoji.trim() && !text.trim()}>
          Share status
        </Button>
      </div>
    </form>
  );
}

function Action({ label, href, onClick, badge, children }: { label: string; href?: string; onClick?: () => void; badge?: number; children: ReactNode }) {
  const cls =
    'relative flex flex-col items-center gap-1.5 rounded-sheet border border-paper-edge bg-paper-raised px-1 py-3 text-center text-micro font-medium leading-tight text-ink sm:text-small shadow-[0_6px_16px_-8px_rgba(36,25,51,0.35)] transition-[transform,background-color,box-shadow] hover:-translate-y-0.5 hover:bg-paper-sunken hover:shadow-[0_10px_22px_-10px_rgba(36,25,51,0.45)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400';
  const inner = (
    <>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-600 text-white" aria-hidden>
        {children}
      </span>
      {label}
      {badge ? (
        <span className="absolute right-3 top-2 min-w-[22px] rounded-full border-2 border-paper-raised bg-rose-600 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white">
          {badge > 99 ? '99+' : badge}
          <span className="sr-only"> unread</span>
        </span>
      ) : null}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function Card({ href, icon, eyebrow, title, detail }: { href: string; icon: ReactNode; eyebrow: string; title: string; detail: string }) {
  return (
    <Link href={href} className="group block rounded-sheet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
      <Sheet pad="sm" className="flex h-full items-start gap-4 transition-transform duration-base group-hover:-translate-y-0.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-plum-50" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-micro font-medium text-ink-muted">{eyebrow}</span>
          <span className="block truncate font-display text-lead text-ink">{title}</span>
          <span className="mt-0.5 block line-clamp-2 text-small text-ink-soft">{detail}</span>
        </span>
        <ChevronRight className="mt-3 h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
      </Sheet>
    </Link>
  );
}

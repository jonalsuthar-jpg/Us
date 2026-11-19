'use client';

import {
  chatStats,
  CHAT_THEME_ORDER,
  CHAT_THEME_TOPIC,
  CHAT_THEMES,
  daysTogether,
  firstLink,
  formatCallTime,
  formatDay,
  getChatTheme,
  getNickname,
  getNotificationPrefs,
  linkPreviewOf,
  listChatMedia,
  listPinned,
  listSaved,
  listVoiceNotes,
  messagePreview,
  saveNotificationPrefs,
  SAVED_TOPIC,
  scanLinks,
  setChatTheme,
  setNickname,
  videoPoster,
  cancelCapsule,
  CAPSULE_TOPIC,
  capsulesWaiting,
  capsuleText,
  formatCapsuleMoment,
  listMyCapsules,
  notifyPartner,
  openCapsuleNow,
  type Capsule,
  type Message,
} from '@us/shared';
import { useCallManager, useChatKey, useChatMedia, useCouple, useCoupleData, useCoupleLive, useFeature } from '@us/shared/react';
import { Bell, BellOff, Check, ChevronLeft, ChevronRight, Link2, Phone, Play, Search, ShieldCheck, Star, Video } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { FeatureOff } from '@/components/app/feature-off';
import { ErrorNote } from '@/components/app/module-header';
import { LinkCard, VoicePlayer } from '@/components/chat/bubble';
import { CapsuleDialog } from '@/components/chat/capsule-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Lightbox } from '@/components/ui/lightbox';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/cn';

type Tab = 'media' | 'links' | 'voice';

/** Everything about our chat in one place: who, our numbers, media, links, voice notes, saved and pinned, and its look. */
export default function ChatInfoPage() {
  const chat = useFeature('chat');
  return chat ? <ChatInfo /> : <FeatureOff />;
}

function ChatInfo() {
  const router = useRouter();
  const { sb, couple, me, partner, partnerSlot, photoOf } = useCouple();
  const { partnerOnline } = useCoupleLive();
  const { cipher } = useChatKey();
  const calls = useCallManager();
  const [tab, setTab] = useState<Tab>('media');
  const [photo, setPhoto] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nickname = useCoupleData('chat:nickname', () => getNickname(sb, me.id), [sb, me.id]);
  const theme = useCoupleData(CHAT_THEME_TOPIC, () => getChatTheme(sb, couple.id), [sb, couple.id]);
  const numbers = useCoupleData('chat:info', () => chatStats(sb, { coupleId: couple.id, me: me.id, partner: partner.id }, cipher), [sb, couple.id, me.id, partner.id, !!cipher], undefined, 'memory');
  const mediaList = useCoupleData('chat:info', () => listChatMedia(sb, couple.id, me.id, cipher), [sb, couple.id, me.id, !!cipher, 'media'], undefined, 'memory');
  const voice = useCoupleData('chat:info', () => listVoiceNotes(sb, couple.id, me.id, cipher), [sb, couple.id, me.id, !!cipher, 'voice'], undefined, 'memory');
  const pinned = useCoupleData('chat:pins', () => listPinned(sb, couple.id, cipher), [sb, couple.id, !!cipher, 'info'], undefined, 'memory');
  const saved = useCoupleData(SAVED_TOPIC, () => listSaved(sb, me.id, cipher), [sb, me.id, !!cipher, 'list'], undefined, 'memory');
  const prefs = useCoupleData('notify:prefs', () => getNotificationPrefs(sb, me.id), [sb, me.id]);
  const muted = !!prefs.data?.off.includes('messages');
  const myCapsules = useCoupleData(CAPSULE_TOPIC, () => listMyCapsules(sb, me.id), [sb, me.id, 'mine']);
  const waiting = useCoupleData(CAPSULE_TOPIC, () => capsulesWaiting(sb), [sb, 'waiting']);
  const [capsule, setCapsule] = useState<{ capsule: Capsule; text: string } | null | 'new'>(null);

  const media = mediaList.data ?? [];
  const urls = useChatMedia([...media, ...(voice.data ?? [])]);
  const name = nickname.data || partner.display_name;
  const partnerPhoto = photoOf(partnerSlot);
  const fail = (e: unknown) => setError((e as Error).message);
  const openInChat = (m: Message) => router.push(`/talk?jump=${m.id}`);

  useEffect(() => {
    document.title = `${name} · Us`;
  }, [name]);

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-5 py-6 sm:px-8">
      <Link href="/talk" className="inline-flex items-center gap-1 rounded-full text-small text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
        <ChevronLeft className="h-4 w-4" /> Back to chat
      </Link>

      {/* Who */}
      <header className="flex flex-col items-center gap-2 text-center">
        <button type="button" disabled={!partnerPhoto} onClick={() => partnerPhoto && setPhoto(partnerPhoto)} aria-label={`${partner.display_name}'s photo`} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
          <Avatar name={partner.display_name} slot={partnerSlot} src={partnerPhoto ?? undefined} size="xl" online={partnerOnline} />
        </button>
        <h1 className="font-display text-title text-ink">{name}</h1>
        {nickname.data ? <p className="text-small text-ink-muted">{partner.display_name}</p> : null}
        <p className="text-small text-ink-soft">
          {partnerOnline ? 'Online' : 'Away'} · together {daysTogether(couple.paired_at).toLocaleString()} days
        </p>
      </header>

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2">
        <Quick label="Voice" onClick={() => void calls.startCall('audio')} icon={<Phone className="h-5 w-5" />} />
        <Quick label="Video" onClick={() => void calls.startCall('video')} icon={<Video className="h-5 w-5" />} />
        <Quick label="Search" onClick={() => router.push('/talk?search=1')} icon={<Search className="h-5 w-5" />} />
        <Quick
          label={muted ? 'Unmute' : 'Mute'}
          onClick={() => {
            const p = prefs.data;
            if (!p) return;
            const off = muted ? p.off.filter((k) => k !== 'messages') : [...p.off, 'messages'];
            void prefs.mutate(() => saveNotificationPrefs(sb, me.id, { ...p, off })).catch(fail);
          }}
          icon={muted ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        />
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {/* Our chat in numbers */}
      <Section title="Our chat in numbers">
        {numbers.data ? (
          <>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat value={numbers.data.mine.toLocaleString()} label="messages from you" />
              <Stat value={numbers.data.theirs.toLocaleString()} label={`from ${name}`} />
              <Stat value={numbers.data.calls.toLocaleString()} label={numbers.data.calls === 1 ? 'call' : 'calls'} />
              <Stat value={formatCallTime(numbers.data.callMs)} label="talking" />
              <Stat value={(numbers.data.photos + numbers.data.videos).toLocaleString()} label="photos and videos" />
              <Stat value={numbers.data.voiceNotes.toLocaleString()} label="voice notes" />
            </dl>
            <p className="mt-2 text-small text-ink-soft">
              {[
                numbers.data.longestCallMs ? `Longest call: ${formatCallTime(numbers.data.longestCallMs)}.` : null,
                numbers.data.topReaction ? `Your favourite reaction: ${numbers.data.topReaction.emoji}.` : null,
                numbers.data.firstMessageAt ? `First message: ${formatDay(numbers.data.firstMessageAt)}.` : null,
              ]
                .filter(Boolean)
                .join(' ')}
            </p>
          </>
        ) : (
          <div className="h-28 animate-pulse rounded-sheet bg-paper-sunken" />
        )}
      </Section>

      {/* Media, links, voice */}
      <Section title="Shared">
        <Segmented
          label="Show"
          options={[
            { value: 'media', label: 'Media' },
            { value: 'links', label: 'Links' },
            { value: 'voice', label: 'Voice' },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="mt-3">
          {tab === 'media' ? <MediaGrid items={media} urls={urls} loading={mediaList.loading} onPhoto={setPhoto} onVideo={setVideo} /> : null}
          {tab === 'links' ? <Links onOpenInChat={openInChat} /> : null}
          {tab === 'voice' ? (
            (voice.data ?? []).length ? (
              <ul className="space-y-2">
                {voice.data!.map((m) => (
                  <li key={m.id} className="rounded-sheet bg-paper-raised px-3 py-2">
                    <p className="text-micro text-ink-muted">
                      {m.sender_id === me.id ? 'You' : name} · {formatDay(m.created_at)}
                    </p>
                    {m.media_path && urls[m.media_path] ? <VoicePlayer url={urls[m.media_path]!} durationMs={m.media_meta?.duration_ms} waveform={m.media_meta?.waveform} /> : <span className="block h-9 animate-pulse rounded-full bg-black/10" />}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{voice.loading ? 'Looking…' : 'No voice notes yet.'}</Empty>
            )
          ) : null}
        </div>
      </Section>

      <Section title="Time capsules">
        {waiting.data?.waiting ? (
          <p className="rounded-sheet bg-gold-50 px-4 py-3 text-gold-800">
            <span className="block font-semibold">
              💌 {name} has sealed {waiting.data.waiting === 1 ? 'a capsule' : `${waiting.data.waiting} capsules`} for you.
            </span>
            {waiting.data.nextAt ? <span className="block text-small">The next one opens {formatCapsuleMoment(waiting.data.nextAt)}.</span> : null}
          </p>
        ) : null}
        <ul className="space-y-2">
          {(myCapsules.data ?? []).map((cap) => {
            const text = capsuleText(cap, cipher);
            return (
              <li key={cap.id} className="space-y-2 rounded-sheet bg-paper-raised px-4 py-3">
                <p className="text-micro text-ink-muted">Opens {formatCapsuleMoment(cap.deliver_at)}</p>
                <p className="line-clamp-2 text-ink">{text ?? 'Sealed'}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={text === null} onClick={() => text !== null && setCapsule({ capsule: cap, text })}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void myCapsules
                        .mutate(async () => {
                          const m = await openCapsuleNow(sb, cap.id);
                          void notifyPartner(sb, { category: 'new_message', messageId: m.id });
                        })
                        .catch(fail)
                    }
                  >
                    Open now
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => window.confirm('Cancel this capsule? It won’t be sent.') && void myCapsules.mutate(() => cancelCapsule(sb, cap.id)).catch(fail)}>
                    Cancel
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        <Button variant="secondary" onClick={() => setCapsule('new')}>
          Seal a new one 💌
        </Button>
      </Section>

      <Section title="Saved by you" icon={<Star className="h-4 w-4" />}>
        <MessageRows items={saved.data ?? []} empty={saved.loading ? 'Looking…' : 'Open a message’s actions and tap Save to keep it here. Only you see this list.'} meId={me.id} name={name} onPick={openInChat} />
      </Section>
      <Section title="Pinned">
        <MessageRows items={pinned.data ?? []} empty={pinned.loading ? 'Looking…' : 'Nothing pinned.'} meId={me.id} name={name} onPick={openInChat} />
      </Section>

      <Section title="Chat theme">
        <p className="mb-2 text-small text-ink-soft">Both of you see it. Your bubbles keep your colours.</p>
        <div role="radiogroup" aria-label="Chat theme" className="flex flex-wrap gap-4">
          {CHAT_THEME_ORDER.map((t) => {
            const on = (theme.data ?? 'paper') === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => void theme.mutate(() => setChatTheme(sb, { coupleId: couple.id, me: me.id }, t)).catch(fail)}
                className="flex flex-col items-center gap-1 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              >
                <span className={cn('flex h-12 w-12 items-center justify-center rounded-full border-2', on ? 'border-rose-500' : 'border-paper-edge')} style={{ backgroundColor: CHAT_THEMES[t].swatch }}>
                  {on ? <Check className={cn('h-5 w-5', t === 'night' ? 'text-white' : 'text-ink')} /> : null}
                </span>
                <span className="text-micro text-ink-soft">{CHAT_THEMES[t].label}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="More">
        <div className="divide-y divide-paper-edge overflow-hidden rounded-sheet border border-paper-edge bg-paper-raised">
          <Row label="Nickname" detail={nickname.data ? `“${nickname.data}”, only you see it` : `What you call ${partner.display_name}, only you see it`} onClick={() => setNaming(true)} />
          <Row label="Notifications" detail={muted ? 'Messages are muted' : 'Sounds, quiet hours, previews'} href="/settings" icon={<Bell className="h-4 w-4" />} />
          <Row label="Chat security" detail="Your devices and safety codes" href="/settings" icon={<ShieldCheck className="h-4 w-4" />} />
        </div>
      </Section>

      <CapsuleDialog
        open={capsule !== null}
        editing={capsule && capsule !== 'new' ? capsule : null}
        onOpenChange={(o) => !o && setCapsule(null)}
        onDone={() => {
          setCapsule(null);
          void myCapsules.reload();
        }}
      />
      <Lightbox src={photo} label="Photo" onClose={() => setPhoto(null)} />
      <Dialog open={!!video} onOpenChange={(o) => !o && setVideo(null)} title="Video">
        {video ? <video src={video} controls autoPlay playsInline className="max-h-[70dvh] w-full rounded-control bg-black" /> : null}
      </Dialog>
      <Dialog open={naming} onOpenChange={setNaming} title="Nickname" description={`Shown instead of “${partner.display_name}” in your chat. Only you see it.`}>
        <NicknameForm
          initial={nickname.data ?? ''}
          partnerName={partner.display_name}
          onSave={async (n) => {
            await nickname.mutate(() => setNickname(sb, me.id, n));
            setNaming(false);
          }}
        />
      </Dialog>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 text-micro font-semibold uppercase tracking-wide text-ink-muted">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Quick({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1 rounded-sheet bg-paper-raised py-3 text-micro font-medium text-ink hover:bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
      {icon}
      {label}
    </button>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-sheet bg-paper-raised p-3">
      <dd className="font-display text-heading text-ink">{value}</dd>
      <dt className="text-micro text-ink-soft">{label}</dt>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-small text-ink-muted">{children}</p>;
}

function Row({ label, detail, icon, href, onClick }: { label: string; detail?: string; icon?: ReactNode; href?: string; onClick?: () => void }) {
  const body = (
    <>
      {icon ? <span className="text-ink-soft">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-body text-ink">{label}</span>
        {detail ? <span className="block text-small text-ink-muted">{detail}</span> : null}
      </span>
      <ChevronRight className="h-4 w-4 text-ink-muted" />
    </>
  );
  const cls = 'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400';
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

function MediaGrid({ items, urls, loading, onPhoto, onVideo }: { items: Message[]; urls: Record<string, string>; loading: boolean; onPhoto: (u: string) => void; onVideo: (u: string) => void }) {
  if (!items.length) return <Empty>{loading ? 'Looking…' : 'Photos and videos you send each other show up here.'}</Empty>;
  return (
    <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4">
      {items.map((m) => {
        const url = m.media_path ? urls[m.media_path] : undefined;
        const isVideo = m.media_kind === 'video';
        const poster = videoPoster(m.media_meta);
        return (
          <li key={m.id}>
            <button
              type="button"
              disabled={!url}
              onClick={() => url && (isVideo ? onVideo(url) : onPhoto(url))}
              aria-label={isVideo ? 'Play video' : 'Open photo'}
              className="relative block aspect-square w-full overflow-hidden rounded-[6px] bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {isVideo ? (poster ? <img src={poster} alt="" className="h-full w-full object-cover" /> : <span className="block h-full w-full bg-plum-900" />) : url ? <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
              {isVideo ? (
                <span className="absolute bottom-1 left-1 rounded-full bg-black/50 p-1">
                  <Play className="h-3 w-3 fill-white text-white" />
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Links in our messages, found in this browser as the thread is read. */
function Links({ onOpenInChat }: { onOpenInChat: (m: Message) => void }) {
  const { sb, couple, me } = useCouple();
  const { cipher } = useChatKey();
  const [found, setFound] = useState<Message[]>([]);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const stop = new AbortController();
    setDone(false);
    void scanLinks(sb, couple.id, me.id, cipher, {
      signal: stop.signal,
      onProgress: (f, d) => {
        setFound(f);
        setDone(d);
      },
    }).catch(() => setDone(true));
    return () => stop.abort();
  }, [sb, couple.id, me.id, cipher]);
  if (!found.length) return <Empty>{done ? 'No links yet.' : 'Looking through your messages…'}</Empty>;
  return (
    <ul className="space-y-2">
      {found.map((m) => {
        const card = linkPreviewOf(m.media_meta);
        const url = card?.url ?? firstLink(m.body);
        return (
          <li key={m.id} className="rounded-sheet bg-paper-raised p-3">
            {card ? (
              <LinkCard preview={card} />
            ) : (
              <a href={url ?? '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-small text-teal-800 underline dark:text-teal-200">
                <Link2 className="h-4 w-4 shrink-0" /> <span className="truncate">{url}</span>
              </a>
            )}
            <button type="button" onClick={() => onOpenInChat(m)} className="mt-1 text-micro text-ink-muted hover:text-ink">
              {formatDay(m.created_at)} · Show in chat
            </button>
          </li>
        );
      })}
      {!done ? <Empty>Still looking…</Empty> : null}
    </ul>
  );
}

function MessageRows({ items, empty, meId, name, onPick }: { items: Message[]; empty: string; meId: string; name: string; onPick: (m: Message) => void }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="space-y-1.5">
      {items.slice(0, 30).map((m) => (
        <li key={m.id}>
          <button type="button" onClick={() => onPick(m)} className="block w-full rounded-sheet bg-paper-raised px-4 py-3 text-left hover:bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
            <span className="block text-micro text-ink-muted">
              {m.sender_id === meId ? 'You' : name} · {formatDay(m.created_at)}
            </span>
            <span className="line-clamp-2 text-ink">{messagePreview(m)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function NicknameForm({ initial, partnerName, onSave }: { initial: string; partnerName: string; onSave: (n: string | null) => Promise<void> }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (n: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(n);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(value.trim() || null);
      }}
      className="space-y-4"
    >
      <Field label="Nickname" value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} placeholder="Like Sunshine" autoFocus />
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <div className="flex justify-between gap-3">
        {initial ? (
          <Button type="button" variant="quiet" disabled={busy} onClick={() => void save(null)}>
            Use “{partnerName}” again
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" loading={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}

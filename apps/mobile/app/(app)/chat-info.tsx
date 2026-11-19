import {
  chatStats,
  CHAT_THEME_ORDER,
  CHAT_THEME_TOPIC,
  CHAT_THEMES,
  daysTogether,
  formatCallTime,
  formatDay,
  getChatTheme,
  getNickname,
  getNotificationPrefs,
  listChatMedia,
  listPinned,
  listSaved,
  listVoiceNotes,
  linkPreviewOf,
  firstLink,
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
  type ChatTheme,
  type Message,
} from '@us/shared';
import { useCallManager, useChatKey, useChatMedia, useCouple, useCoupleData, useCoupleLive } from '@us/shared/react';
import { router } from 'expo-router';
import { Bell, BellOff, Check, ChevronLeft, ChevronRight, Link2, Phone, Play, Search, ShieldCheck, Star, Video } from 'lucide-react-native';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinkCard, VoiceNote } from '@/components/chat/bubble';
import { VideoViewer } from '@/components/chat/video-viewer';
import { CapsuleSheet } from '@/components/chat/capsule-sheet';
import { ErrorNote } from '@/components/module-screen';
import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Field } from '@/components/ui/field';
import { FormSheet } from '@/components/ui/form-sheet';
import { usePalette } from '@/components/ui/palette';
import { Photo } from '@/components/ui/photo';
import { PhotoViewer } from '@/components/ui/photo-viewer';
import { Segmented } from '@/components/ui/segmented';
import { Display, Text } from '@/components/ui/text';

type Tab = 'media' | 'links' | 'voice';

/** Everything about our chat in one place: who, our numbers, media, links, voice notes, saved and pinned, and its look. */
export default function ChatInfo() {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const { sb, couple, me, partner, partnerSlot, channel, photoOf } = useCouple();
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
  const myCapsules = useCoupleData(CAPSULE_TOPIC, () => listMyCapsules(sb, me.id), [sb, me.id, 'mine']);
  const waiting = useCoupleData(CAPSULE_TOPIC, () => capsulesWaiting(sb), [sb, 'waiting']);
  const [capsule, setCapsule] = useState<{ capsule: Capsule; text: string } | null | 'new'>(null);
  const muted = !!prefs.data?.off.includes('messages');

  const media = mediaList.data ?? [];
  const urls = useChatMedia([...media, ...(voice.data ?? [])]);
  const name = nickname.data || partner.display_name;
  const partnerPhoto = photoOf(partnerSlot);
  const fail = (e: unknown) => setError((e as Error).message);
  const openInChat = (m: Message) => router.push({ pathname: '/talk', params: { jump: m.id } });

  return (
    <View className="flex-1 bg-paper">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }} contentContainerClassName="gap-6 px-5">
        <View className="flex-row items-center">
          <IconButton label="Back" size="sm" onPress={() => router.back()}>
            <ChevronLeft size={22} color={c.ink} />
          </IconButton>
        </View>

        {/* Who */}
        <View className="items-center gap-2">
          <Pressable accessibilityRole="imagebutton" accessibilityLabel={`${partner.display_name}'s photo`} disabled={!partnerPhoto} onPress={() => partnerPhoto && setPhoto(partnerPhoto)}>
            <Avatar name={partner.display_name} slot={partnerSlot} size="xl" online={partnerOnline} />
          </Pressable>
          <Display className="text-title">{name}</Display>
          {nickname.data ? <Text className="text-small text-ink-muted">{partner.display_name}</Text> : null}
          <Text className="text-small text-ink-soft">{`${partnerOnline ? 'Online' : 'Away'} · together ${daysTogether(couple.paired_at).toLocaleString()} days`}</Text>
        </View>

        {/* Quick actions */}
        <View className="flex-row justify-between gap-2">
          <Quick label="Voice" onPress={() => void calls.startCall('audio')} icon={<Phone size={20} color={c.ink} />} />
          <Quick label="Video" onPress={() => void calls.startCall('video')} icon={<Video size={20} color={c.ink} />} />
          <Quick label="Search" onPress={() => router.push({ pathname: '/talk', params: { search: '1' } })} icon={<Search size={20} color={c.ink} />} />
          <Quick
            label={muted ? 'Unmute' : 'Mute'}
            onPress={() => {
              const p = prefs.data;
              if (!p) return;
              const off = muted ? p.off.filter((k) => k !== 'messages') : [...p.off, 'messages'];
              void prefs.mutate(() => saveNotificationPrefs(sb, me.id, { ...p, off })).catch(fail);
            }}
            icon={muted ? <BellOff size={20} color={c.ink} /> : <Bell size={20} color={c.ink} />}
          />
        </View>
        {error ? <ErrorNote>{error}</ErrorNote> : null}

        {/* Our chat in numbers */}
        <Section title="Our chat in numbers">
          {numbers.data ? (
            <View className="flex-row flex-wrap justify-between gap-y-2">
              <Stat value={numbers.data.mine.toLocaleString()} label="messages from you" />
              <Stat value={numbers.data.theirs.toLocaleString()} label={`from ${name}`} />
              <Stat value={numbers.data.calls.toLocaleString()} label={numbers.data.calls === 1 ? 'call' : 'calls'} />
              <Stat value={formatCallTime(numbers.data.callMs)} label="talking" />
              <Stat value={(numbers.data.photos + numbers.data.videos).toLocaleString()} label="photos and videos" />
              <Stat value={numbers.data.voiceNotes.toLocaleString()} label="voice notes" />
            </View>
          ) : (
            <View className="h-24 rounded-[18px] bg-paper-sunken" />
          )}
          {numbers.data ? (
            <Text className="mt-2 text-small text-ink-soft">
              {[
                numbers.data.longestCallMs ? `Longest call: ${formatCallTime(numbers.data.longestCallMs)}.` : null,
                numbers.data.topReaction ? `Your favourite reaction: ${numbers.data.topReaction.emoji}.` : null,
                numbers.data.firstMessageAt ? `First message: ${formatDay(numbers.data.firstMessageAt)}.` : null,
              ]
                .filter(Boolean)
                .join(' ')}
            </Text>
          ) : null}
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
          <View className="mt-3">
            {tab === 'media' ? <MediaGrid items={media} urls={urls} onPhoto={setPhoto} onVideo={setVideo} loading={mediaList.loading} /> : null}
            {tab === 'links' ? <Links onOpenInChat={openInChat} /> : null}
            {tab === 'voice' ? (
              <View className="gap-2">
                {(voice.data ?? []).length ? (
                  voice.data!.map((m) => (
                    <View key={m.id} className="rounded-[16px] bg-paper-raised px-3 py-2">
                      <Text className="text-micro text-ink-muted">{`${m.sender_id === me.id ? 'You' : name} · ${formatDay(m.created_at)}`}</Text>
                      <VoiceNote url={m.media_path ? urls[m.media_path] : undefined} durationMs={m.media_meta?.duration_ms} waveform={m.media_meta?.waveform} mine={false} />
                    </View>
                  ))
                ) : (
                  <Empty>{voice.loading ? 'Looking…' : 'No voice notes yet.'}</Empty>
                )}
              </View>
            ) : null}
          </View>
        </Section>

        {/* Time capsules */}
        <Section title="Time capsules">
          {waiting.data?.waiting ? (
            <View className="rounded-[16px] bg-gold-50 px-4 py-3">
              <Text className="font-sans-semibold text-gold-800">{`💌 ${name} has sealed ${waiting.data.waiting === 1 ? 'a capsule' : `${waiting.data.waiting} capsules`} for you.`}</Text>
              {waiting.data.nextAt ? <Text className="text-small text-gold-800">{`The next one opens ${formatCapsuleMoment(waiting.data.nextAt)}.`}</Text> : null}
            </View>
          ) : null}
          {(myCapsules.data ?? []).map((cap) => {
            const text = capsuleText(cap, cipher);
            return (
              <View key={cap.id} className="gap-2 rounded-[16px] bg-paper-raised px-4 py-3">
                <Text className="text-micro text-ink-muted">{`Opens ${formatCapsuleMoment(cap.deliver_at)}`}</Text>
                <Text numberOfLines={2}>{text ?? 'Sealed'}</Text>
                <View className="flex-row flex-wrap gap-2">
                  <Button variant="secondary" size="sm" disabled={text === null} onPress={() => text !== null && setCapsule({ capsule: cap, text })}>
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() =>
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
                  <Button variant="quiet" size="sm" onPress={() => void myCapsules.mutate(() => cancelCapsule(sb, cap.id)).catch(fail)}>
                    Cancel
                  </Button>
                </View>
              </View>
            );
          })}
          <Button variant="secondary" onPress={() => setCapsule('new')}>
            Seal a new one 💌
          </Button>
        </Section>

        {/* Saved and pinned */}
        <Section title="Saved by you" icon={<Star size={16} color={c.inkSoft} />}>
          <MessageRows items={saved.data ?? []} empty={saved.loading ? 'Looking…' : 'Press and hold a message and tap Save to keep it here. Only you see this list.'} meId={me.id} name={name} onPick={openInChat} />
        </Section>
        <Section title="Pinned">
          <MessageRows items={pinned.data ?? []} empty={pinned.loading ? 'Looking…' : 'Nothing pinned.'} meId={me.id} name={name} onPick={openInChat} />
        </Section>

        {/* Look */}
        <Section title="Chat theme">
          <Text className="mb-2 text-small text-ink-soft">{`Both of you see it. Your bubbles keep your colours.`}</Text>
          <View className="flex-row flex-wrap gap-3">
            {CHAT_THEME_ORDER.map((t) => {
              const on = (theme.data ?? 'paper') === t;
              return (
                <Pressable
                  key={t}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${CHAT_THEMES[t].label} theme`}
                  onPress={() => void theme.mutate(() => setChatTheme(sb, { coupleId: couple.id, me: me.id }, t as ChatTheme)).catch(fail)}
                  className="items-center gap-1"
                >
                  <View className={cn('h-12 w-12 items-center justify-center rounded-full border-2', on ? 'border-rose-500' : 'border-paper-edge')} style={{ backgroundColor: CHAT_THEMES[t].swatch }}>
                    {on ? <Check size={18} color={t === 'night' ? '#fff' : c.ink} /> : null}
                  </View>
                  <Text className="text-micro text-ink-soft">{CHAT_THEMES[t].label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        {/* More */}
        <Section title="More">
          <Row label="Nickname" detail={nickname.data ? `“${nickname.data}”, only you see it` : `What you call ${partner.display_name}, only you see it`} onPress={() => setNaming(true)} />
          <Row label="Notifications" detail={muted ? 'Messages are muted' : 'Sounds, quiet hours, previews'} onPress={() => router.push('/settings')} icon={<Bell size={18} color={c.inkSoft} />} />
          <Row label="Chat security" detail="Your devices and safety codes" onPress={() => router.push('/settings')} icon={<ShieldCheck size={18} color={c.inkSoft} />} />
        </Section>
      </ScrollView>

      <CapsuleSheet
        open={capsule !== null}
        editing={capsule && capsule !== 'new' ? capsule : null}
        onClose={() => setCapsule(null)}
        onDone={() => {
          setCapsule(null);
          void myCapsules.reload();
        }}
      />
      <PhotoViewer uri={photo} label="Photo" onClose={() => setPhoto(null)} />
      <VideoViewer uri={video} onClose={() => setVideo(null)} />
      <FormSheet open={naming} title="Nickname" onClose={() => setNaming(false)}>
        <NicknameForm
          initial={nickname.data ?? ''}
          partnerName={partner.display_name}
          onSave={async (n) => {
            await nickname.mutate(() => setNickname(sb, me.id, n));
            setNaming(false);
          }}
        />
      </FormSheet>
    </View>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-1.5">
        {icon}
        <Text className="font-sans-bold text-micro uppercase tracking-[0.6px] text-ink-muted">{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Quick({ label, icon, onPress }: { label: string; icon: ReactNode; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="flex-1 items-center gap-1 rounded-[18px] bg-paper-raised py-3 active:bg-paper-sunken">
      {icon}
      <Text className="font-sans-medium text-micro">{label}</Text>
    </Pressable>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="w-[48.5%] rounded-[18px] bg-paper-raised p-3" accessible accessibilityLabel={`${value} ${label}`}>
      <Display className="text-heading">{value}</Display>
      <Text className="text-micro text-ink-soft">{label}</Text>
    </View>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <Text className="py-4 text-center text-small text-ink-muted">{children}</Text>;
}

function Row({ label, detail, icon, onPress }: { label: string; detail?: string; icon?: ReactNode; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="flex-row items-center gap-3 rounded-[16px] bg-paper-raised px-4 py-3 active:bg-paper-sunken">
      {icon}
      <View className="flex-1">
        <Text className="text-body">{label}</Text>
        {detail ? <Text className="text-small text-ink-muted">{detail}</Text> : null}
      </View>
      <ChevronRight size={18} color={c.inkMuted} />
    </Pressable>
  );
}

function MediaGrid({ items, urls, onPhoto, onVideo, loading }: { items: Message[]; urls: Record<string, string>; onPhoto: (u: string) => void; onVideo: (u: string) => void; loading: boolean }) {
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - 40 - 8) / 3);
  if (!items.length) return <Empty>{loading ? 'Looking…' : 'Photos and videos you send each other show up here.'}</Empty>;
  return (
    <View className="flex-row flex-wrap gap-1">
      {items.map((m) => {
        const url = m.media_path ? urls[m.media_path] : undefined;
        const poster = videoPoster(m.media_meta);
        const isVideo = m.media_kind === 'video';
        return (
          <Pressable
            key={m.id}
            accessibilityRole="imagebutton"
            accessibilityLabel={isVideo ? 'Video' : 'Photo'}
            disabled={!url}
            onPress={() => url && (isVideo ? onVideo(url) : onPhoto(url))}
            style={{ width: tile, height: tile }}
            className="overflow-hidden rounded-[6px] bg-paper-sunken"
          >
            {isVideo ? (
              poster ? <Photo uri={poster} style={{ width: '100%', height: '100%' }} /> : <View className="h-full w-full bg-plum-900" />
            ) : url ? (
              <Photo uri={url} cacheKey={m.media_path} style={{ width: '100%', height: '100%' }} />
            ) : null}
            {isVideo ? (
              <View className="absolute bottom-1 left-1 rounded-full bg-black/50 p-1">
                <Play size={12} color="#fff" fill="#fff" />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Links in our messages, found on this phone as the thread is read. */
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
    <View className="gap-2">
      {found.map((m) => {
        const card = linkPreviewOf(m.media_meta);
        const url = card?.url ?? firstLink(m.body);
        return (
          <View key={m.id} className="rounded-[16px] bg-paper-raised p-3">
            {card ? (
              <LinkCard preview={card} />
            ) : (
              <Pressable accessibilityRole="link" onPress={() => url && void Linking.openURL(url)} className="flex-row items-center gap-2">
                <Link2 size={16} color="#0A776D" />
                <Text className="flex-1 text-small text-teal-800 underline" numberOfLines={1}>
                  {url}
                </Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" onPress={() => onOpenInChat(m)} className="mt-1 self-start">
              <Text className="text-micro text-ink-muted">{`${formatDay(m.created_at)} · Show in chat`}</Text>
            </Pressable>
          </View>
        );
      })}
      {!done ? <Empty>Still looking…</Empty> : null}
    </View>
  );
}

function MessageRows({ items, empty, meId, name, onPick }: { items: Message[]; empty: string; meId: string; name: string; onPick: (m: Message) => void }) {
  const shown = useMemo(() => items.slice(0, 30), [items]);
  if (!shown.length) return <Empty>{empty}</Empty>;
  return (
    <View className="gap-1.5">
      {shown.map((m) => (
        <Pressable key={m.id} accessibilityRole="button" onPress={() => onPick(m)} className="rounded-[16px] bg-paper-raised px-4 py-3 active:bg-paper-sunken">
          <Text className="text-micro text-ink-muted">{`${m.sender_id === meId ? 'You' : name} · ${formatDay(m.created_at)}`}</Text>
          <Text numberOfLines={2}>{messagePreview(m)}</Text>
        </Pressable>
      ))}
    </View>
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
    <>
      <Text className="text-ink-soft">{`Shown instead of “${partnerName}” in your chat. Only you see it.`}</Text>
      <Field label="Nickname" value={value} onChangeText={setValue} maxLength={40} placeholder="Like Sunshine" />
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button loading={busy} onPress={() => void save(value.trim() || null)}>
        Save
      </Button>
      {initial ? (
        <Button variant="quiet" disabled={busy} onPress={() => void save(null)}>
          {`Use “${partnerName}” again`}
        </Button>
      ) : null}
    </>
  );
}

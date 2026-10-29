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
import { useAccess, useCallManager, useCouple, useCoupleData, useFeatures, useTyping } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { CalendarHeart, Camera, ChevronRight, HeartHandshake, HeartPulse, MessageCircleHeart, Pencil, Phone, Settings, Sparkles, Video } from 'lucide-react-native';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bootHome, saveHome } from '@/lib/boot-cache';
import { ErrorNote } from '../module-screen';
import { PlantCard } from '../plant/plant-card';
import { DoodleNote, DrawingBanner } from '@/components/draw/home-draw';
import { SnapRow } from '../snaps/snap-row';
import { Avatar } from '../ui/avatar';
import { Button, IconButton } from '../ui/button';
import { cn } from '../ui/cn';
import { Field } from '../ui/field';
import { FormSheet } from '../ui/form-sheet';
import { usePalette } from '../ui/palette';
import { PhotoViewer } from '../ui/photo-viewer';
import { Chip } from '../ui/segmented';
import { Sheet } from '../ui/sheet';
import { Display, Text } from '../ui/text';
import { ComingUp } from './countdowns';
import { SafetyCard } from './safety';

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** The page the app opens on: the two of you, how you both are, and what's next. */
export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const { sb, couple, me, partner, mySlot, partnerSlot, partnerOnline, unread, channel } = useCouple();
  const { partnerTyping } = useTyping();
  const calls = useCallManager();
  const has = useFeatures();
  const announcement = useAccess()?.announcement;
  const [saved] = useState(() => {
    const h = bootHome();
    return h?.couple.id === couple.id ? h : undefined;
  });
  const home = useCoupleData('home', () => getHome(sb, { coupleId: couple.id, meId: me.id }), [sb, couple.id, me.id], saved);
  useEffect(() => {
    if (home.data) saveHome(me.id, home.data);
  }, [home.data, me.id]);
  const [editingStatus, setEditingStatus] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Home summarises every area, so any change my partner makes anywhere refreshes it.
  useEffect(() => channel.changes.on((e) => e.from !== me.id && void home.reload()), [channel, me.id, home.reload]);
  useFocusEffect(
    useCallback(() => {
      void home.reload();
    }, [home.reload]),
  );

  const [tapState, setTapState] = useState<'idle' | 'sent' | 'wait'>('idle');
  async function tap() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
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

  async function changePhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.7 });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset || !d) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const bytes = await (await fetch(asset.uri)).arrayBuffer();
      await home.mutate(() => setCouplePhoto(sb, d.couple, bytes, asset.mimeType ?? 'image/jpeg'));
    } catch (e) {
      setPhotoError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
      contentContainerClassName="gap-5 px-5"
      refreshControl={<RefreshControl refreshing={home.loading && !!d} onRefresh={() => void home.reload()} />}
    >
      <View className="flex-row items-center gap-2.5">
        <View className="flex-1">
          <Text className="text-small text-ink-muted">{greeting()},</Text>
          <Display className="text-title" numberOfLines={1}>
            {myName}
          </Display>
        </View>
        <IconButton label="Settings" size="sm" tone="raised" onPress={() => router.push('/settings')}>
          <Settings size={19} color={c.inkSoft} />
        </IconButton>
      </View>

      {has('draw') && <DrawingBanner />}

      {announcement ? (
        <Sheet tone="note" accent={announcement.tone === 'warning' ? 'gold' : 'plum'} pad="sm">
          <Text className="text-small">{announcement.body}</Text>
        </Sheet>
      ) : null}

      {/* The two of you */}
      <View className="overflow-hidden rounded-[28px] bg-plum-800">
        {d?.photoUrl ? (
          <Pressable accessibilityRole="imagebutton" accessibilityLabel="Photo of you two. Open full screen" onPress={() => setViewing(d.photoUrl)}>
            <Image source={{ uri: d.photoUrl }} className="aspect-[4/3] w-full" resizeMode="cover" />
          </Pressable>
        ) : (
          <View className="aspect-[4/3] w-full items-center justify-center overflow-hidden">
            <View className="absolute h-56 w-56 rounded-full bg-rose-400 opacity-90" style={{ transform: [{ translateX: -52 }] }} />
            <View className="absolute h-56 w-56 rounded-full bg-teal-500 opacity-80" style={{ transform: [{ translateX: 52 }] }} />
            <Button variant="night" size="sm" icon={<Camera size={16} color="#fff" />} onPress={() => void changePhoto()} loading={photoBusy}>
              Add a photo of you two
            </Button>
          </View>
        )}
        <View className="flex-row items-end justify-between gap-3 bg-plum-900/80 px-5 py-4" pointerEvents="box-none">
          <View className="flex-1">
            <Display className="text-heading text-paper" numberOfLines={1}>
              {myName} & {theirName}
            </Display>
            <Text className="text-small text-plum-200">
              Together <Text className="font-sans-semibold text-small text-gold-300">{days}</Text> {days === 1 ? 'day' : 'days'}
            </Text>
          </View>
          {d?.photoUrl ? (
            <IconButton label="Change photo of you two" tone="night" size="sm" onPress={() => void changePhoto()}>
              {photoBusy ? <ActivityIndicator color="#fff" /> : <Camera size={18} color="#fff" />}
            </IconButton>
          ) : null}
        </View>
      </View>
      {photoError ? <ErrorNote>{photoError}</ErrorNote> : null}

      {has('draw') && <DoodleNote />}

      {has('snaps') && <SnapRow />}

      {/* How you both are */}
      <View className="flex-row gap-3">
        <StatusCard
          who={theirName}
          slot={partnerSlot}
          status={theirStatus}
          presence={partnerTyping ? 'typing…' : partnerOnline ? 'here now' : 'away'}
          online={partnerOnline}
          empty="No status yet"
        />
        <StatusCard who="You" slot={mySlot} status={myStatus} empty="How are you?" onPress={() => setEditingStatus(true)} />
      </View>

      {/* Reach each other */}
      <View className="flex-row gap-2">
        {has('chat') && (
          <Action label="Message" onPress={() => router.push('/talk')} badge={unread}>
            <MessageCircleHeart size={22} color="#fff" />
          </Action>
        )}
        {has('calls') && (
          <Action label="Call" onPress={() => void calls.startCall('audio')}>
            <Phone size={22} color="#fff" />
          </Action>
        )}
        {has('calls') && (
          <Action label="Video" onPress={() => void calls.startCall('video')}>
            <Video size={22} color="#fff" />
          </Action>
        )}
        {has('taps') && (
          <Action label={tapState === 'sent' ? 'Sent 💗' : tapState === 'wait' ? 'One moment' : 'Thinking of you'} onPress={() => void tap()}>
            <HeartPulse size={22} color="#fff" />
          </Action>
        )}
      </View>

      {d?.taps && has('taps') ? (
        <Sheet tone="note" accent="rose" pad="sm" className="flex-row items-center gap-3">
          <Text className="text-[24px] leading-[30px]">💗</Text>
          <Text className="flex-1 text-small">
            <Text className="font-sans-medium text-small">{theirName}</Text>
            {` is thinking of you · ${d.taps.count > 1 ? `${d.taps.count} times today, last ` : ''}${timeAgo(d.taps.latest)}`}
          </Text>
        </Sheet>
      ) : null}

      {home.error && !d ? <ErrorNote>{home.error}</ErrorNote> : null}
      {!d && home.loading ? <ActivityIndicator color={c.rose} /> : null}

      {d && has('countdowns') ? <ComingUp countdowns={d.countdowns} mutate={home.mutate} /> : null}
      {d && (has('location') || has('arrival')) ? <SafetyCard /> : null}

      {d && has('calendar') ? (
        <Card
          icon={<CalendarHeart size={18} color={c.onPlum} />}
          eyebrow="Next up"
          title={d.nextEvent ? d.nextEvent.title : 'Nothing planned yet'}
          detail={
            d.nextEvent
              ? `${new Date(d.nextEvent.starts_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${formatEventTime(d.nextEvent)}`
              : 'Plan a date, a trip, or a quiet night in.'
          }
          onPress={() => router.push('/plan')}
        />
      ) : null}

      {d && has('memories') ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/memory')}>
          <Sheet pad="none" className="overflow-hidden">
            {d.memoryPhotoUrl ? <Image source={{ uri: d.memoryPhotoUrl }} className="aspect-[16/9] w-full" resizeMode="cover" /> : null}
            <View className="flex-row items-center gap-3 p-5">
              <View className="flex-1 gap-1">
                <View className="flex-row items-center gap-1.5">
                  <Sparkles size={14} color={c.onGold} />
                  <Text className="font-sans-medium text-micro text-gold-700">
                    {d.memory?.yearsAgo ? `On this day · ${d.memory.yearsAgo} ${d.memory.yearsAgo === 1 ? 'year' : 'years'} ago` : 'A memory'}
                  </Text>
                </View>
                <Display className="text-heading" numberOfLines={2}>
                  {d.memory ? d.memory.title : 'Keep your first memory'}
                </Display>
                {!d.memory ? <Text className="text-small text-ink-soft">A photo, a line, the date — the start of your story.</Text> : null}
              </View>
              <ChevronRight size={20} color={c.inkMuted} />
            </View>
          </Sheet>
        </Pressable>
      ) : null}

      {has('daily_question') ? (
        <Card
          icon={<HeartHandshake size={18} color={c.onTeal} />}
          eyebrow="Connect"
          title="Today’s question"
          detail="One question a day. Your answers open once you’ve both replied."
          onPress={() => router.push('/connect')}
        />
      ) : null}

      {d && has('plant') ? <PlantCard /> : null}

      <FormSheet centered open={editingStatus} title="Your status" onClose={() => setEditingStatus(false)}>
        {editingStatus ? (
          <StatusForm
            initial={myStatus}
            partnerName={theirName}
            onSave={async (s) => {
              await home.mutate(() => setMyStatus(sb, me.id, s));
              setEditingStatus(false);
            }}
          />
        ) : null}
      </FormSheet>
      <PhotoViewer uri={viewing} label="Photo of you two" onClose={() => setViewing(null)} />
    </ScrollView>
  );
}

function StatusCard({
  who,
  slot,
  status,
  presence,
  online,
  empty,
  onPress,
}: {
  who: string;
  slot: PartnerSlot;
  status: Status | null;
  presence?: string;
  online?: boolean;
  empty: string;
  onPress?: () => void;
}) {
  const c = usePalette();
  const inner = (
    <Sheet pad="sm" className={cn('grow gap-1.5', slot === 'a' ? 'border-rose-200' : 'border-teal-200')}>
      <View className="flex-row items-center gap-2">
        <Avatar name={who} slot={slot} size="sm" online={online} />
        <Text className="flex-1 font-sans-semibold text-small" numberOfLines={1}>
          {who}
        </Text>
        {onPress ? (
          <View className="h-7 w-7 items-center justify-center rounded-full bg-rose-50">
            <Pencil size={13} color={c.onRose} />
          </View>
        ) : null}
      </View>
      {status ? (
        <>
          {/* Emoji inline with the words keeps the card short. */}
          <Text className="font-sans-medium text-ink" numberOfLines={2}>
            {status.emoji ? `${status.emoji} ` : ''}
            {status.text ?? ''}
          </Text>
          <Text className="text-micro text-ink-muted">
            {timeAgo(status.at)}
            {presence ? ` · ${presence}` : ''}
          </Text>
        </>
      ) : (
        <>
          <Text className={onPress ? 'font-sans-medium text-rose-700' : 'text-ink-soft'}>{onPress ? 'Set your status' : empty}</Text>
          {presence ? <Text className="text-micro text-ink-muted">{presence}</Text> : null}
        </>
      )}
    </Sheet>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={`Your status: ${status?.text ?? 'not set'}. Change`} onPress={onPress} className="flex-1 active:opacity-75">
      {inner}
    </Pressable>
  ) : (
    <View className="flex-1">{inner}</View>
  );
}

function StatusForm({
  initial,
  partnerName,
  onSave,
}: {
  initial: Status | null;
  partnerName: string;
  onSave: (s: { emoji: string | null; text: string | null } | null) => Promise<void>;
}) {
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
    <>
      <Text className="text-small text-ink-soft">{partnerName} sees this on their Home. It fades after a day.</Text>
      <View className="flex-row flex-wrap gap-2">
        {STATUS_PRESETS.map((p) => (
          <Chip
            key={p.text}
            selected={emoji === p.emoji && text === p.text}
            onPress={() => {
              setEmoji(p.emoji);
              setText(p.text);
            }}
          >
            {`${p.emoji} ${p.text}`}
          </Chip>
        ))}
      </View>
      <View className="flex-row gap-3">
        <Field label="Emoji" value={emoji} onChangeText={setEmoji} maxLength={8} className="w-24" inputClassName="text-center text-lead" />
        <Field label="Or in your words" value={text} onChangeText={setText} maxLength={STATUS_MAX} placeholder="e.g. thinking of you" className="flex-1" />
      </View>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button loading={busy} disabled={!emoji.trim() && !text.trim()} onPress={() => void run({ emoji, text })}>
        Share status
      </Button>
      {initial ? (
        <Button variant="quiet" disabled={busy} onPress={() => void run(null)}>
          Clear my status
        </Button>
      ) : null}
    </>
  );
}

function Action({ label, onPress, badge, children }: { label: string; onPress: () => void; badge?: number; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
      onPress={onPress}
      className="flex-1 items-center gap-1 rounded-sheet border border-paper-edge bg-paper-raised px-1 py-2.5 shadow-md shadow-plum-800/25 active:scale-95 active:bg-paper-sunken"
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-rose-600">{children}</View>
      {/* Two short lines rather than shrink-to-fit, which Android draws past the card at this width. */}
      <Text className="px-1 text-center font-sans-medium text-micro" numberOfLines={2}>
        {label}
      </Text>
      {badge ? (
        <View className="absolute right-3 top-2 min-w-[22px] items-center rounded-full border-2 border-paper-raised bg-rose-600 px-1.5 py-0.5">
          <Text className="text-[11px] font-sans-semibold leading-[13px] text-white">{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function Card({ icon, eyebrow, title, detail, onPress }: { icon: ReactNode; eyebrow: string; title: string; detail: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Sheet className="flex-row items-center gap-4">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-plum-50">{icon}</View>
        <View className="flex-1 gap-0.5">
          <Text className="font-sans-medium text-micro text-ink-muted">{eyebrow}</Text>
          <Display className="text-lead" numberOfLines={1}>
            {title}
          </Display>
          <Text className="text-small text-ink-soft" numberOfLines={2}>
            {detail}
          </Text>
        </View>
        <ChevronRight size={20} color={c.inkMuted} />
      </Sheet>
    </Pressable>
  );
}

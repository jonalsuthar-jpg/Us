import { BIRTHDAY_STEPS, birthdayUrls, daysTogether, type BirthdayRoom } from '@us/shared';
import { useBirthdayStory, useCouple, useUsSoFar } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Confetti } from '../games/confetti';
import { Button } from '../ui/button';
import { cn } from '../ui/cn';
import { Display, Text } from '../ui/text';
import { SongPlayer } from './audio';
import { Cake } from './cake';

/**
 * The birthday story, kept in Memories: tapped through again at your own
 * pace, exactly as it was written.
 */
export function BirthdayStoryScreen({ memoryId }: { memoryId: string }) {
  const story = useBirthdayStory(memoryId);
  const insets = useSafeAreaInsets();
  if (!story.room) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-plum-900 px-8" style={{ paddingTop: insets.top }}>
        {story.loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text className="text-center text-body text-plum-100">This story isn’t here 🙂</Text>
            <Button variant="night" onPress={() => router.back()}>
              Back
            </Button>
          </>
        )}
      </View>
    );
  }
  return <Story room={story.room} />;
}

function Story({ room }: { room: BirthdayRoom }) {
  const insets = useSafeAreaInsets();
  const { sb, me, partner } = useCouple();
  const from = room.from_id === me.id ? me.display_name : partner.display_name;
  const c = room.content;

  // Pages with nothing in them are skipped.
  const steps = useMemo(
    () =>
      BIRTHDAY_STEPS.filter((s) => {
        if (s === 'song') return !!c.song.audio_path;
        if (s === 'notes') return c.notes.length > 0;
        if (s === 'quiz') return c.quiz.length > 0;
        if (s === 'gift') return !!c.gift.title;
        return true;
      }),
    [c],
  );
  const [index, setIndex] = useState(0);
  const step = steps[Math.min(index, steps.length - 1)]!;
  const [note, setNote] = useState(0);
  const [blown, setBlown] = useState(false);
  const [burst, setBurst] = useState(0);
  const celebrate = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBurst((n) => n + 1);
  };

  // Private files (the song, photos): signed links.
  const paths = useMemo(() => [c.song.audio_path, ...c.moments.map((m) => m.photo_path)].filter((p): p is string => !!p), [c]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!paths.length) return;
    let live = true;
    birthdayUrls(sb, paths)
      .then((u) => live && setUrls(u))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sb, paths]);

  const notesLeft = step === 'notes' && note < c.notes.length - 1;
  const next = () => {
    if (notesLeft) return setNote((n) => n + 1);
    if (index < steps.length - 1) setIndex(index + 1);
  };
  const back = () => {
    if (step === 'notes' && note > 0) return setNote((n) => n - 1);
    if (index > 0) setIndex(index - 1);
  };
  // Tapping the page moves on, except where the page itself is the thing to tap.
  const tapToAdvance = step === 'song' || step === 'notes' || step === 'us' || (step === 'wish' && blown);

  return (
    <View className="flex-1 bg-plum-900">
      <Backdrop />
      <View style={{ paddingTop: insets.top + 8 }} className="gap-3 px-4">
        <View className="flex-row gap-1">
          {steps.map((s, i) => (
            <View key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
              <View className={cn('h-full rounded-full bg-white', i < index ? 'w-full' : i === index ? 'w-1/2' : 'w-0')} />
            </View>
          ))}
        </View>
        <View className="flex-row items-center gap-2">
          <Text className="font-sans-medium text-small text-plum-100">{`From ${from} 💌`}</Text>
          <View className="flex-1" />
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={() => router.back()} className="h-9 w-9 items-center justify-center rounded-full bg-white/15">
            <X size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      <Pressable accessible={false} disabled={!tapToAdvance} onPress={next} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-6" showsVerticalScrollIndicator={false}>
          <Animated.View key={`${step}-${step === 'notes' ? note : ''}`} entering={FadeInDown.duration(380)}>
            {step === 'wish' ? (
              <Wish
                line={c.wish.line}
                name={room.name}
                blown={blown}
                onBlow={() => {
                  setBlown(true);
                  celebrate();
                  // The song comes in once the confetti has had its moment.
                  setTimeout(() => setIndex((i) => (i === 0 ? 1 : i)), 2600);
                }}
              />
            ) : step === 'song' ? (
              <Song caption={c.song.caption} url={c.song.audio_path ? urls[c.song.audio_path] : undefined} from={from} />
            ) : step === 'notes' ? (
              <Notes notes={c.notes} index={note} />
            ) : step === 'us' ? (
              <UsSoFar room={room} urls={urls} from={from} />
            ) : step === 'quiz' ? (
              <Quiz room={room} from={from} />
            ) : step === 'gift' ? (
              <Gift title={c.gift.title} body={c.gift.body} onOpen={celebrate} />
            ) : (
              <Ending line={c.ending.line} from={from} />
            )}
          </Animated.View>
        </ScrollView>
      </Pressable>

      <View className="flex-row items-center justify-between px-5" style={{ paddingBottom: insets.bottom + 14 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          disabled={index === 0 && note === 0}
          onPress={back}
          className={cn('h-12 w-12 items-center justify-center rounded-full bg-white/10', index === 0 && note === 0 && 'opacity-30')}
        >
          <ChevronLeft size={22} color="#fff" />
        </Pressable>
        {step === 'notes' && c.notes.length > 1 ? <Text className="text-small text-plum-200">{`${note + 1} / ${c.notes.length}`}</Text> : null}
        {index < steps.length - 1 ? (
          <Pressable accessibilityRole="button" onPress={next} className="h-12 flex-row items-center gap-1 rounded-full bg-white px-5 active:bg-plum-100">
            <Text className="font-sans-semibold text-body text-plum-900">{step === 'wish' && !blown ? 'Skip' : 'Next'}</Text>
            <ChevronRight size={18} color="#241933" />
          </Pressable>
        ) : (
          <View className="h-12 w-12" />
        )}
      </View>

      {burst ? <Confetti key={burst} pieces={70} /> : null}
    </View>
  );
}

/** Soft party lights behind every page. */
function Backdrop() {
  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      <View className="absolute -left-24 -top-16 h-72 w-72 rounded-full bg-rose-500 opacity-25" />
      <View className="absolute -right-28 top-1/3 h-80 w-80 rounded-full bg-teal-500 opacity-20" />
      <View className="absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-gold-400 opacity-15" />
    </View>
  );
}

function Kicker({ children }: { children: string }) {
  return <Text className="text-center font-sans-semibold text-micro uppercase tracking-[2px] text-gold-300">{children}</Text>;
}

function Wish({ line, name, blown, onBlow }: { line: string; name: string; blown: boolean; onBlow: () => void }) {
  return (
    <View className="items-center gap-5">
      <Kicker>Make a wish</Kicker>
      <Display className="text-center text-[26px] leading-[33px] text-paper">{blown ? `Happy birthday, ${name}! 🎉` : line}</Display>
      <Pressable accessibilityRole="button" accessibilityLabel="Blow out the candles" disabled={blown} onPress={onBlow}>
        <Cake size={270} lit={!blown} />
      </Pressable>
      <Text className="text-center text-small text-plum-200">
        {blown ? 'I hope it comes true ✨' : 'Tap the candles to blow them out'}
      </Text>
    </View>
  );
}

function Song({ caption, url, from }: { caption: string; url?: string; from: string }) {
  return (
    <View className="items-center gap-6">
      <Kicker>{`A song from ${from}`}</Kicker>
      <Text className="text-center text-[56px] leading-[64px]">🎶</Text>
      {url ? (
        <SongPlayer url={url} autoPlay />
      ) : (
        <Text className="text-center text-body text-plum-200">Loading…</Text>
      )}
      {caption ? <Display italic className="text-center text-lead text-paper">{caption}</Display> : null}
    </View>
  );
}

function Notes({ notes, index }: { notes: string[]; index: number }) {
  return (
    <View className="gap-6">
      <Kicker>Things I’ve noticed about you</Kicker>
      <View className="min-h-[220px] justify-center rounded-[30px] bg-paper px-7 py-9" style={{ transform: [{ rotate: index % 2 ? '1.5deg' : '-1.5deg' }] }}>
        <Text className="absolute left-5 top-3 text-[40px] leading-[48px] text-rose-300">“</Text>
        <Display className="text-center text-[24px] leading-[32px] text-plum-900">{notes[index]}</Display>
      </View>
      <Text className="text-center text-small text-plum-200">{index < notes.length - 1 ? 'Tap for the next one' : '💛'}</Text>
    </View>
  );
}

function UsSoFar({ room, urls, from }: { room: BirthdayRoom; urls: Record<string, string>; from: string }) {
  const stats = useUsSoFar(true);
  const { couple } = useCouple();
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const lines: string[] = [];
  if (stats?.firstMessage) {
    lines.push(stats.firstMessage.text ? `Our first message: “${stats.firstMessage.text.slice(0, 80)}” on ${fmt(stats.firstMessage.at)}` : `Our first message: ${fmt(stats.firstMessage.at)}`);
  }
  lines.push(`Days on Us together: ${daysTogether(couple.paired_at)}`);
  if (stats) {
    lines.push(`Messages sent: ${stats.messages.toLocaleString()}`);
    if (stats.calls) lines.push(`Hours we’ve spent on calls: ${stats.callHours}`);
    if (stats.topEmoji) lines.push(`Most used emoji: ${stats.topEmoji.emoji}`);
  }
  return (
    <View className="gap-5">
      <Kicker>Us, so far</Kicker>
      <View className="gap-2.5">
        {lines.map((l, i) => (
          <Animated.View key={l} entering={FadeInUp.delay(150 + i * 220).duration(400)} className="rounded-[20px] bg-white/10 px-4 py-3">
            <Text className="text-body text-paper">{l}</Text>
          </Animated.View>
        ))}
        {!stats ? <ActivityIndicator color="#fff" /> : null}
      </View>
      {room.content.moments.length ? (
        <View className="gap-3">
          <Text className="font-sans-semibold text-small text-gold-300">{`A few moments ${from} picked`}</Text>
          {room.content.moments.map((m, i) => (
            <Animated.View key={i} entering={FadeIn.delay(900 + i * 250)} className="overflow-hidden rounded-[22px] bg-paper">
              {m.photo_path && urls[m.photo_path] ? <Image source={{ uri: urls[m.photo_path] }} className="aspect-[4/3] w-full" resizeMode="cover" /> : null}
              <View className="gap-1 px-4 py-3">
                {m.date ? <Text className="text-micro text-rose-600">{fmt(`${m.date}T12:00:00`)}</Text> : null}
                <Text className="text-body text-plum-900">{m.text}</Text>
              </View>
            </Animated.View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The questions, the answers, and how she marked each one on the day. */
function Quiz({ room, from }: { room: BirthdayRoom; from: string }) {
  const qs = room.content.quiz;
  const marked = qs.some((_, i) => room.marks[i] !== undefined);
  const score = qs.filter((_, i) => room.marks[i]).length;
  return (
    <View className="gap-5">
      <Kicker>How well do I know you?</Kicker>
      {marked ? <Display className="text-center text-[44px] leading-[50px] text-paper">{`${score}/${qs.length}`}</Display> : null}
      <View className="gap-3">
        {qs.map((q, i) => (
          <View key={i} className="gap-2 rounded-[24px] bg-paper px-5 py-4">
            <Display className="text-[19px] leading-[25px] text-plum-900">{q.q}</Display>
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 text-body text-plum-700">
                <Text className="text-micro text-rose-600">{`${from} said `}</Text>
                {q.a}
              </Text>
              {room.marks[i] !== undefined ? <Text className="text-lead text-plum-900">{room.marks[i] ? '✓' : '✗'}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function Gift({ title, body, onOpen }: { title: string; body: string; onOpen: () => void }) {
  const [taps, setTaps] = useState(0);
  const open = taps >= 3;
  const shake = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${shake.value}deg` }] }));
  const tap = () => {
    if (open) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    shake.value = withSequence(withTiming(-12, { duration: 70 }), withTiming(12, { duration: 90 }), withTiming(-8, { duration: 80 }), withTiming(0, { duration: 70 }));
    if (taps + 1 >= 3) onOpen();
    setTaps(taps + 1);
  };
  return (
    <View className="items-center gap-5">
      <Kicker>A little something</Kicker>
      {open ? (
        <Animated.View entering={FadeInDown.springify()} className="w-full items-center gap-3 rounded-[28px] border-2 border-dashed border-gold-300 bg-paper px-6 py-8">
          <Text className="text-[44px] leading-[52px]">🎟️</Text>
          <Display className="text-center text-[24px] leading-[31px] text-plum-900">{title || 'Your gift'}</Display>
          {body ? <Text className="text-center text-body text-plum-700">{body}</Text> : null}
        </Animated.View>
      ) : (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel="Shake the gift box" onPress={tap}>
            <Animated.Text style={[{ fontSize: 150, lineHeight: 170 }, style]}>🎁</Animated.Text>
          </Pressable>
          <Text className="text-center text-small text-plum-200">{taps === 0 ? 'Tap to shake it' : taps === 1 ? 'Again…' : 'One more!'}</Text>
        </>
      )}
    </View>
  );
}

function Ending({ line, from }: { line: string; from: string }) {
  return (
    <View className="items-center gap-6">
      <Text className="text-[56px] leading-[64px]">🎂</Text>
      <Display className="text-center text-[28px] leading-[36px] text-paper">{line}</Display>
      <Text className="text-small text-plum-200">{`— ${from}`}</Text>
    </View>
  );
}

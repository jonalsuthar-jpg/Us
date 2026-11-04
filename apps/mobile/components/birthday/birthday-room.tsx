import { BIRTHDAY_STEPS, birthdayUrls, daysTogether, type BirthdayRoom, type BirthdaySection, type BirthdayStep } from '@us/shared';
import { bringCakeOnAnswer, useBirthday, useCallManager, useCouple, useFeatures, useUsSoFar } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Pencil, Phone, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, PanResponder, Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Confetti } from '../games/confetti';
import { Button } from '../ui/button';
import { cn } from '../ui/cn';
import { FormSheet } from '../ui/form-sheet';
import { Display, Text } from '../ui/text';
import { SongPlayer, useBlow } from './audio';
import { BirthdayEditor } from './birthday-editor';
import { Cake } from './cake';

/** Which part of the story each step edits. */
const SECTION: Record<BirthdayStep, BirthdaySection> = {
  wish: 'wish',
  song: 'song',
  notes: 'notes',
  us: 'moments',
  quiz: 'quiz',
  gift: 'gift',
  cake: 'cake',
  card: 'card',
  ending: 'ending',
};

/**
 * The birthday room: a story she taps through at her own pace. The maker sees
 * the same thing as a preview, with a pencil on every page.
 */
export function BirthdayRoomScreen() {
  const b = useBirthday();
  const insets = useSafeAreaInsets();
  if (!b.room) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-plum-900 px-8" style={{ paddingTop: insets.top }}>
        {b.loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text className="text-center text-body text-plum-100">Nothing here yet 🙂</Text>
            <Button variant="night" onPress={() => router.back()}>
              Back
            </Button>
          </>
        )}
      </View>
    );
  }
  return <Story b={b} room={b.room} />;
}

function Story({ b, room }: { b: ReturnType<typeof useBirthday>; room: BirthdayRoom }) {
  const insets = useSafeAreaInsets();
  const { sb, me, partner } = useCouple();
  const has = useFeatures();
  const { maker } = b;
  const from = maker ? me.display_name : partner.display_name;
  const c = room.content;

  // Parts with nothing in them are skipped for her; the maker sees every page to fill it in.
  const steps = useMemo(
    () =>
      BIRTHDAY_STEPS.filter((s) => {
        if (maker) return true;
        if (s === 'song') return !!c.song.audio_path;
        if (s === 'notes') return c.notes.length > 0;
        if (s === 'quiz') return c.quiz.length > 0;
        if (s === 'gift') return !!c.gift.title;
        if (s === 'cake') return has('calls');
        if (s === 'card') return has('draw');
        return true;
      }),
    [maker, c, has],
  );
  const [index, setIndex] = useState(0);
  const step = steps[Math.min(index, steps.length - 1)]!;
  const [note, setNote] = useState(0);
  const [blown, setBlown] = useState(false);
  const [burst, setBurst] = useState(0);
  const [editing, setEditing] = useState<BirthdaySection | null>(null);
  const celebrate = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBurst((n) => n + 1);
  };

  // Her first look is noted (once); the maker's preview isn't.
  const { open } = b;
  useEffect(() => {
    if (!maker && !room.opened_at) void open().catch(() => {});
  }, [maker, room.opened_at, open]);

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

  const section = SECTION[step];
  const draft = c.drafts.includes(section);

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
          {maker ? (
            <View className="rounded-full bg-gold-300 px-2.5 py-1">
              <Text className="font-sans-semibold text-micro text-plum-900">{`Preview · ${room.name} sees this on her birthday`}</Text>
            </View>
          ) : (
            <Text className="font-sans-medium text-small text-plum-100">{`From ${from} 💌`}</Text>
          )}
          <View className="flex-1" />
          {maker ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit this page"
              onPress={() => setEditing(section)}
              className={cn('h-9 flex-row items-center gap-1.5 rounded-full px-3', draft ? 'bg-rose-500' : 'bg-white/15')}
            >
              <Pencil size={14} color="#fff" />
              <Text className="font-sans-semibold text-micro text-white">{draft ? 'Draft · Edit' : 'Edit'}</Text>
            </Pressable>
          ) : null}
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
              <Song caption={c.song.caption} url={c.song.audio_path ? urls[c.song.audio_path] : undefined} from={from} maker={maker} />
            ) : step === 'notes' ? (
              <Notes notes={c.notes} index={note} />
            ) : step === 'us' ? (
              <UsSoFar room={room} urls={urls} from={from} />
            ) : step === 'quiz' ? (
              <Quiz room={room} maker={maker} from={from} onMark={b.mark} onDone={celebrate} />
            ) : step === 'gift' ? (
              <Gift title={c.gift.title} body={c.gift.body} onOpen={celebrate} />
            ) : step === 'cake' ? (
              <CakeStep line={c.cake.line} from={from} maker={maker} canCall={has('calls')} onCut={celebrate} />
            ) : step === 'card' ? (
              <CardStep line={c.card.line} from={from} />
            ) : (
              <Ending room={room} maker={maker} from={from} b={b} />
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
      {maker ? <BirthdayEditor room={room} section={editing} urls={urls} onSave={b.save} onClose={() => setEditing(null)} /> : null}
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
  const mic = useBlow(!blown, () => !blown && onBlow());
  return (
    <View className="items-center gap-5">
      <Kicker>Make a wish</Kicker>
      <Display className="text-center text-[26px] leading-[33px] text-paper">{blown ? `Happy birthday, ${name}! 🎉` : line}</Display>
      <Pressable accessibilityRole="button" accessibilityLabel="Blow out the candles" disabled={blown} onPress={onBlow}>
        <Cake size={270} lit={!blown} />
      </Pressable>
      <Text className="text-center text-small text-plum-200">
        {blown ? 'I hope it comes true ✨' : mic === 'on' ? 'Blow into your phone… or tap the candles' : 'Tap the candles to blow them out'}
      </Text>
    </View>
  );
}

function Song({ caption, url, from, maker }: { caption: string; url?: string; from: string; maker: boolean }) {
  return (
    <View className="items-center gap-6">
      <Kicker>{`A song from ${from}`}</Kicker>
      <Text className="text-center text-[56px] leading-[64px]">🎶</Text>
      {url ? (
        <SongPlayer url={url} autoPlay />
      ) : (
        <Text className="text-center text-body text-plum-200">{maker ? 'No voice note yet. Tap Edit to record yourself singing.' : 'Loading…'}</Text>
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
        <Display className="text-center text-[24px] leading-[32px] text-plum-900">{notes[index] ?? 'Add a few notes from Edit.'}</Display>
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

function Quiz({ room, maker, from, onMark, onDone }: { room: BirthdayRoom; maker: boolean; from: string; onMark: (i: number, right: boolean) => Promise<void>; onDone: () => void }) {
  const qs = room.content.quiz;
  const [marks, setMarks] = useState<Record<string, boolean>>(() => (maker ? {} : room.marks));
  const firstOpen = qs.findIndex((_, i) => marks[i] === undefined);
  const [i, setI] = useState(firstOpen === -1 ? qs.length : firstOpen);
  const [shown, setShown] = useState(false);
  const score = Object.values(marks).filter(Boolean).length;

  const mark = (right: boolean) => {
    void Haptics.selectionAsync().catch(() => {});
    setMarks((m) => ({ ...m, [i]: right }));
    if (!maker) void onMark(i, right).catch(() => {});
    setShown(false);
    if (i + 1 >= qs.length) onDone();
    setI(i + 1);
  };

  if (!qs.length) return <Text className="text-center text-plum-200">Add questions from Edit.</Text>;
  if (i >= qs.length) {
    return (
      <View className="items-center gap-4">
        <Kicker>How well do I know you?</Kicker>
        <Display className="text-center text-[56px] leading-[62px] text-paper">{`${score}/${qs.length}`}</Display>
        <Text className="text-center text-lead text-plum-100">{score >= qs.length - 1 ? `Not bad for ${from}, right? 😎` : 'Okay, I’m still learning 😅'}</Text>
        <Pressable accessibilityRole="button" onPress={() => { setMarks({}); setI(0); }}>
          <Text className="text-small text-plum-300 underline">See them again</Text>
        </Pressable>
      </View>
    );
  }
  const q = qs[i]!;
  return (
    <View className="gap-5">
      <Kicker>{`How well do I know you? · ${i + 1}/${qs.length}`}</Kicker>
      <View className="gap-4 rounded-[28px] bg-paper px-6 py-7">
        <Display className="text-center text-[22px] leading-[29px] text-plum-900">{q.q}</Display>
        {shown ? (
          <Animated.View entering={FadeIn.duration(300)} className="items-center gap-1 rounded-[18px] bg-rose-50 px-4 py-3">
            <Text className="text-micro text-rose-600">{`${from} says`}</Text>
            <Text className="text-center font-sans-semibold text-lead text-plum-900">{q.a}</Text>
          </Animated.View>
        ) : (
          <Button onPress={() => setShown(true)}>{`Reveal ${from}’s answer`}</Button>
        )}
      </View>
      {shown ? (
        <View className="flex-row gap-3">
          <Button variant="night" className="flex-1" onPress={() => mark(false)}>
            ✗ Wrong
          </Button>
          <Button variant="accept" className="flex-1" onPress={() => mark(true)}>
            ✓ Right
          </Button>
        </View>
      ) : null}
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

/** A cake with a knife to drag down through it. */
export function CakeCutter({ knife, cut, size, onMove }: { knife: number; cut: boolean; size: number; onMove: (knife: number) => void }) {
  const move = useRef(onMove);
  move.current = onMove;
  const top = useRef(0);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Dragging the knife never turns into scrolling the page.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          top.current = e.nativeEvent.pageY - e.nativeEvent.locationY;
        },
        // The knife enters at the top of the cake (a third down) and leaves at the plate.
        onPanResponderMove: (e) => move.current((e.nativeEvent.pageY - top.current - size * 0.3) / (size * 0.55)),
      }),
    [size],
  );
  return (
    <View {...pan.panHandlers} accessibilityLabel="Drag down to cut the cake" accessibilityRole="adjustable">
      <Cake size={size} lit={false} knife={Math.max(knife, cut ? 1 : 0.02)} cut={cut} />
    </View>
  );
}

function CakeStep({ line, from, maker, canCall, onCut }: { line: string; from: string; maker: boolean; canCall: boolean; onCut: () => void }) {
  const calls = useCallManager();
  const [tryCake, setTryCake] = useState({ knife: 0, cut: false });
  return (
    <View className="items-center gap-5">
      <Kicker>Cut the cake together</Kicker>
      {line ? <Display className="text-center text-[22px] leading-[29px] text-paper">{line}</Display> : null}
      {maker ? (
        <>
          <Text className="text-center text-small text-plum-200">On the day, her button calls you. You both see this cake, and when either of you drags the knife, it cuts on both screens. Try it:</Text>
          <CakeCutter
            size={230}
            knife={tryCake.knife}
            cut={tryCake.cut}
            onMove={(k) =>
              setTryCake((t) => {
                if (t.cut) return t;
                const knife = Math.max(t.knife, Math.min(1, k));
                if (knife >= 0.92) {
                  onCut();
                  return { knife: 1, cut: true };
                }
                return { knife, cut: false };
              })
            }
          />
        </>
      ) : (
        <>
          <Cake size={210} lit={false} />
          {canCall ? (
            <Button
              size="lg"
              icon={<Phone size={18} color="#fff" />}
              onPress={() => {
                bringCakeOnAnswer();
                void calls.startCall('video');
              }}
            >
              {`Call ${from}`}
            </Button>
          ) : null}
          <Text className="text-center text-small text-plum-200">The cake comes out on the call. Drag the knife down to cut it.</Text>
        </>
      )}
    </View>
  );
}

function CardStep({ line, from }: { line: string; from: string }) {
  return (
    <View className="items-center gap-5">
      <Kicker>Sign the card</Kicker>
      <Text className="text-center text-[64px] leading-[72px]">💌</Text>
      {line ? <Display className="text-center text-[22px] leading-[29px] text-paper">{line}</Display> : null}
      <Button size="lg" onPress={() => router.push('/draw')}>
        Open Draw together ✍️
      </Button>
      <Text className="text-center text-small text-plum-200">{`Doodle and sign it with ${from}, live. Save it when you’re both done.`}</Text>
    </View>
  );
}

function Ending({ room, maker, from, b }: { room: BirthdayRoom; maker: boolean; from: string; b: ReturnType<typeof useBirthday> }) {
  const [keeping, setKeeping] = useState(false);
  const [thanking, setThanking] = useState(false);
  const [thanks, setThanks] = useState('Thank you for my birthday surprise 🥹💛');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kept = !!room.memory_id;
  return (
    <View className="items-center gap-6">
      <Text className="text-[56px] leading-[64px]">🎂</Text>
      <Display className="text-center text-[28px] leading-[36px] text-paper">{room.content.ending.line}</Display>
      <Text className="text-small text-plum-200">{`— ${from}`}</Text>
      <View className="w-full gap-3">
        <Button
          variant="night"
          disabled={maker || kept}
          loading={keeping}
          onPress={async () => {
            setKeeping(true);
            await b.keep().catch(() => {});
            setKeeping(false);
          }}
        >
          {kept ? 'Kept in Memories ✓' : 'Keep this in Memories'}
        </Button>
        <Button disabled={maker || sent} onPress={() => setThanking(true)}>
          {sent ? 'Thank-you sent 💛' : 'Send a thank-you'}
        </Button>
        {maker ? <Text className="text-center text-micro text-plum-300">These two buttons work for her on the day.</Text> : null}
      </View>
      <FormSheet centered open={thanking} title={`A note to ${from}`} onClose={() => setThanking(false)}>
        <TextInput
          accessibilityLabel="Your message"
          value={thanks}
          onChangeText={setThanks}
          multiline
          maxLength={1000}
          className="min-h-[110px] rounded-control border border-paper-edge bg-paper-raised px-4 py-3 font-sans text-body text-ink"
          textAlignVertical="top"
        />
        {error ? <Text className="text-small text-rose-600">{error}</Text> : null}
        <Button
          loading={busy}
          disabled={!thanks.trim()}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await b.thank(thanks);
              setSent(true);
              setThanking(false);
            } catch {
              setError('Couldn’t send. Try again.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Send
        </Button>
      </FormSheet>
    </View>
  );
}

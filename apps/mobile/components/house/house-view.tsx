import AsyncStorage from '@react-native-async-storage/async-storage';
import { Canvas, events as touchEvents } from '@react-three/fiber/native';
import { ADDABLE, CAMERA_LABEL, CAMERA_VIEWS, HAIRS, HAIRSTYLE_LABEL, HAIRSTYLES, HouseWorld, NOTE_MAX, orbitBy, PAINTS, PANTS, QUALITIES, saveHousePhoto, SHIRTS, SHOES, SKINS, tapAt, TOGETHER, TOGETHER_LABEL, useHouseGame, useHouseLoading, type HouseGame, type HouseSound, type Quality } from '@us/shared/house';
import { useCouple } from '@us/shared/react';
import { GLView } from 'expo-gl';
import { phoneHouseSound } from '@/lib/house-sound';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Aperture, Check, Gauge, Hand, Heart, House, Moon, Music, Paintbrush, Phone, PhoneOff, Plus, Radio, RotateCcw, RotateCw, Shirt, StickyNote, Sun, SwitchCamera, Trash2, Volume2, VolumeX, X } from 'lucide-react-native';
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, PixelRatio, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeOut, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { GradientView } from '../plan/art';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHousePack } from '@/lib/use-house-pack';
import { Text } from '../ui/text';

const QUALITY_KEY = 'us.house.quality';
const QUALITY_LABEL: Record<Quality, string> = { low: 'Smooth', medium: 'Balanced', high: 'Best looking' };
const DPR: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };
const STICK = 64;

/** Taps and drags reach the scene through our gestures, not R3F's own raycasting on every move. */
const noEvents: typeof touchEvents = (store) => ({ ...touchEvents(store), enabled: false });

const tick = () => void Haptics.selectionAsync().catch(() => {});

/**
 * Inside Our House, full screen in landscape, played like a game: the stick
 * on the left walks (push it all the way to run), dragging anywhere else
 * looks around, pinch zooms, and the big button does whatever's in reach.
 * Loaded only when the house opens (see app/(app)/house.tsx).
 */
export function HouseView() {
  const insets = useSafeAreaInsets();
  const game = useHouseGame();
  // The realistic house, when its pack is on the phone; the box house until then.
  const pack = useHousePack();
  const houseUrl = pack.kind === 'ready' ? pack.dir : undefined;
  const { sb, couple, me } = useCouple();
  // Sounds come with the pack; the sound button (remembered here) turns them off.
  const [sound, setSound] = useState<HouseSound | null>(null);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    void AsyncStorage.getItem('us.house.muted').then((v) => setMuted(v === '1')).catch(() => {});
  }, []);
  useEffect(() => {
    if (!houseUrl) return;
    const s = phoneHouseSound(houseUrl);
    setSound(s);
    return () => {
      s.dispose();
      setSound(null);
    };
  }, [houseUrl]);
  useEffect(() => sound?.setMaster(muted ? 0 : 1), [sound, muted]);
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    void AsyncStorage.setItem('us.house.muted', next ? '1' : '0').catch(() => {});
  };
  // Photo mode: what the house looks like right now, into Memories.
  const capture = useCallback(
    async ({ gl, scene, camera }: { gl: import('three').WebGLRenderer; scene: import('three').Scene; camera: import('three').Camera }) => {
      gl.render(scene, camera);
      const snap = await GLView.takeSnapshotAsync(gl.getContext() as never, { format: 'jpeg', compress: 0.9 });
      const bytes = await (await fetch(String(snap.uri))).arrayBuffer();
      await saveHousePhoto(sb, couple.id, me.id, bytes, 'image/jpeg');
    },
    [sb, couple.id, me.id],
  );
  const { controls, hud } = game;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [quality, setQuality] = useState<Quality | null>(null);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [fps, setFps] = useState(0);
  const [panel, setPanel] = useState<'look' | 'add' | 'note' | null>(null);
  const [problem, setProblem] = useState<Error | null>(null);
  // The camera view you last chose, remembered on this phone.
  useEffect(() => {
    void AsyncStorage.getItem('us.house.view')
      .then((v) => CAMERA_VIEWS.includes(v as never) && game.chooseView(v as (typeof CAMERA_VIEWS)[number]))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const nextView = () => {
    game.nextView();
    const order = CAMERA_VIEWS;
    void AsyncStorage.setItem('us.house.view', order[(order.indexOf(game.view) + 1) % order.length]!).catch(() => {});
  };
  // The loading screen stays until the house is in and drawing (or 25 s, whatever happens).
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 25_000);
    return () => clearTimeout(t);
  }, []);
  const loading = useHouseLoading();
  // The first time in, make yourself first.
  const asked = useRef(false);
  useEffect(() => {
    if (game.needsLook && !asked.current) {
      asked.current = true;
      setPanel('look');
    }
  }, [game.needsLook]);
  const stepped = useRef(false);
  const reports = useRef(0);

  useEffect(() => {
    void AsyncStorage.getItem(QUALITY_KEY)
      .catch(() => null)
      .then((q) => setQuality(QUALITIES.includes(q as Quality) ? (q as Quality) : 'medium'));
  }, []);

  // Nothing draws while the app is in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  const chooseQuality = useCallback((q: Quality) => {
    setQuality(q);
    stepped.current = true;
    void AsyncStorage.setItem(QUALITY_KEY, q).catch(() => {});
  }, []);

  // The first few seconds decide: a phone that can't keep up steps down once.
  const onFps = useCallback(
    (f: number, calls: number) => {
      setFps(Math.round(f));
      // In the phone's log too (adb logcat), to check how smoothly it runs.
      console.log(`[house] ${Math.round(f)} fps, ${calls} draw calls (${quality})`);
      // The first reports include loading; judge once it has settled.
      reports.current++;
      if (stepped.current || !quality || reports.current < 4) return;
      stepped.current = true;
      if (f < 22 && quality !== 'low') chooseQuality(quality === 'high' ? 'medium' : 'low');
    },
    [quality, chooseQuality],
  );

  // Looking: drag anywhere off the stick and the buttons; tap to walk or use. (The camera button sets the distance.)
  const look = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(6)
      .maxPointers(1)
      .runOnJS(true)
      .onChange((e) => orbitBy(controls, e.changeX, e.changeY, size.w));
    const tap = Gesture.Tap()
      .maxDistance(10)
      .runOnJS(true)
      .onEnd((e, ok) => {
        if (ok) tapAt(controls, e.x, e.y, size.w, size.h);
      });
    return Gesture.Race(tap, pan);
  }, [controls, size]);

  // expo-gl always draws at the screen's full density, so the canvas is laid
  // out smaller and scaled up: the quality setting decides the pixel count.
  const scale = quality ? Math.min(1, DPR[quality] / PixelRatio.get()) : 1;
  const pad = { left: Math.max(insets.left, 16), right: Math.max(insets.right, 16), top: Math.max(insets.top, 12), bottom: Math.max(insets.bottom, 12) };

  return (
    <View className="flex-1 bg-[#BFDDF2]" onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {quality && size.w > 0 ? (
        <GestureDetector gesture={look}>
          <View className="flex-1 overflow-hidden" collapsable={false}>
            <View
              pointerEvents="none"
              style={{ position: 'absolute', width: size.w * scale, height: size.h * scale, left: (size.w * (1 - scale)) / 2, top: (size.h * (1 - scale)) / 2, transform: [{ scale: 1 / scale }] }}
            >
              <Catch onError={setProblem}>
              <Canvas
                key={quality}
                shadows={quality !== 'low'}
                frameloop={!active ? 'never' : 'always'}
                camera={{ fov: 55, near: 0.1, far: 200 }}
                events={noEvents}
              >
                <HouseWorld {...game.world} quality={quality} onFps={onFps} houseUrl={houseUrl} onError={setProblem} onReady={onReady} sound={sound} capture={capture} />
              </Canvas>
              </Catch>
            </View>
          </View>
        </GestureDetector>
      ) : null}

      <Joystick game={game} left={pad.left + 8} bottom={pad.bottom + 8} />

      {/* Top left: out, and where I am. */}
      <View className="absolute flex-row items-center gap-3" style={{ left: pad.left, top: pad.top }} pointerEvents="box-none">
        <Round label="Leave the house" onPress={() => router.back()} size={44}>
          <X size={22} color="#fff" />
        </Round>
        {game.place ? <Chip text={game.place} /> : null}
      </View>

      {/* Left, under it: talk, the speaker, the sound. */}
      <View className="absolute gap-2" style={{ left: pad.left, top: pad.top + 56 }} pointerEvents="box-none">
        <Round label={game.inCall ? 'Stop talking' : `Talk to ${game.partnerName}`} onPress={game.toggleTalk} size={44} on={game.inCall}>
          {game.inCall ? <PhoneOff size={18} color="#fff" /> : <Phone size={18} color="#fff" />}
        </Round>
        <Round label={game.music ? 'Turn the speaker off' : 'Play the speaker'} onPress={game.toggleMusic} size={44} on={game.music}>
          <Radio size={18} color="#fff" />
        </Round>
        <Round label={muted ? 'Sound on' : 'Sound off'} onPress={toggleMute} size={44}>
          {muted ? <VolumeX size={18} color="#fff" /> : <Volume2 size={18} color="#fff" />}
        </Round>
      </View>

      {/* Top middle: where my partner is, then anything we just did together. */}
      <View className="absolute left-0 right-0 items-center gap-2" style={{ top: pad.top }} pointerEvents="none">
        <View className="flex-row items-center gap-2 rounded-full bg-black/35 px-3.5 py-2">
          <View className={game.partnerPlace ? 'h-2 w-2 rounded-full bg-sage-400' : 'h-2 w-2 rounded-full bg-white/50'} />
          <Text className="text-small text-white">{game.partnerPlace ? `${game.partnerName} · ${game.partnerPlace}` : `${game.partnerName} isn’t in the house`}</Text>
        </View>
        {game.decorate ? <Chip text={hud.selected ? 'Use the stick to slide it' : 'Tap something to move it'} /> : null}
        {game.moment ? (
          <View className="rounded-full bg-rose-600/90 px-4 py-2">
            <Text className="font-sans-bold text-small text-white">{game.moment}</Text>
          </View>
        ) : null}
      </View>

      {/* Top right: how it looks. */}
      <View className="absolute flex-row gap-2" style={{ right: pad.right, top: pad.top }} pointerEvents="box-none">
        <Round label={`Camera: ${CAMERA_LABEL[game.view]}. Tap for the next view`} onPress={nextView} size={44}>
          <SwitchCamera size={17} color="#fff" />
          <Text className="text-[8px] leading-[10px] text-white">{CAMERA_LABEL[game.view]}</Text>
        </Round>
        <Round label={game.night ? 'Make it day' : 'Make it night'} onPress={game.toggleNight} size={44}>
          {game.night ? <Sun size={20} color="#fff" /> : <Moon size={20} color="#fff" />}
        </Round>
        <Round label={game.decorate ? 'Done decorating' : 'Decorate'} onPress={() => game.setDecorate(!game.decorate)} size={44} on={game.decorate}>
          <Paintbrush size={20} color="#fff" />
        </Round>
        <Round label="Take a photo (saved to Memories)" onPress={game.actions.photo} size={44}>
          <Aperture size={19} color="#fff" />
        </Round>
        <Round label="My look" onPress={() => setPanel(panel === 'look' ? null : 'look')} size={44} on={panel === 'look'}>
          <Shirt size={20} color="#fff" />
        </Round>
        {quality ? (
          <Round label={`Picture: ${QUALITY_LABEL[quality]}. Tap to change`} onPress={() => chooseQuality(QUALITIES[(QUALITIES.indexOf(quality) + 1) % QUALITIES.length]!)} size={44}>
            <Gauge size={18} color="#fff" />
          </Round>
        ) : null}
      </View>

      {/* Bottom right: the action button and emotes, or the decorating tools. */}
      <View className="absolute items-end gap-3" style={{ right: pad.right, bottom: pad.bottom }} pointerEvents="box-none">
        {game.decorate ? (
          <DecorTools game={game} onAdd={() => setPanel(panel === 'add' ? null : 'add')} />
        ) : (
          <View className="items-end gap-3" pointerEvents="box-none">
            {/* Close to each other: ask to do something together. */}
            {hud.nearPartner && !hud.invite && !hud.asking ? (
              <View className="flex-row gap-2">
                {TOGETHER.map((k) => (
                  <Pressable key={k} accessibilityRole="button" onPress={() => game.actions.invite(k)} className="rounded-full bg-rose-600/85 px-3.5 py-2 active:bg-rose-700">
                    <Text className="font-sans-medium text-small text-white">{TOGETHER_LABEL[k]}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {hud.note ? (
              <Pressable accessibilityRole="button" onPress={() => setPanel('note')} className="flex-row items-center gap-2 rounded-full bg-gold-500/90 px-3.5 py-2">
                <StickyNote size={16} color="#fff" />
                <Text className="font-sans-medium text-small text-white">{hud.note === 'read' ? 'Read the note' : 'Leave a note'}</Text>
              </Pressable>
            ) : null}
          <View className="flex-row items-end gap-3" pointerEvents="box-none">
            <View className="gap-3">
              <Round label="Wave" onPress={() => game.actions.emote('wave')}>
                <Hand size={22} color="#fff" />
              </Round>
              <Round label="Send a heart" onPress={() => game.actions.emote('heart')}>
                <Heart size={22} color="#fff" fill="#FF4D7D" />
              </Round>
              <Round label="Dance" onPress={() => game.actions.emote('dance')}>
                <Music size={22} color="#fff" />
              </Round>
            </View>
            {hud.action ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={hud.action}
                onPress={() => {
                  tick();
                  game.actions.use();
                }}
                className="h-[92px] w-[92px] items-center justify-center rounded-full border-2 border-white/80 bg-rose-600/90 px-2 active:bg-rose-700"
              >
                <Text className="text-center font-sans-bold text-[12px] leading-[15px] text-white" numberOfLines={3}>
                  {hud.action}
                </Text>
              </Pressable>
            ) : null}
          </View>
          </View>
        )}
      </View>

      {/* They asked me to do something together. */}
      {hud.invite ? (
        <View className="absolute left-0 right-0 items-center" style={{ top: pad.top + 100 }} pointerEvents="box-none">
          <View className="flex-row items-center gap-3 rounded-full bg-black/70 py-2 pl-4 pr-2">
            <Text className="text-small text-white">{`${game.partnerName}: ${TOGETHER_LABEL[hud.invite].toLowerCase()}?`}</Text>
            <Pressable accessibilityRole="button" onPress={() => game.actions.answer(true)} className="rounded-full bg-rose-600 px-4 py-2">
              <Text className="font-sans-bold text-small text-white">Yes</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => game.actions.answer(false)} className="rounded-full bg-white/15 px-4 py-2">
              <Text className="text-small text-white">Not now</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {panel === 'note' ? <NotePanel game={game} onClose={() => setPanel(null)} /> : null}

      {!ready ? <Opening progress={loading} partner={game.partnerName} partnerIn={!!game.partnerPlace} /> : null}

      {problem ? <Problem error={problem} /> : null}

      {panel === 'look' ? <LookPanel game={game} onClose={() => setPanel(null)} /> : null}
      {panel === 'add' && game.decorate ? (
        <AddPanel
          onAdd={(m) => {
            game.actions.add(m);
            setPanel(null);
          }}
          bottom={pad.bottom}
        />
      ) : null}

      {__DEV__ && fps ? (
        <View className="absolute rounded bg-black/50 px-2 py-0.5" style={{ left: pad.left + 160, bottom: pad.bottom }} pointerEvents="none">
          <Text className="text-[11px] text-white">{`${fps} fps`}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The note on the fridge: theirs to read (and answer), or mine to leave. */
function NotePanel({ game, onClose }: { game: HouseGame; onClose: () => void }) {
  const theirs = game.note?.text && game.note.by !== game.meId ? game.note : null;
  const [writing, setWriting] = useState(!theirs);
  const [text, setText] = useState('');
  useEffect(() => {
    if (theirs) game.readNote();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View className="absolute inset-0 items-center justify-center" pointerEvents="box-none">
      <View className="w-[420px] max-w-[90%] gap-3 rounded-3xl bg-[#FFF6D9] p-5">
        {!writing && theirs ? (
          <>
            <Text className="text-small text-ink-soft">{`From ${game.partnerName}`}</Text>
            <Text className="font-sans-medium text-lead">{theirs.text}</Text>
            <View className="flex-row justify-end gap-2">
              <Pressable accessibilityRole="button" onPress={() => setWriting(true)} className="rounded-full bg-rose-600 px-4 py-2">
                <Text className="font-sans-bold text-small text-white">Write back</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={onClose} className="rounded-full bg-black/10 px-4 py-2">
                <Text className="text-small">Done</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text className="font-sans-bold text-body">{`A note for ${game.partnerName}`}</Text>
            <TextInput
              value={text}
              onChangeText={(t) => setText(t.slice(0, NOTE_MAX))}
              placeholder="They’ll find it on the fridge"
              multiline
              autoFocus
              className="min-h-[90px] rounded-2xl bg-white/70 p-3 font-sans text-body text-ink"
            />
            <View className="flex-row justify-end gap-2">
              <Pressable accessibilityRole="button" onPress={onClose} className="rounded-full bg-black/10 px-4 py-2">
                <Text className="text-small">Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!text.trim()}
                onPress={() => {
                  game.leaveNote(text);
                  onClose();
                }}
                className={text.trim() ? 'rounded-full bg-rose-600 px-4 py-2' : 'rounded-full bg-rose-600/40 px-4 py-2'}
              >
                <Text className="font-sans-bold text-small text-white">Stick it on</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

/** While the house loads: a calm screen instead of a half-built house. */
function Opening({ progress, partner, partnerIn }: { progress: number; partner: string; partnerIn: boolean }) {
  return (
    <Animated.View exiting={FadeOut.duration(450)} className="absolute inset-0" pointerEvents="none">
      <GradientView from="#8FD0EE" to="#2F6F9A" radius={0} className="flex-1 items-center justify-center gap-5">
        <View className="h-24 w-24 items-center justify-center rounded-[28px] bg-white/20">
          <House size={52} color="#fff" strokeWidth={1.6} />
        </View>
        <View className="items-center gap-1.5">
          <Text className="font-sans-bold text-[24px] text-white">Opening our house</Text>
          <Text className="text-small text-white/85">{partnerIn ? `${partner} is already inside` : 'Lighting the rooms, setting the table'}</Text>
        </View>
        <View className="h-2 w-56 overflow-hidden rounded-full bg-white/25">
          <View className="h-full rounded-full bg-white" style={{ width: `${Math.max(6, Math.round(progress * 100))}%` }} />
        </View>
      </GradientView>
    </Animated.View>
  );
}

/** Keeps a failure in the 3D view inside the house screen, so the rest of Us carries on. */
class Catch extends Component<{ onError: (e: Error) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** What went wrong, with enough detail that a screenshot pins it down. */
function Problem({ error }: { error: Error }) {
  const where = (error.stack ?? '').split('\n').slice(0, 4).join('\n');
  return (
    <View className="absolute inset-0 items-center justify-center bg-black/70 px-10">
      <View className="max-w-[560px] gap-3 rounded-3xl bg-paper p-5">
        <Text className="font-sans-bold text-lead">The house hit a problem</Text>
        <Text className="text-small text-ink-soft">The rest of Us is fine. Please send a screenshot of this so it can be fixed.</Text>
        <Text className="font-mono text-[11px] text-ink-soft" selectable>{`${error.message}\n${where}`}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} className="self-start rounded-full bg-rose-600 px-4 py-2.5">
          <Text className="font-sans-bold text-small text-white">Leave the house</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The stick: walk the way it points from where the camera looks. All the way out runs. */
function Joystick({ game, left, bottom }: { game: HouseGame; left: number; bottom: number }) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));
  const { controls } = game;
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .runOnJS(true)
        .onUpdate((e) => {
          const dx = e.translationX;
          const dy = e.translationY;
          const d = Math.hypot(dx, dy);
          const k = d > STICK ? STICK / d : 1;
          x.value = dx * k;
          y.value = dy * k;
          controls.move = [(dx * k) / STICK, (dy * k) / STICK];
        })
        .onFinalize(() => {
          x.value = withSpring(0, { damping: 18 });
          y.value = withSpring(0, { damping: 18 });
          controls.move = [0, 0];
        }),
    [controls, x, y],
  );
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityLabel="Walk. Drag to move, all the way out to run"
        className="absolute items-center justify-center rounded-full border-2 border-white/40 bg-black/20"
        style={{ left, bottom, width: STICK * 2 + 24, height: STICK * 2 + 24 }}
      >
        <Animated.View className="h-16 w-16 rounded-full border-2 border-white/80 bg-white/45" style={knob} />
      </View>
    </GestureDetector>
  );
}

function DecorTools({ game, onAdd }: { game: HouseGame; onAdd: () => void }) {
  const sel = game.hud.selected;
  return (
    <View className="items-end gap-3">
      {sel?.paint ? (
        <View className="flex-row gap-1.5 rounded-full bg-black/35 p-1.5">
          {PAINTS.map((c) => (
            <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Paint ${c}`} onPress={() => game.actions.paint(c)} hitSlop={4} className="h-7 w-7 rounded-full border-2 border-white/80" style={{ backgroundColor: c }} />
          ))}
        </View>
      ) : null}
      <View className="flex-row gap-2">
        {sel ? (
          <>
            <Round label="Turn left" onPress={() => game.actions.rotate(Math.PI / 8)}>
              <RotateCcw size={22} color="#fff" />
            </Round>
            <Round label="Turn right" onPress={() => game.actions.rotate(-Math.PI / 8)}>
              <RotateCw size={22} color="#fff" />
            </Round>
            {sel.added || sel.moved ? (
              <Round label={sel.added ? `Take away the ${sel.label.toLowerCase()}` : `Put the ${sel.label.toLowerCase()} back`} onPress={game.actions.remove}>
                {sel.added ? <Trash2 size={22} color="#fff" /> : <RotateCcw size={18} color="#fff" />}
              </Round>
            ) : null}
            <Round label="Done with this" onPress={game.actions.deselect} on>
              <Check size={22} color="#fff" />
            </Round>
          </>
        ) : null}
        <Round label="Add something" onPress={onAdd}>
          <Plus size={24} color="#fff" />
        </Round>
      </View>
    </View>
  );
}

function AddPanel({ onAdd, bottom }: { onAdd: (m: (typeof ADDABLE)[number]['model']) => void; bottom: number }) {
  return (
    <View className="absolute left-0 right-0 items-center" style={{ bottom: bottom + 84 }} pointerEvents="box-none">
      <ScrollView horizontal contentContainerClassName="gap-2 px-3 py-2" className="max-w-[70%] rounded-2xl bg-black/55">
        {ADDABLE.map((a) => (
          <Pressable key={a.model} accessibilityRole="button" onPress={() => onAdd(a.model)} className="rounded-full bg-white/90 px-3.5 py-2 active:bg-white">
            <Text className="font-sans-medium text-small">{a.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function LookPanel({ game, onClose }: { game: HouseGame; onClose: () => void }) {
  const look = game.look;
  const body = look.body ?? 'f';
  const rows: { key: 'skin' | 'hair' | 'shirt' | 'pants' | 'shoes'; label: string; colors: string[] }[] = [
    { key: 'skin', label: 'Skin', colors: SKINS },
    { key: 'hair', label: 'Hair', colors: HAIRS },
    { key: 'shirt', label: 'Top', colors: SHIRTS },
    { key: 'pants', label: 'Trousers', colors: PANTS },
    { key: 'shoes', label: 'Shoes', colors: SHOES },
  ];
  const chip = (on: boolean) => (on ? 'rounded-full bg-white px-3 py-1.5' : 'rounded-full bg-white/15 px-3 py-1.5');
  const chipText = (on: boolean) => (on ? 'text-small text-ink' : 'text-small text-white');
  return (
    <View className="absolute inset-0 items-center justify-center" pointerEvents="box-none">
      <ScrollView className="max-h-[92%] rounded-3xl bg-black/75" contentContainerClassName="gap-3 p-4">
        <View className="flex-row items-center justify-between gap-6">
          <Text className="font-sans-bold text-white">My look</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={onClose} hitSlop={8}>
            <X size={20} color="#fff" />
          </Pressable>
        </View>
        <View className="flex-row items-center gap-2">
          <Text className="w-20 text-small text-white/80">Body</Text>
          {(['f', 'm'] as const).map((b) => (
            <Pressable key={b} accessibilityRole="button" onPress={() => game.setLook({ body: b, style: b === 'm' ? 'Hair_SimpleParted' : 'Hair_Long', beard: false })} className={chip(body === b)}>
              <Text className={chipText(body === b)}>{b === 'f' ? 'Woman' : 'Man'}</Text>
            </Pressable>
          ))}
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="w-20 text-small text-white/80">Hairstyle</Text>
          {HAIRSTYLES.map((h) => (
            <Pressable key={h} accessibilityRole="button" onPress={() => game.setLook({ style: h })} className={chip(look.style === h)}>
              <Text className={chipText(look.style === h)}>{HAIRSTYLE_LABEL[h]}</Text>
            </Pressable>
          ))}
          {body === 'm' ? (
            <Pressable accessibilityRole="button" onPress={() => game.setLook({ beard: !look.beard })} className={chip(!!look.beard)}>
              <Text className={chipText(!!look.beard)}>Beard</Text>
            </Pressable>
          ) : null}
        </View>
        {rows.map((r) => (
          <View key={r.key} className="flex-row items-center gap-2">
            <Text className="w-20 text-small text-white/80">{r.label}</Text>
            {r.colors.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityLabel={`${r.label} ${c}`}
                onPress={() => game.setLook({ [r.key]: c })}
                className={(look[r.key] ?? (r.key === 'shoes' ? SHOES[0] : '')) === c ? 'h-8 w-8 rounded-full border-[3px] border-white' : 'h-8 w-8 rounded-full border border-white/40'}
                style={{ backgroundColor: c }}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Chip({ text }: { text: string }) {
  return (
    <View className="rounded-full bg-black/35 px-3.5 py-2">
      <Text className="font-sans-medium text-small text-white">{text}</Text>
    </View>
  );
}

function Round({ label, onPress, children, size = 56, on }: { label: string; onPress: () => void; children: ReactNode; size?: number; on?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tick();
        onPress();
      }}
      hitSlop={6}
      className={on ? 'items-center justify-center rounded-full bg-rose-600/90 active:bg-rose-700' : 'items-center justify-center rounded-full bg-black/35 active:bg-black/50'}
      style={{ width: size, height: size }}
    >
      {children}
    </Pressable>
  );
}

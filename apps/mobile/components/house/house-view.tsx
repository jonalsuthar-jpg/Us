import AsyncStorage from '@react-native-async-storage/async-storage';
import { Canvas, events as touchEvents } from '@react-three/fiber/native';
import { ADDABLE, HAIRS, HAIRSTYLE_LABEL, HAIRSTYLES, HouseWorld, orbitBy, PAINTS, PANTS, QUALITIES, SHIRTS, SHOES, SKINS, tapAt, useHouseGame, zoomBy, type HouseGame, type Quality } from '@us/shared/house';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Check, Eye, Gauge, Hand, Heart, House, Moon, Music, Paintbrush, Plus, RotateCcw, RotateCw, Shirt, Sun, Trash2, X } from 'lucide-react-native';
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, PixelRatio, Pressable, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
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
  const { controls, hud } = game;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [quality, setQuality] = useState<Quality | null>(null);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [fps, setFps] = useState(0);
  const [panel, setPanel] = useState<'look' | 'add' | null>(null);
  const [problem, setProblem] = useState<Error | null>(null);
  // The first time in, make yourself first.
  const asked = useRef(false);
  useEffect(() => {
    if (game.needsLook && !asked.current) {
      asked.current = true;
      setPanel('look');
    }
  }, [game.needsLook]);
  const stepped = useRef(false);

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
    (f: number) => {
      setFps(Math.round(f));
      // In the phone's log too (adb logcat), to check how smoothly it runs.
      console.log(`[house] ${Math.round(f)} fps (${quality})`);
      if (stepped.current || !quality) return;
      stepped.current = true;
      if (f < 22 && quality !== 'low') chooseQuality(quality === 'high' ? 'medium' : 'low');
    },
    [quality, chooseQuality],
  );

  // Looking: drag anywhere off the stick and the buttons; pinch to zoom; tap to walk or use.
  const look = useMemo(() => {
    let lastScale = 1;
    const pan = Gesture.Pan()
      .minDistance(6)
      .maxPointers(1)
      .runOnJS(true)
      .onChange((e) => orbitBy(controls, e.changeX, e.changeY, size.w));
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onBegin(() => {
        lastScale = 1;
      })
      .onChange((e) => {
        zoomBy(controls, e.scale / lastScale);
        lastScale = e.scale;
      });
    const tap = Gesture.Tap()
      .maxDistance(10)
      .runOnJS(true)
      .onEnd((e, ok) => {
        if (ok) tapAt(controls, e.x, e.y, size.w, size.h);
      });
    return Gesture.Race(tap, Gesture.Simultaneous(pan, pinch));
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
                frameloop={!active ? 'never' : quality === 'low' ? 'demand' : 'always'}
                camera={{ fov: 55, near: 0.1, far: 200 }}
                events={noEvents}
              >
                <HouseWorld {...game.world} quality={quality} onFps={onFps} houseUrl={houseUrl} onError={setProblem} />
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
        <Round label={game.view === 'close' ? 'See the whole house' : 'Back behind me'} onPress={game.toggleView} size={44}>
          {game.view === 'close' ? <House size={20} color="#fff" /> : <Eye size={20} color="#fff" />}
        </Round>
        <Round label={game.night ? 'Make it day' : 'Make it night'} onPress={game.toggleNight} size={44}>
          {game.night ? <Sun size={20} color="#fff" /> : <Moon size={20} color="#fff" />}
        </Round>
        <Round label={game.decorate ? 'Done decorating' : 'Decorate'} onPress={() => game.setDecorate(!game.decorate)} size={44} on={game.decorate}>
          <Paintbrush size={20} color="#fff" />
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
        )}
      </View>

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

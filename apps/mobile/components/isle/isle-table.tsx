import { Canvas, events as touchEvents } from '@react-three/fiber/native';
import type { Quality } from '@us/shared/house';
import {
  DEV_INFO,
  IDLE,
  cuesFor,
  IsleBoard,
  logLines,
  pickMark,
  RES_INFO,
  RESOURCES,
  settleMode,
  tableView,
  tapBoard,
  type Dev,
  type Hand,
  type IsleAction,
  type IsleBoardApi,
  type IsleSound,
  type IsleState,
  type Mode,
  type Res,
  type SeatView,
  type TableView,
} from '@us/shared/isle';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeftRight,
  Bot,
  Castle,
  Check,
  ChevronLeft,
  Crown,
  Dice5,
  Hourglass,
  House,
  Layers,
  Map as MapIcon,
  Rotate3d,
  Minus,
  Music,
  Plus,
  Route,
  ScrollText,
  Shield,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react-native';
import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, PixelRatio, Pressable, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useIsleArt } from '@/lib/isle-art';
import { GradientView } from '../plan/art';
import { Text } from '../ui/text';

/**
 * Isle's table on a phone, sideways: the board, the four seats down the
 * right, the build bar on the left, my cards along the bottom with the
 * trade, dice and end-turn buttons, and panels over the board for trading,
 * a 7, robbing, playing a card and the end of the game. Drag to look around,
 * pinch to zoom, tap a glowing spot to build there.
 *
 * It only draws a game state and hands moves to onMove (see isle-view.tsx).
 */

export interface IsleTableProps {
  state: IsleState;
  me: number;
  onMove: (a: IsleAction) => string | null;
  botThinking?: number | null;
  quality?: Quality;
  onNewGame?: () => void;
  onExit?: () => void;
  sound?: IsleSound | null;
  /** All sound off. */
  muted?: boolean;
  /** The tune under the waves. */
  music?: boolean;
  onToggleSound?: () => void;
  onToggleMusic?: () => void;
}

const INK = '#3B2A1E';
const CREAM = '#FBEFD5';
const GOLD = '#E8B84A';
const WOOD_FROM = '#6B4527';
const WOOD_TO = '#3F2615';
const DPR: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };

/** Taps reach the board through our gestures, not R3F's raycasting. */
const noEvents: typeof touchEvents = (store) => ({ ...touchEvents(store), enabled: false });
const tick = () => void Haptics.selectionAsync().catch(() => {});

export function IsleTable({
  state,
  me,
  onMove,
  botThinking = null,
  quality = 'medium',
  onNewGame,
  onExit,
  sound = null,
  muted = false,
  music = true,
  onToggleSound,
  onToggleMusic,
}: IsleTableProps) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>(IDLE);
  const live = settleMode(state, me, mode);
  const view = useMemo(() => tableView(state, me, live), [state, me, live]);
  const [problem, setProblem] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [top, setTop] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [broken, setBroken] = useState<Error | null>(null);
  const api = useRef<IsleBoardApi | null>(null);
  const art = useIsleArt();

  useEffect(() => {
    if (live !== mode) setMode(live);
  }, [live, mode]);
  useEffect(() => {
    if (!problem) return;
    const t = setTimeout(() => setProblem(null), 2600);
    return () => clearTimeout(t);
  }, [problem]);
  // A nudge when it becomes my turn (or something's asked of me).
  const asked = !!(view.canRoll || view.discard || view.incoming || (state.phase === 'setup' && view.marks));
  useEffect(() => {
    if (asked) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [asked]);


  // What just happened, heard: each cue at its moment (a roll's chime once the dice land).
  const heard = useRef<IsleState | null>(null);
  const cueTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const cues = cuesFor(heard.current, state, me);
    heard.current = state;
    for (const c of cues) {
      const t = setTimeout(() => {
        cueTimers.current.delete(t);
        sound?.play(c.name, c.volume);
      }, c.at * 1000);
      cueTimers.current.add(t);
    }
  }, [state, me, sound]);
  useEffect(() => {
    const timers = cueTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);
  // The sea all the time, the tune when it's on.
  useEffect(() => {
    if (!sound) return;
    sound.setMaster(muted ? 0 : 1);
    sound.loop('waves', 0.3);
    sound.loop('music', music ? 0.22 : 0);
  }, [sound, muted, music]);

  const move = useCallback(
    (a: IsleAction) => {
      tick();
      sound?.play('click', 0.3);
      // A bug in a move must not close the app (taps run outside any error boundary).
      let why: string | null;
      try {
        why = onMove(a);
      } catch (e) {
        console.warn('[isle] move failed', e);
        why = 'That didn’t work. Try again';
      }
      if (why) setProblem(why);
      return !why;
    },
    [onMove, sound],
  );
  const onReady = useCallback((a: IsleBoardApi) => {
    api.current = a;
  }, []);

  const gestures = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(6)
      .maxPointers(1)
      .runOnJS(true)
      .onChange((e) => api.current?.panBy(e.changeX / Math.max(1, size.h), e.changeY / Math.max(1, size.h)));
    let last = 1;
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => (last = 1))
      .onChange((e) => {
        api.current?.zoomBy(last / e.scale);
        last = e.scale;
      });
    // Two thumbs up the screen tilt towards the top view; down, back to the usual one.
    const tilt = Gesture.Pan()
      .minPointers(2)
      .maxPointers(2)
      .runOnJS(true)
      .onChange((e) => api.current?.tiltBy(-e.changeY / Math.max(1, size.h)));
    const tap = Gesture.Tap()
      .maxDistance(10)
      .runOnJS(true)
      .onEnd((e, ok) => {
        if (!ok || !size.w) return;
        const at = api.current?.pick((e.x / size.w) * 2 - 1, -(e.y / size.h) * 2 + 1);
        if (!at || !view.marks) return;
        const r = tapBoard(state, me, live, pickMark(view.marks, at.x, at.y));
        if (r.action) move(r.action);
        if (r.mode) setMode(r.mode);
      });
    return Gesture.Race(tap, Gesture.Simultaneous(pan, pinch, tilt));
  }, [size, view.marks, state, me, live, move]);

  const scale = Math.min(1, DPR[quality] / PixelRatio.get());
  const pad = { l: Math.max(insets.left, 12), r: Math.max(insets.right, 12), t: Math.max(insets.top, 8), b: Math.max(insets.bottom, 8) };

  return (
    <CardArt.Provider value={art?.cards ?? NO_ART}>
      <View className="flex-1 bg-[#A9D8E8]" onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {size.w > 0 && !broken ? (
          <GestureDetector gesture={gestures}>
            <View className="flex-1 overflow-hidden" collapsable={false}>
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  width: size.w * scale,
                  height: size.h * scale,
                  left: (size.w * (1 - scale)) / 2,
                  top: (size.h * (1 - scale)) / 2,
                  transform: [{ scale: 1 / scale }],
                }}
              >
                <Catch onError={setBroken}>
                  <Canvas shadows={quality !== 'low'} camera={{ fov: 45, near: 0.1, far: 120 }} events={noEvents}>
                    <IsleBoard state={state} marks={view.marks} quality={quality} onReady={onReady} />
                  </Canvas>
                </Catch>
              </View>
            </View>
          </GestureDetector>
        ) : null}
        {broken ? <Problem error={broken} onExit={onExit} /> : null}

        {/* Top: leave, log, what's happening. */}
        <View pointerEvents="box-none" style={{ position: 'absolute', top: pad.t, left: pad.l, right: pad.r }} className="flex-row items-start justify-between">
          <View className="flex-row gap-2">
            {onExit ? (
              <RoundButton label="Leave the table" onPress={onExit}>
                <ChevronLeft size={20} color={CREAM} />
              </RoundButton>
            ) : null}
            <RoundButton label="Game log" onPress={() => setShowLog((v) => !v)} active={showLog}>
              <ScrollText size={18} color={CREAM} />
            </RoundButton>
            <RoundButton label={top ? 'Tilted view' : 'Top view'} onPress={() => setTop(api.current?.toggleTop() === 'top')} active={top}>
              {top ? <Rotate3d size={18} color={CREAM} /> : <MapIcon size={18} color={CREAM} />}
            </RoundButton>
            {onToggleSound ? (
              <RoundButton label={muted ? 'Sound on' : 'Sound off'} onPress={onToggleSound}>
                {muted ? <VolumeX size={18} color={CREAM} /> : <Volume2 size={18} color={CREAM} />}
              </RoundButton>
            ) : null}
            {onToggleMusic && !muted ? (
              <RoundButton label={music ? 'Music off' : 'Music on'} onPress={onToggleMusic} active={music}>
                <Music size={17} color={music ? CREAM : 'rgba(251,239,213,0.4)'} />
              </RoundButton>
            ) : null}
          </View>
          <Prompt view={view} thinking={botThinking != null ? state.players[botThinking]!.name : null} />
          <View style={{ width: 172 }} />
        </View>

        <View pointerEvents="none" style={{ position: 'absolute', top: pad.t, right: pad.r, width: 172 }} className="gap-1.5">
          {view.seats.map((s) => (
            <SeatPanel key={s.seat} s={s} thinking={botThinking === s.seat} />
          ))}
        </View>

        {showLog ? <Log state={state} me={me} top={pad.t + 48} left={pad.l} onClose={() => setShowLog(false)} /> : null}

        {/* Bottom: build bar, hand, actions. */}
        <View pointerEvents="box-none" style={{ position: 'absolute', bottom: pad.b, left: pad.l, right: pad.r }} className="flex-row items-end justify-between">
          <BuildBar
            view={view}
            mode={live}
            onPick={(what) => {
              if (what === 'dev') move({ t: 'buy' });
              else {
                tick();
                setMode(live.k === 'build' && live.what === what ? IDLE : { k: 'build', what });
              }
            }}
          />
          <HandRow
            view={view}
            onPlay={(card) => {
              if (card === 'knight') move({ t: 'knight' });
              else if (card === 'roads') move({ t: 'roads' });
              else if (card === 'plenty') setMode({ k: 'plenty' });
              else if (card === 'monopoly') setMode({ k: 'monopoly' });
            }}
          />
          <Actions
            view={view}
            trading={live.k === 'trade'}
            onRoll={() => move({ t: 'roll' })}
            onEnd={() => move({ t: 'end' })}
            onTrade={() => {
              tick();
              setMode(live.k === 'trade' ? IDLE : { k: 'trade' });
            }}
          />
        </View>

        {view.discard > 0 ? <DiscardPanel hand={view.hand} owed={view.discard} onDone={(cards) => move({ t: 'discard', cards })} /> : null}
        {live.k === 'steal' ? (
          <StealPanel view={view} from={live.from} onPick={(from) => move({ t: 'robber', h: live.h, from }) && setMode(IDLE)} onCancel={() => setMode(IDLE)} />
        ) : null}
        {live.k === 'plenty' ? (
          <PickPanel
            title={DEV_INFO.plenty.label}
            text="Choose two cards from the bank."
            count={2}
            onCancel={() => setMode(IDLE)}
            onDone={([a, b]) => move({ t: 'plenty', a: a!, b: b! }) && setMode(IDLE)}
          />
        ) : null}
        {live.k === 'monopoly' ? (
          <PickPanel
            title={DEV_INFO.monopoly.label}
            text="Name a card. Everyone gives you all of theirs."
            count={1}
            onCancel={() => setMode(IDLE)}
            onDone={([r]) => move({ t: 'monopoly', r: r! }) && setMode(IDLE)}
          />
        ) : null}
        {live.k === 'trade' || view.outgoing ? (
          <TradePanel state={state} view={view} onMove={move} onClose={() => (view.outgoing ? move({ t: 'cancel' }) : setMode(IDLE))} />
        ) : null}
        {view.incoming ? <Incoming state={state} view={view} top={pad.t + 44} onAnswer={(yes) => move({ t: 'reply', yes })} /> : null}
        {view.over ? <Results state={state} view={view} onNewGame={onNewGame} onExit={onExit} /> : null}

        <GainChips state={state} me={me} bottom={pad.b + 110} />

        {problem ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} pointerEvents="none" style={{ position: 'absolute', top: pad.t + 50, alignSelf: 'center' }} className="rounded-full bg-[#2A1A10]/90 px-4 py-2">
            <Text className="font-sans-bold text-[13px]" style={{ color: CREAM }}>
              {problem}
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </CardArt.Provider>
  );
}

// ---- Small pieces --------------------------------------------------------------------

/** The card pictures (lib/isle-art.ts), once they're on the phone; cards show their colour until then. */
const NO_ART: Record<string, string> = {};
const CardArt = createContext<Record<string, string>>(NO_ART);

/** Dark wood with a gold hairline just inside its edge. */
function Wood({ children, radius = 16, className, style }: { children: ReactNode; radius?: number; className?: string; style?: object }) {
  return (
    <View style={[{ borderRadius: radius, borderWidth: 1, borderColor: '#2A180B', overflow: 'hidden' }, style]}>
      <GradientView from={WOOD_FROM} to={WOOD_TO} radius={radius} className={className}>
        <View pointerEvents="none" style={{ position: 'absolute', left: 1, right: 1, top: 1, bottom: 1, borderRadius: radius - 1, borderWidth: 1, borderColor: 'rgba(232,184,74,0.35)' }} />
        {children}
      </GradientView>
    </View>
  );
}

export function ResIcon({ r, size = 20, color = '#fff' }: { r: Res; size?: number; color?: string }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path d={RES_INFO[r].icon} fill={color} />
    </Svg>
  );
}

function RoundButton({ label, onPress, children, active }: { label: string; onPress: () => void; children: ReactNode; active?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [pressed && { transform: [{ scale: 0.94 }] }]}>
      <Wood radius={20} className="h-10 w-10 items-center justify-center" style={active ? { borderColor: GOLD, borderWidth: 2 } : undefined}>
        {children}
      </Wood>
    </Pressable>
  );
}

/** A gold coin with a count, pinned to a card's corner. */
function Coin({ n, small }: { n: number; small?: boolean }) {
  const d = small ? 18 : 22;
  return (
    <View style={{ position: 'absolute', right: -6, top: -6, minWidth: d, height: d, borderRadius: d / 2, borderWidth: 2, borderColor: '#FFF3CF', overflow: 'hidden' }}>
      <GradientView from="#FCE39A" to="#B57E1E" radius={d / 2} className="flex-1 items-center justify-center px-1">
        <Text className="font-sans-bold" style={{ color: INK, fontSize: small ? 10 : 12 }}>
          {n}
        </Text>
      </GradientView>
    </View>
  );
}

/** A card: its picture in a cream-and-gold frame, its name on a band of its colour. */
function ArtCard({
  art,
  fallback,
  label,
  band,
  n,
  dim,
  small,
  onPress,
  picked,
  glow,
  disabled,
  a11y,
}: {
  art: string;
  fallback: string;
  label: string;
  band: string;
  n?: number;
  dim?: boolean;
  small?: boolean;
  onPress?: () => void;
  picked?: boolean;
  glow?: boolean;
  disabled?: boolean;
  a11y?: string;
}) {
  const pictures = useContext(CardArt);
  const uri = pictures[art];
  const w = small ? 42 : 52;
  const h = small ? 58 : 72;
  const card = (
    <View style={{ width: w, height: h, opacity: dim ? 0.4 : 1, transform: [{ translateY: picked ? -6 : 0 }] }}>
      <GradientView from="#FFF6DD" to="#D9B979" radius={8} className="flex-1 p-[2px]" style={glow || picked ? { borderWidth: 1.5, borderColor: GOLD } : undefined}>
        <View style={{ flex: 1, borderRadius: 6, overflow: 'hidden', backgroundColor: fallback, borderWidth: 0.5, borderColor: 'rgba(169,129,66,0.8)' }}>
          {uri ? <Image source={{ uri }} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} resizeMode="cover" /> : null}
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: band, paddingTop: 1, paddingBottom: 2 }} className="items-center">
            <Text className="font-display-italic text-white" style={{ fontSize: small ? 8 : 9.5 }} numberOfLines={1}>
              {label}
            </Text>
          </View>
        </View>
      </GradientView>
      {n != null && n > 0 ? <Coin n={n} small={small} /> : null}
    </View>
  );
  if (!onPress) return card;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} onPress={onPress} disabled={disabled} style={({ pressed }) => [pressed && { transform: [{ scale: 0.94 }] }]}>
      {card}
    </Pressable>
  );
}

function ResCard({ r, n, dim, small, onPress, picked }: { r: Res; n?: number; dim?: boolean; small?: boolean; onPress?: () => void; picked?: boolean }) {
  const info = RES_INFO[r];
  return <ArtCard art={`card_${r}`} fallback={info.color} label={info.label} band={info.dark} n={n} dim={dim} small={small} onPress={onPress} picked={picked} />;
}

/** What something costs: a little picture of each card it takes. */
function Cost({ cost, size = 11 }: { cost: Partial<Hand>; size?: number }) {
  const pictures = useContext(CardArt);
  return (
    <View className="flex-row gap-[2px]">
      {RESOURCES.flatMap((r) =>
        Array.from({ length: cost[r] ?? 0 }, (_, i) => {
          const uri = pictures[`card_${r}`];
          return (
            <View key={`${r}${i}`} style={{ width: size + 2, height: size + 8, borderRadius: 2, overflow: 'hidden', backgroundColor: RES_INFO[r].color, borderWidth: 0.5, borderColor: '#F1DDAE' }}>
              {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
            </View>
          );
        }),
      )}
    </View>
  );
}

function Dots({ color = CREAM }: { color?: string }) {
  return (
    <View className="ml-1 flex-row gap-0.5">
      {[0, 1, 2].map((i) => (
        <Animated.View key={i} entering={FadeIn.delay(i * 150)} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />
      ))}
    </View>
  );
}

function Prompt({ view, thinking }: { view: TableView; thinking: string | null }) {
  const mine = !!(view.marks || view.canRoll || view.canEnd || view.discard > 0 || view.incoming);
  return (
    <View pointerEvents="none" className="mt-1" style={{ borderRadius: 9, borderWidth: 1.5, borderColor: mine ? '#8A6420' : '#2A180B', overflow: 'hidden' }}>
      <GradientView from={mine ? '#FCE6A2' : '#4A2E18'} to={mine ? '#E3B24A' : '#2E1C0E'} radius={8} className="flex-row items-center gap-1.5 px-4 py-1.5">
        {thinking ? <Bot size={14} color={mine ? INK : CREAM} /> : null}
        <Text className="font-sans-bold text-[13px]" style={{ color: mine ? INK : CREAM }}>
          {view.prompt}
        </Text>
        {thinking ? <Dots color={mine ? INK : CREAM} /> : null}
      </GradientView>
    </View>
  );
}

// ---- Seats -----------------------------------------------------------------------------

function SeatPanel({ s, thinking }: { s: SeatView; thinking: boolean }) {
  return (
    <Wood radius={12} className="flex-row items-center gap-2 py-1.5 pl-1.5 pr-2" style={s.turn ? { borderColor: GOLD, borderWidth: 2, transform: [{ translateX: -4 }] } : undefined}>
      {/* A medallion in their colour with a gold rim. */}
      <View style={{ width: 30, height: 30, borderRadius: 15, overflow: 'hidden' }}>
        <GradientView from="#F6DE9C" to="#8A6420" radius={15} className="flex-1 items-center justify-center">
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: s.color }} className="items-center justify-center">
            {s.bot ? (
              <Bot size={14} color={s.color === '#EFE8D8' ? INK : '#fff'} />
            ) : (
              <Text className="font-sans-bold text-[13px]" style={{ color: s.color === '#EFE8D8' ? INK : '#fff' }}>
                {s.real.slice(0, 1).toUpperCase()}
              </Text>
            )}
          </View>
        </GradientView>
      </View>
      <View className="flex-1">
        <View className="flex-row items-center">
          <Text className="font-sans-bold text-[12px]" style={{ color: CREAM }} numberOfLines={1}>
            {s.name}
          </Text>
          {thinking ? <Dots /> : null}
        </View>
        <View className="flex-row items-center gap-1.5">
          <Mini icon={<Layers size={9} color={s.cards > 7 ? '#FF9B7A' : CREAM} />} n={s.cards} hot={s.cards > 7} />
          <Mini icon={<Sparkles size={9} color={CREAM} />} n={s.dev} />
          <Mini icon={<Shield size={9} color={s.army ? GOLD : CREAM} />} n={s.knights} gold={s.army} />
          <Mini icon={<Route size={9} color={s.longest ? GOLD : CREAM} />} n={s.road} gold={s.longest} />
        </View>
      </View>
      {/* Points on a gold-rimmed badge. */}
      <View style={{ width: 28, height: 28, borderRadius: 6, overflow: 'hidden' }}>
        <GradientView from="#F6DE9C" to="#9A6E22" radius={6} className="flex-1 items-center justify-center p-[2px]">
          <View style={{ flex: 1, alignSelf: 'stretch', borderRadius: 4, backgroundColor: '#2E1C0E' }} className="items-center justify-center">
            <Text className="font-sans-bold text-[15px]" style={{ color: '#F4D27A' }}>
              {s.points}
            </Text>
          </View>
        </GradientView>
      </View>
    </Wood>
  );
}

function Mini({ icon, n, hot, gold }: { icon: ReactNode; n: number; hot?: boolean; gold?: boolean }) {
  return (
    <View className="flex-row items-center gap-0.5">
      {icon}
      <Text className="text-[9px]" style={{ color: hot ? '#FF9B7A' : gold ? GOLD : 'rgba(251,239,213,0.8)' }}>
        {n}
      </Text>
    </View>
  );
}

// ---- Build bar, hand, actions ---------------------------------------------------------------

const BUILD_ICON = { road: Route, settle: House, city: Castle, dev: Sparkles } as const;

function BuildBar({ view, mode, onPick }: { view: TableView; mode: Mode; onPick: (what: 'road' | 'settle' | 'city' | 'dev') => void }) {
  return (
    <Wood radius={14} className="gap-1 p-1.5">
      {view.build.map((b) => {
        const Icon = BUILD_ICON[b.what];
        const on = mode.k === 'build' && mode.what === b.what;
        return (
          <Pressable
            key={b.what}
            accessibilityRole="button"
            accessibilityLabel={`Build a ${b.label.toLowerCase()}`}
            disabled={!b.ok}
            onPress={() => onPick(b.what)}
            className="flex-row items-center gap-1.5 rounded-[10px] px-1.5 py-1"
            style={{ backgroundColor: on ? GOLD : b.ok ? 'rgba(255,255,255,0.1)' : 'transparent', opacity: b.ok ? 1 : 0.45 }}
          >
            <Icon size={15} color={on ? INK : CREAM} />
            <Cost cost={b.cost} size={10} />
          </Pressable>
        );
      })}
    </Wood>
  );
}

function HandRow({ view, onPlay }: { view: TableView; onPlay: (card: Dev) => void }) {
  const held = RESOURCES.filter((r) => view.hand[r] > 0);
  return (
    <View className="flex-row items-end gap-2">
      <Wood radius={16} className="min-h-[92px] flex-row items-end gap-2 px-2.5 pb-2 pt-3">
        {held.length ? (
          held.map((r) => (
            <View key={r}>
              {/* The stack behind: deeper the more of them there are. */}
              {Array.from({ length: Math.min(3, view.hand[r] - 1) }, (_, i) => (
                <View
                  key={i}
                  style={{ position: 'absolute', width: 52, height: 72, borderRadius: 8, backgroundColor: '#E2C78E', borderWidth: 0.5, borderColor: '#A98142', left: (i + 1) * 3, top: -(i + 1) * 2.5, transform: [{ rotate: `${(i + 1) * 2.5}deg` }] }}
                />
              ))}
              <ResCard r={r} n={view.hand[r]} />
            </View>
          ))
        ) : (
          <View style={{ width: 150, height: 72, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(241,221,174,0.3)' }} className="items-center justify-center">
            <Text className="font-display-italic text-[12px]" style={{ color: 'rgba(251,239,213,0.55)' }}>
              No cards yet
            </Text>
          </View>
        )}
      </Wood>
      {view.dev.length ? (
        <Wood radius={16} className="flex-row items-end gap-2 px-2.5 pb-2 pt-3">
          {view.dev.map((d) => (
            <ArtCard
              key={d.card}
              art={`dev_${d.card}`}
              fallback="#6C4BA8"
              label={DEV_INFO[d.card].label}
              band="#4B2E78"
              n={d.ready + d.fresh}
              onPress={() => onPlay(d.card)}
              disabled={!d.playable}
              dim={!d.playable && d.card !== 'vp'}
              glow={d.playable}
              a11y={`${DEV_INFO[d.card].label}: ${DEV_INFO[d.card].text}`}
            />
          ))}
        </Wood>
      ) : null}
    </View>
  );
}

/** A round wooden button with a gold rim, like a turned medallion. */
function Medallion({
  label,
  text,
  onPress,
  disabled,
  big,
  tone = 'wood',
  active,
  children,
}: {
  label: string;
  text: string;
  onPress: () => void;
  disabled?: boolean;
  big?: boolean;
  tone?: 'wood' | 'gold' | 'green';
  active?: boolean;
  children: ReactNode;
}) {
  const d = big ? 66 : 48;
  const face = { wood: ['#8A5C35', '#3A2313'], gold: ['#FCE39A', '#A8721A'], green: ['#8DC77E', '#2C5A25'] }[tone];
  const ink = tone === 'gold' ? INK : tone === 'green' ? '#fff' : CREAM;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} style={({ pressed }) => [{ opacity: disabled ? 0.4 : 1 }, pressed && { transform: [{ scale: 0.94 }] }]}>
      <View style={{ width: d, height: d, borderRadius: d / 2, overflow: 'hidden', borderWidth: active ? 2 : 0, borderColor: '#FFF3CF' }}>
        <GradientView from="#F6DE9C" to="#8A6420" radius={d / 2} className="flex-1 p-[3px]">
          <View style={{ flex: 1, borderRadius: d / 2, overflow: 'hidden' }}>
            <GradientView from={face[0]!} to={face[1]!} radius={d / 2} className="flex-1 items-center justify-center">
              {children}
              <Text className="font-sans-bold" style={{ color: ink, fontSize: big ? 9.5 : 8 }}>
                {text}
              </Text>
            </GradientView>
          </View>
        </GradientView>
      </View>
    </Pressable>
  );
}

function Actions({ view, trading, onRoll, onEnd, onTrade }: { view: TableView; trading: boolean; onRoll: () => void; onEnd: () => void; onTrade: () => void }) {
  return (
    <View className="flex-row items-end gap-2">
      <Medallion label="Trade" text="Trade" onPress={onTrade} disabled={!view.canTrade} active={trading}>
        <ArrowLeftRight size={17} color={CREAM} />
      </Medallion>
      {view.canRoll ? (
        <Animated.View entering={ZoomIn}>
          <Medallion label="Roll the dice" text="Roll" onPress={onRoll} big tone="gold">
            <Dice5 size={26} color={INK} />
          </Medallion>
        </Animated.View>
      ) : (
        <Medallion label="End your turn" text="End turn" onPress={onEnd} disabled={!view.canEnd} big tone={view.canEnd ? 'green' : 'wood'}>
          <Hourglass size={21} color={view.canEnd ? '#fff' : CREAM} />
        </Medallion>
      )}
    </View>
  );
}

// ---- Panels ----------------------------------------------------------------------------------

function Panel({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.28)' }} className="items-center justify-center p-3">
      <View style={{ width: wide ? 520 : 380, maxHeight: '96%', borderRadius: 20, borderWidth: 1, borderColor: '#C9A66B', overflow: 'hidden' }}>
        <GradientView from="#FBF0D6" to="#EED9AE" radius={20} className="p-4">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="font-sans-bold text-[18px]" style={{ color: INK }}>
              {title}
            </Text>
            {onClose ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} className="rounded-full p-1">
                <X size={18} color={INK} />
              </Pressable>
            ) : null}
          </View>
          <ScrollView bounces={false}>{children}</ScrollView>
        </GradientView>
      </View>
    </Animated.View>
  );
}

function GoldButton({ children, onPress, disabled, label }: { children: ReactNode; onPress: () => void; disabled?: boolean; label: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} style={({ pressed }) => [{ opacity: disabled ? 0.4 : 1 }, pressed && { transform: [{ scale: 0.96 }] }]}>
      <View style={{ borderRadius: 22, borderWidth: 2, borderColor: '#FFF6E0', overflow: 'hidden' }}>
        <GradientView from="#F6CF62" to="#C88E1E" radius={22} className="flex-row items-center justify-center gap-1.5 px-4 py-2">
          {children}
        </GradientView>
      </View>
    </Pressable>
  );
}

function PlainButton({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="rounded-full border-2 border-[#8A5E36] px-4 py-2">
      <Text className="font-sans-bold text-[13px] text-[#5A3A22]">{text}</Text>
    </Pressable>
  );
}

function Counter({ value, onChange, max }: { value: Partial<Hand>; onChange: (h: Partial<Hand>) => void; max?: Hand }) {
  return (
    <View className="flex-row gap-2">
      {RESOURCES.map((r) => {
        const n = value[r] ?? 0;
        const top = max ? max[r] : 19;
        return (
          <View key={r} className="items-center gap-1">
            <ResCard r={r} n={n} small dim={max ? !max[r] : false} onPress={n < top ? () => (tick(), onChange({ ...value, [r]: n + 1 })) : undefined} />
            <Pressable accessibilityRole="button" accessibilityLabel={`One less ${RES_INFO[r].label}`} disabled={!n} onPress={() => onChange({ ...value, [r]: n - 1 })} className="rounded-full bg-black/10 p-0.5" style={{ opacity: n ? 1 : 0.3 }}>
              <Minus size={12} color={INK} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const count = (h: Partial<Hand>) => RESOURCES.reduce((n, r) => n + (h[r] ?? 0), 0);

function DiscardPanel({ hand, owed, onDone }: { hand: Hand; owed: number; onDone: (cards: Partial<Hand>) => void }) {
  const [pick, setPick] = useState<Partial<Hand>>({});
  const n = count(pick);
  return (
    <Panel title="A 7 was rolled">
      <Text className="mb-2 text-[13px]" style={{ color: INK }}>
        You have more than 7 cards. Choose {owed} to give back ({n} of {owed}).
      </Text>
      <Counter value={pick} onChange={(h) => count(h) <= owed && setPick(h)} max={hand} />
      <View className="mt-3 flex-row justify-end">
        <GoldButton label={`Give back ${owed}`} disabled={n !== owed} onPress={() => onDone(pick)}>
          <Text className="font-sans-bold text-[14px]" style={{ color: INK }}>
            Give back {owed}
          </Text>
        </GoldButton>
      </View>
    </Panel>
  );
}

function StealPanel({ view, from, onPick, onCancel }: { view: TableView; from: number[]; onPick: (p: number) => void; onCancel: () => void }) {
  return (
    <Panel title="Take a card from…" onClose={onCancel}>
      <View className="gap-2">
        {from.map((p) => {
          const s = view.seats[p]!;
          return (
            <Pressable key={p} accessibilityRole="button" onPress={() => onPick(p)} className="flex-row items-center gap-3 rounded-[12px] bg-white/60 p-2">
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: s.color, borderWidth: 2, borderColor: '#fff' }} />
              <Text className="flex-1 font-sans-bold text-[14px]" style={{ color: INK }}>
                {s.name}
              </Text>
              <Text className="text-[12px]" style={{ color: INK }}>
                {s.cards} cards
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Panel>
  );
}

function PickPanel({ title, text, count: n, onDone, onCancel }: { title: string; text: string; count: number; onDone: (r: Res[]) => void; onCancel: () => void }) {
  const [pick, setPick] = useState<Res[]>([]);
  return (
    <Panel title={title} onClose={onCancel}>
      <Text className="mb-2 text-[13px]" style={{ color: INK }}>
        {text}
      </Text>
      <View className="flex-row gap-2">
        {RESOURCES.map((r) => (
          <ResCard key={r} r={r} n={pick.filter((x) => x === r).length} picked={pick.includes(r)} onPress={() => (tick(), setPick((p) => (p.length >= n ? [...p.slice(1), r] : [...p, r])))} />
        ))}
      </View>
      <View className="mt-3 flex-row justify-end">
        <GoldButton label="Play card" disabled={pick.length !== n} onPress={() => onDone(pick)}>
          <Text className="font-sans-bold text-[14px]" style={{ color: INK }}>
            Play card
          </Text>
        </GoldButton>
      </View>
    </Panel>
  );
}

function Cards({ h }: { h: Partial<Hand> }) {
  return (
    <View className="flex-row gap-1.5">
      {RESOURCES.filter((r) => h[r]).map((r) => (
        <ResCard key={r} r={r} n={h[r]} small />
      ))}
    </View>
  );
}

function TradePanel({ state, view, onMove, onClose }: { state: IsleState; view: TableView; onMove: (a: IsleAction) => boolean; onClose: () => void }) {
  const [give, setGive] = useState<Partial<Hand>>({});
  const [want, setWant] = useState<Partial<Hand>>({});
  const out = view.outgoing;
  if (out) {
    return (
      <Panel title="Your offer" onClose={onClose}>
        <View className="flex-row items-center justify-center gap-3">
          <Cards h={out.give} />
          <ArrowLeftRight size={18} color="#8A5E36" />
          <Cards h={out.want} />
        </View>
        <View className="mt-3 gap-1.5">
          {view.seats
            .filter((s) => !s.you)
            .map((s) => {
              const r = out.replies[s.seat];
              return (
                <View key={s.seat} className="flex-row items-center gap-2 rounded-[12px] bg-white/60 p-2">
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: s.color, borderWidth: 2, borderColor: '#fff' }} />
                  <Text className="flex-1 font-sans-bold text-[13px]" style={{ color: INK }}>
                    {s.name}
                  </Text>
                  {r === null ? (
                    <Text className="text-[12px] text-black/50">thinking…</Text>
                  ) : r ? (
                    <GoldButton label={`Trade with ${s.name}`} onPress={() => onMove({ t: 'accept', with: s.seat })}>
                      <Check size={14} color={INK} />
                      <Text className="font-sans-bold text-[13px]" style={{ color: INK }}>
                        Trade
                      </Text>
                    </GoldButton>
                  ) : (
                    <Text className="text-[12px] text-black/50">No thanks</Text>
                  )}
                </View>
              );
            })}
        </View>
        <View className="mt-3 flex-row justify-end">
          <PlainButton text="Take the offer back" onPress={onClose} />
        </View>
      </Panel>
    );
  }
  const bankGive = RESOURCES.find((r) => (give[r] ?? 0) > 0 && count(give) === view.rates[r] && give[r] === view.rates[r]);
  const bankWant = count(want) === 1 ? RESOURCES.find((r) => want[r]) : undefined;
  const bankOk = !!bankGive && !!bankWant && bankGive !== bankWant && state.bank[bankWant] > 0;
  return (
    <Panel title="Trade" onClose={onClose} wide>
      <Text className="mb-1 font-sans-bold text-[11px] uppercase text-black/50">You give</Text>
      <Counter value={give} onChange={setGive} max={view.hand} />
      <Text className="mb-1 mt-2 font-sans-bold text-[11px] uppercase text-black/50">You get</Text>
      <Counter value={want} onChange={setWant} />
      <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
        <Text className="text-[11px] text-black/60">Bank:</Text>
        {RESOURCES.map((r) => (
          <View key={r} className="flex-row items-center gap-1 rounded-full bg-white/60 px-1.5 py-0.5">
            <ResIcon r={r} size={11} color={RES_INFO[r].dark} />
            <Text className="text-[11px]" style={{ color: INK }}>
              {view.rates[r]}:1
            </Text>
          </View>
        ))}
      </View>
      <View className="mt-3 flex-row items-center justify-end gap-2">
        <Pressable
          accessibilityRole="button"
          disabled={!bankOk}
          onPress={() => bankGive && bankWant && onMove({ t: 'bank', give: bankGive, get: bankWant }) && (setGive({}), setWant({}))}
          className="rounded-full border-2 border-[#8A5E36] px-3 py-2"
          style={{ opacity: bankOk ? 1 : 0.35 }}
        >
          <Text className="font-sans-bold text-[13px] text-[#5A3A22]">With the bank</Text>
        </Pressable>
        <GoldButton label="Offer to everyone" disabled={!count(give) || !count(want)} onPress={() => onMove({ t: 'offer', give, want })}>
          <ArrowLeftRight size={14} color={INK} />
          <Text className="font-sans-bold text-[13px]" style={{ color: INK }}>
            Offer to everyone
          </Text>
        </GoldButton>
      </View>
    </Panel>
  );
}

function Incoming({ state, view, top, onAnswer }: { state: IsleState; view: TableView; top: number; onAnswer: (yes: boolean) => void }) {
  const o = view.incoming!;
  return (
    <Animated.View entering={FadeInDown} style={{ position: 'absolute', top, alignSelf: 'center', width: 360, borderRadius: 18, borderWidth: 1, borderColor: '#C9A66B', overflow: 'hidden' }}>
      <GradientView from="#FBF0D6" to="#EED9AE" radius={18} className="p-3">
        <Text className="mb-1.5 text-center font-sans-bold text-[14px]" style={{ color: INK }}>
          {state.players[o.from]!.name} offers a trade
        </Text>
        <View className="flex-row items-center justify-center gap-3">
          <View className="items-center gap-1">
            <Text className="text-[10px] uppercase text-black/50">You get</Text>
            <Cards h={o.give} />
          </View>
          <ArrowLeftRight size={18} color="#8A5E36" />
          <View className="items-center gap-1">
            <Text className="text-[10px] uppercase text-black/50">You give</Text>
            <Cards h={o.want} />
          </View>
        </View>
        <View className="mt-2.5 flex-row justify-center gap-2">
          <PlainButton text="No thanks" onPress={() => onAnswer(false)} />
          <GoldButton label="Accept" disabled={!o.canAccept} onPress={() => onAnswer(true)}>
            <Check size={14} color={INK} />
            <Text className="font-sans-bold text-[13px]" style={{ color: INK }}>
              Accept
            </Text>
          </GoldButton>
        </View>
      </GradientView>
    </Animated.View>
  );
}

function Results({ state, view, onNewGame, onExit }: { state: IsleState; view: TableView; onNewGame?: () => void; onExit?: () => void }) {
  const order = [...view.seats].sort((a, b) => b.points - a.points);
  const won = view.winner === view.me;
  return (
    <Panel title={won ? 'You won the island!' : `${view.seats[view.winner!]!.name} won`} wide>
      <View className="flex-row items-center gap-2">
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: GOLD }} className="items-center justify-center">
          {won ? <Trophy size={22} color={INK} /> : <Crown size={22} color={INK} />}
        </View>
        <Text className="text-[13px] text-black/60">After {Math.ceil(state.turnNo / 4)} rounds</Text>
      </View>
      <View className="mt-3 gap-1.5">
        {order.map((s, i) => (
          <View key={s.seat} className="flex-row items-center gap-2 rounded-[12px] p-2" style={{ backgroundColor: i === 0 ? 'rgba(246,207,98,0.5)' : 'rgba(255,255,255,0.5)' }}>
            <Text className="w-4 text-center font-sans-bold text-[15px]" style={{ color: INK }}>
              {i + 1}
            </Text>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: s.color, borderWidth: 2, borderColor: '#fff' }} />
            <Text className="flex-1 font-sans-bold text-[14px]" style={{ color: INK }}>
              {s.name}
            </Text>
            <Text className="text-[11px] text-black/50">{state.players[s.seat]!.got} cards</Text>
            <Text className="w-8 text-right font-sans-bold text-[17px]" style={{ color: INK }}>
              {s.points}
            </Text>
          </View>
        ))}
      </View>
      <View className="mt-4 flex-row justify-end gap-2">
        {onExit ? <PlainButton text="Leave" onPress={onExit} /> : null}
        {onNewGame ? (
          <GoldButton label="Play again" onPress={onNewGame}>
            <Plus size={14} color={INK} />
            <Text className="font-sans-bold text-[14px]" style={{ color: INK }}>
              Play again
            </Text>
          </GoldButton>
        ) : null}
      </View>
    </Panel>
  );
}

function Log({ state, me, top, left, onClose }: { state: IsleState; me: number; top: number; left: number; onClose: () => void }) {
  const lines = logLines(state, me).slice(-12);
  const colors = tableView(state, me).seats.map((s) => s.color);
  return (
    <Animated.View entering={FadeIn.duration(150)} style={{ position: 'absolute', top, left, width: 250 }}>
      <Wood radius={14} className="p-2.5">
        <View className="mb-1 flex-row items-center justify-between">
          <Text className="font-sans-bold text-[10px] uppercase" style={{ color: 'rgba(251,239,213,0.6)' }}>
            Game log
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close the log" onPress={onClose}>
            <X size={14} color={CREAM} />
          </Pressable>
        </View>
        {lines.map((l) => (
          <View key={l.n} className="flex-row items-start gap-1.5 py-0.5">
            <View style={{ marginTop: 5, width: 6, height: 6, borderRadius: 3, backgroundColor: l.p != null ? colors[l.p] : GOLD }} />
            <Text className="flex-1 text-[11px]" style={{ color: CREAM }}>
              {l.text}
            </Text>
          </View>
        ))}
      </Wood>
    </Animated.View>
  );
}

function GainChips({ state, me, bottom }: { state: IsleState; me: number; bottom: number }) {
  const seen = useRef(state.n);
  const [chips, setChips] = useState<{ id: string; r: Res; n: number }[]>([]);
  useEffect(() => {
    const first = state.n - state.log.length + 1;
    const fresh = state.log.filter((e, i) => first + i > seen.current && e.k === 'gain' && e.p === me);
    seen.current = state.n;
    if (!fresh.length) return;
    const add = fresh.flatMap((e, i) => (e.k === 'gain' ? RESOURCES.filter((r) => e.cards[r]).map((r) => ({ id: `${state.n}-${i}-${r}`, r, n: e.cards[r]! })) : []));
    setChips((c) => [...c, ...add]);
    const t = setTimeout(() => setChips((c) => c.filter((x) => !add.includes(x))), 1800);
    return () => clearTimeout(t);
  }, [state, me]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', bottom, alignSelf: 'center' }} className="flex-row gap-1.5">
      {chips.map((c) => (
        <Animated.View key={c.id} entering={FadeInDown.springify()} exiting={FadeOut} className="flex-row items-center gap-1 rounded-full px-2 py-1" style={{ backgroundColor: RES_INFO[c.r].color, borderWidth: 2, borderColor: '#fff' }}>
          <Text className="font-sans-bold text-[13px] text-white">+{c.n}</Text>
          <ResIcon r={c.r} size={14} />
        </Animated.View>
      ))}
    </View>
  );
}

/** Keeps a failure in the 3D board inside this screen. */
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

function Problem({ error, onExit }: { error: Error; onExit?: () => void }) {
  const where = (error.stack ?? '').split('\n').slice(0, 4).join('\n');
  return (
    <View className="absolute inset-0 items-center justify-center bg-black/70 px-10">
      <View className="max-w-[560px] gap-3 rounded-3xl bg-paper p-5">
        <Text className="font-sans-bold text-lead">The island hit a problem</Text>
        <Text className="text-small text-ink-soft">The rest of Us is fine. Please send a screenshot of this so it can be fixed.</Text>
        <Text className="font-mono text-[11px] text-ink-soft" selectable>{`${error.message}\n${where}`}</Text>
        {onExit ? (
          <Pressable accessibilityRole="button" onPress={onExit} className="self-start rounded-full bg-rose-600 px-4 py-2.5">
            <Text className="font-sans-bold text-small text-white">Leave the island</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

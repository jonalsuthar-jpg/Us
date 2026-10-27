import {
  addDrawWord,
  answerGuess,
  checkSecret,
  DRAW_TOPIC,
  clampSettings,
  gameSettings,
  settingsSummary,
  SETTING_LIMITS,
  turnClock,
  LEVEL_MULT,
  LEVEL_NAME,
  listDrawWords,
  loadStrokes,
  maskWith,
  notifyPartner,
  ourWords,
  ourWordTexts,
  PACKS,
  pickChoices,
  pointsFor,
  removeDrawWord,
  roundCanvas,
  saveGuessTurn,
  startDrawGame,
  turnMeta,
  turnWord,
  type Difficulty,
  type DrawingFile,
  type GameSettings,
  type DrawWord,
  type GameState,
  type PackId,
  type Word,
} from '@us/shared';
import { useCouple, useDrawGame, useDrawGames, useDrawHub, useDrawSession } from '@us/shared/react';
import { router } from 'expo-router';
import { Clock, Send, X } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';
import { Board, type BoardHandle } from './board';
import { useLocalSession, useSaveDrawing } from './hooks';
import { Replay } from './replay';
import { Toolbar, useBrush } from './toolbar';

const LEVEL_CHIP: Record<Difficulty, { bg: string; fg: string }> = {
  easy: { bg: 'bg-sage-100', fg: 'text-sage-700' },
  medium: { bg: 'bg-gold-100', fg: 'text-gold-700' },
  hard: { bg: 'bg-rose-100', fg: 'text-rose-700' },
};

function useNow(on = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

function Blanks({ cells }: { cells: string[] }) {
  const words = cells.join('').split(' ');
  const cell = Math.min(26, Math.floor(300 / Math.max(8, cells.length)));
  return (
    <View accessible accessibilityLabel={`Hint: ${cells.filter((c) => c !== ' ').length} letters`} className="flex-row flex-wrap justify-center gap-x-4 gap-y-2">
      {words.map((w, wi) => (
        <View key={wi} className="flex-row gap-1.5">
          {[...w].map((ch, ci) => (
            <View key={ci} className="h-8 items-center border-b-[3px] border-gold-700" style={{ width: cell }}>
              <Text className="font-sans-bold text-[22px] leading-[28px] text-gold-700">{ch === '_' ? '' : ch}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Ring({ ms, total, size = 64 }: { ms: number; total: number; size?: number }) {
  const r = size / 2 - 4;
  const len = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, ms / total));
  return (
    <View accessibilityRole="timer" accessibilityLabel={`${Math.ceil(Math.max(0, ms) / 1000)} seconds`} style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#FFD98A" strokeWidth={5} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#F3A823" strokeWidth={5} fill="none" strokeDasharray={`${pct * len} ${len}`} strokeLinecap="round" />
      </Svg>
      <Text className="font-sans-bold text-[22px] text-gold-700">{Math.max(0, Math.ceil(ms / 1000))}</Text>
    </View>
  );
}

function RoundBar({ round, rounds }: { round: number; rounds: number }) {
  return (
    <View accessibilityLabel={`Round ${round + 1} of ${rounds}`} className="flex-row gap-1.5 px-4 pt-1">
      {Array.from({ length: rounds }, (_, i) => (
        <View key={i} className={cn('h-[5px] flex-1 rounded-full', i < round ? 'bg-gold-400' : i === round ? 'bg-gold-700' : 'bg-gold-200')} />
      ))}
    </View>
  );
}

function WordCard({ word, onPick }: { word: Word; onPick: () => void }) {
  const chip = LEVEL_CHIP[word.level];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${word.text}, ${LEVEL_NAME[word.level]}`}
      onPress={onPick}
      className="flex-row items-center gap-3.5 rounded-[20px] bg-paper-raised p-[18px] active:opacity-80"
      style={{ elevation: 2, shadowColor: '#7C5006', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }}
    >
      <View className="flex-1 gap-0.5">
        <Text className="font-sans-bold text-[22px] leading-[28px]">{word.text}</Text>
        <Text className="text-micro text-ink-soft">{PACKS.find((p) => p.id === word.pack)?.name}</Text>
      </View>
      <View className={cn('rounded-full px-2.5 py-1', chip.bg)}>
        <Text className={cn('font-sans-bold text-micro', chip.fg)}>{`${LEVEL_NAME[word.level]} · ${LEVEL_MULT[word.level]}×`}</Text>
      </View>
    </Pressable>
  );
}

function Header({ title, score, onClose, left }: { title: string; score?: number; onClose: () => void; left?: React.ReactNode }) {
  const c = usePalette();
  return (
    <View className="flex-row items-center gap-2.5 px-4 pb-2">
      {left ?? (
        <Pressable accessibilityRole="button" accessibilityLabel="Leave game" onPress={onClose} className="h-11 w-11 items-center justify-center rounded-[14px] bg-paper-raised">
          <X size={18} color={c.inkSoft} />
        </Pressable>
      )}
      <View className="flex-1">{typeof title === 'string' ? <Text className="font-sans-bold text-body">{title}</Text> : title}</View>
      {score !== undefined ? (
        <View className="h-9 justify-center rounded-full bg-paper-raised px-3">
          <Text className="font-sans-bold text-small text-gold-700">{`Team ${score}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

const SETTINGS_KEY = 'us.draw.game-settings';

/** The game settings I used last, kept on this phone. */
function useGameSettings(): [GameSettings, (s: GameSettings) => void] {
  const [settings, setSettings] = useState<GameSettings>(clampSettings(null));
  useEffect(() => {
    void AsyncStorage.getItem(SETTINGS_KEY)
      .then((raw) => raw && setSettings(clampSettings(JSON.parse(raw) as Partial<GameSettings>)))
      .catch(() => {});
  }, []);
  const save = (next: GameSettings) => {
    setSettings(next);
    void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
  };
  return [settings, save];
}

const clock = (ms: number) => {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

function Stepper({ label, hint, value, shown, onChange, min, max, step }: { label: string; hint: string; value: number; shown: string; onChange: (v: number) => void; min: number; max: number; step: number }) {
  const btn = 'h-[38px] w-[38px] items-center justify-center rounded-xl bg-paper-raised';
  return (
    <View className="flex-row items-center gap-2.5 border-b border-gold-100 py-2.5">
      <View className="flex-1">
        <Text className="font-sans-semibold text-body">{label}</Text>
        <Text className="text-[12px] text-ink-muted">{hint}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Less: ${label}`} disabled={value <= min} onPress={() => onChange(value - step)} className={cn(btn, value <= min && 'opacity-40')}>
        <Text className="font-sans-semibold text-[20px] leading-[24px] text-gold-700">–</Text>
      </Pressable>
      <Text accessibilityLabel={`${label}: ${shown}`} className="w-14 text-center font-sans-bold text-[20px]">
        {shown}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`More: ${label}`} disabled={value >= max} onPress={() => onChange(value + step)} className={cn(btn, value >= max && 'opacity-40')}>
        <Text className="font-sans-semibold text-[20px] leading-[24px] text-gold-700">+</Text>
      </Pressable>
    </View>
  );
}

function Choice({ label, values, value, onChange, show, last }: { label: string; values: number[]; value: number; onChange: (v: number) => void; show: (v: number) => string; last?: boolean }) {
  return (
    <View className={cn('gap-2 py-2.5', !last && 'border-b border-gold-100')}>
      <Text className="font-sans-semibold text-body">{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row gap-1.5">
        {values.map((v) => (
          <Pressable
            key={v}
            accessibilityRole="radio"
            accessibilityState={{ checked: v === value }}
            onPress={() => onChange(v)}
            className={cn('h-[38px] flex-1 items-center justify-center rounded-xl', v === value ? 'bg-plum-800' : 'bg-paper-raised')}
          >
            <Text className={cn('font-sans-bold text-[15px]', v === value ? 'text-paper' : 'text-ink-soft')}>{show(v)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Rounds, draw time, hint letters and word choices, like Scribble's lobby. */
function SettingsCard({ value, onChange }: { value: GameSettings; onChange: (s: GameSettings) => void }) {
  const set = (patch: Partial<GameSettings>) => onChange(clampSettings({ ...value, ...patch }));
  const L = SETTING_LIMITS;
  return (
    <View accessibilityLabel="Game settings" className="rounded-[22px] bg-gold-50 px-3.5 py-1.5">
      <Stepper label="Rounds" hint={`${L.rounds.min} to ${L.rounds.max}`} value={value.rounds} shown={String(value.rounds)} onChange={(v) => set({ rounds: v })} {...L.rounds} />
      <Stepper label="Draw time" hint="30 s to 3 min" value={value.drawMs} shown={`${value.drawMs / 1000} s`} onChange={(v) => set({ drawMs: v })} {...L.drawMs} />
      <Choice label="Hint letters" values={[0, 1, 2, 3, 4, 5]} value={value.hints} onChange={(v) => set({ hints: v })} show={(v) => (v ? String(v) : 'Off')} />
      <Choice label="Words to pick from" values={[1, 2, 3, 4, 5]} value={value.choices} onChange={(v) => set({ choices: v })} show={String} last />
    </View>
  );
}

// ------------------------------------------------------------------ root ---

export function GuessGame() {
  const game = useDrawGame();
  const s = game.state;
  const turns = useDrawGames();
  const [turnMode, setTurnMode] = useState<null | 'draw' | 'guess'>(null);

  if (turnMode === 'draw' && turns.open)
    return <TurnDraw gameId={turns.open.id} round={turns.open.played} packs={turns.open.packs as PackId[]} settings={gameSettings(turns.open)} onDone={() => setTurnMode(null)} />;
  if (turnMode === 'guess' && turns.toGuess) return <TurnGuess onDone={() => setTurnMode(null)} />;
  if (s && s.phase !== 'left' && !(s.phase === 'done' && s.results.length === 0)) {
    if (s.phase === 'invited') return <Invited state={s} />;
    if (s.phase === 'done') return <Results state={s} />;
    if (s.phase === 'choosing') return <Choosing state={s} />;
    return <LiveRound state={s} />;
  }
  return <Lobby onTurn={setTurnMode} left={s?.phase === 'left' ? s.leftBy : null} />;
}

// ----------------------------------------------------------------- lobby ---

function Lobby({ onTurn, left }: { onTurn: (m: 'draw' | 'guess') => void; left: string | null }) {
  const { sb, couple, me, partner, partnerOnline } = useCouple();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const game = useDrawGame();
  const turns = useDrawGames();
  const [packs, setPacks] = useState<PackId[]>(['everyday', 'food']);
  const [words, setWords] = useState<DrawWord[]>([]);
  const [newWord, setNewWord] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [settings, setSettings] = useGameSettings();
  const name = partner.display_name;

  useEffect(() => {
    void listDrawWords(sb, couple.id).then(setWords).catch(() => {});
  }, [sb, couple.id]);

  const toggle = (p: PackId) => setPacks((cur) => (cur.includes(p) ? (cur.length > 1 ? cur.filter((x) => x !== p) : cur) : [...cur, p]));
  const fastest = turns.stats.fastestMs != null ? `${Math.max(1, Math.round(turns.stats.fastestMs / 1000))} s` : '–';

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top + 8 }}>
      <Header title="" onClose={() => router.back()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-5 px-5" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View className="gap-1.5">
          <Display className="text-[34px] leading-[40px]">Draw & Guess</Display>
          <Display light italic className="text-lead text-ink-soft">
            Six rounds, one team. One of you draws, the other guesses, then you swap.
          </Display>
        </View>
        {left ? <Text className="rounded-[16px] bg-paper-sunken px-4 py-3 text-small text-ink-soft">{left === me.id ? 'You left the game.' : `${name} left the game.`}</Text> : null}

        {turns.toGuess || turns.myTurnToDraw ? (
          <View className="gap-3 rounded-[20px] bg-plum-800 p-5">
            <Text className="font-sans-bold text-micro uppercase tracking-[0.5px] text-gold-200">{`Game in turns · round ${(turns.open?.played ?? 0) + 1} of ${turns.open?.rounds}`}</Text>
            <Display className="text-heading text-paper">{turns.toGuess ? `${name} drew something. Your turn to guess` : 'Your turn to draw'}</Display>
            <Pressable accessibilityRole="button" onPress={() => onTurn(turns.toGuess ? 'guess' : 'draw')} className="h-12 items-center justify-center rounded-control bg-gold-400">
              <Text className="font-sans-bold text-body text-gold-900">{turns.toGuess ? 'Guess it' : 'Draw now'}</Text>
            </Pressable>
          </View>
        ) : turns.open ? (
          <Text className="rounded-[16px] bg-paper-sunken px-4 py-3 text-small text-ink-soft">
            {`Game in turns: waiting for ${name} (${turns.open.played} of ${turns.open.rounds} rounds, ${turns.open.score} points so far).`}
          </Text>
        ) : null}

        <SettingsCard value={settings} onChange={setSettings} />

        <View className="gap-3 rounded-[24px] bg-gold-50 p-4">
          <Display className="text-lead">Word packs</Display>
          <View className="flex-row flex-wrap gap-2">
            {PACKS.map((p) => {
              const on = packs.includes(p.id);
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => toggle(p.id)}
                  className={cn('rounded-[16px] border px-3.5 py-2.5', on ? 'border-gold-400 bg-paper-raised' : 'border-gold-100 opacity-70')}
                >
                  <Text className="font-sans-semibold text-body">{p.name}</Text>
                  <Text className="text-micro text-ink-soft">{p.id === 'ours' ? `${words.length} words + memory titles` : p.blurb}</Text>
                </Pressable>
              );
            })}
          </View>
          {packs.includes('ours') ? (
            <View className="gap-2.5">
              <View className="flex-row gap-2">
                <TextInput
                  value={newWord}
                  onChangeText={setNewWord}
                  maxLength={40}
                  placeholder="Our Goa trip, Mumbai rains…"
                  placeholderTextColor={c.placeholder}
                  accessibilityLabel="Add a word"
                  className="h-11 flex-1 rounded-control border border-paper-edge bg-paper-raised px-3.5 font-sans text-body text-ink"
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={async () => {
                    const w = newWord.trim();
                    if (!w) return;
                    try {
                      const row = await addDrawWord(sb, couple.id, me.id, w);
                      setWords((cur) => [row, ...cur]);
                      setNewWord('');
                    } catch {
                      /* already there */
                    }
                  }}
                  className="h-11 justify-center rounded-control border border-plum-200 px-4"
                >
                  <Text className="font-sans-semibold text-body">Add</Text>
                </Pressable>
              </View>
              <View className="flex-row flex-wrap gap-1.5">
                {words.map((w) => (
                  <View key={w.id} className="flex-row items-center gap-1 rounded-full bg-paper-raised py-1 pl-3 pr-1">
                    <Text className="text-small">{w.word}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${w.word}`}
                      hitSlop={6}
                      onPress={() => {
                        setWords((cur) => cur.filter((x) => x.id !== w.id));
                        void removeDrawWord(sb, w.id).catch(() => {});
                      }}
                      className="rounded-full p-1"
                    >
                      <X size={14} color={c.inkMuted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        <Text className="text-small text-ink-muted">{settingsSummary(settings)}</Text>
        <View className="flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !partnerOnline }}
            disabled={!partnerOnline || !!busy}
            onPress={async () => {
              setBusy('live');
              await game.invite(packs, settings);
              setBusy(null);
            }}
            className={cn('flex-1 gap-1 rounded-[24px] bg-gold-400 p-4', (!partnerOnline || busy) && 'opacity-60')}
          >
            <Display className="text-heading text-gold-900">{busy === 'live' ? 'Starting…' : 'Play live'}</Display>
            <Text className="text-small text-gold-900">{partnerOnline ? `${name} is in Us now.` : `${name} isn’t in Us right now.`}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!!busy || !!turns.open}
            onPress={async () => {
              setBusy('turns');
              try {
                await startDrawGame(sb, { coupleId: couple.id, me: me.id, mode: 'turns', packs, settings });
                turns.reload();
                onTurn('draw');
              } finally {
                setBusy(null);
              }
            }}
            className={cn('flex-1 gap-1 rounded-[24px] border border-gold-200 bg-paper-raised p-4', (busy || turns.open) && 'opacity-60')}
          >
            <Display className="text-heading">{busy === 'turns' ? 'Starting…' : 'Play in turns'}</Display>
            <Text className="text-small text-ink-soft">{turns.open ? 'Finish your game first.' : `${name} guesses later.`}</Text>
          </Pressable>
        </View>
        {game.error ? <Text className="text-small text-rose-700">{game.error}</Text> : null}

        <View className="flex-row gap-2">
          <Stat value={turns.stats.played} label="games played" />
          <Stat value={turns.stats.best} label="best team score" />
          <Stat value={fastest} label="fastest guess" />
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ value, label, night }: { value: string | number; label: string; night?: boolean }) {
  return (
    <View className={cn('flex-1 gap-0.5 rounded-[16px] p-3', night ? 'bg-plum-700' : 'bg-paper-sunken')}>
      <Text className={cn('font-sans-bold text-[21px] leading-[26px]', night ? 'text-paper' : 'text-ink')}>{String(value)}</Text>
      <Text className={cn('text-[12px] leading-[15px]', night ? 'text-plum-200' : 'text-ink-soft')} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// --------------------------------------------------------------- invited ---

function Invited({ state }: { state: GameState }) {
  const { me, partner, sb } = useCouple();
  const insets = useSafeAreaInsets();
  const game = useDrawGame();
  const [nudged, setNudged] = useState(false);
  const mine = state.players[0] === me.id;
  useEffect(() => {
    if (mine) game.resendInvite();
  }, [mine, game]);
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-gold-50 px-6" style={{ paddingTop: insets.top }}>
      <Blanks cells={['_', 'a', '_', '_']} />
      <Display className="text-center text-title">{mine ? `Waiting for ${partner.display_name}…` : `${partner.display_name} wants to play Draw & Guess`}</Display>
      <Text className="text-center text-body text-ink-soft">{`${state.packs.map((p) => PACKS.find((x) => x.id === p)?.name).join(' · ')}\n${settingsSummary(state.settings)}`}</Text>
      {mine ? (
        <View className="w-full gap-2">
          <Pressable
            accessibilityRole="button"
            disabled={nudged}
            onPress={() => {
              setNudged(true);
              void notifyPartner(sb, { category: 'draw_invite', game: true });
            }}
            className="h-12 items-center justify-center rounded-control border border-plum-200"
          >
            <Text className="font-sans-semibold text-body">{nudged ? 'Notification sent' : 'Send a notification'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => game.leave()} className="h-11 items-center justify-center">
            <Text className="text-body text-ink-soft underline">Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <View className="w-full gap-2">
          <Pressable accessibilityRole="button" onPress={() => void game.join()} className="h-14 items-center justify-center rounded-control bg-gold-400">
            <Text className="font-sans-bold text-lead text-gold-900">Join the game</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => game.leave()} className="h-11 items-center justify-center">
            <Text className="text-body text-ink-soft underline">Not now</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// -------------------------------------------------------------- choosing ---

function Choosing({ state: s }: { state: GameState }) {
  const { me, partner } = useCouple();
  const insets = useSafeAreaInsets();
  const game = useDrawGame();
  const now = useNow();
  const drawer = s.drawer === me.id;
  const name = partner.display_name;
  return (
    <View className="flex-1 bg-gold-50" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }}>
      <Header title="Draw & Guess" score={s.score} onClose={() => game.leave()} />
      <RoundBar round={s.round} rounds={s.rounds} />
      <View className="items-center gap-2 px-6 pt-9">
        <Text className="font-sans-bold text-micro uppercase tracking-[0.5px] text-gold-700">{`Round ${s.round + 1} · ${drawer ? 'your turn to draw' : `${name} draws`}`}</Text>
        <Display className="text-center text-title">{drawer ? 'Pick a word' : `${name} is picking a word…`}</Display>
        {drawer ? (
          <Display light italic className="text-center text-lead text-ink-soft">
            {`${name} can’t see it. Harder words score more.`}
          </Display>
        ) : null}
      </View>
      {drawer ? (
        <View className="gap-3 px-5 pt-7">
          {s.choices.map((w) => (
            <WordCard key={w.text} word={w} onPick={() => game.pick(w)} />
          ))}
        </View>
      ) : null}
      <View className="mt-auto items-center gap-2.5 px-5">
        <Ring ms={s.until - now} total={10_000} />
        {drawer ? <Text className="text-center text-micro text-ink-muted">{`Picks one for you when time’s up · ${s.packs.map((p) => PACKS.find((x) => x.id === p)?.name).join(', ')}`}</Text> : null}
      </View>
    </View>
  );
}

// ------------------------------------------------------------ live round ---

function LiveRound({ state: s }: { state: GameState }) {
  const { me, partner, partnerSlot } = useCouple();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { width, height: screenH } = useWindowDimensions();
  const game = useDrawGame();
  const { session, state, cursor } = useDrawSession(roundCanvas(s.id, s.round));
  const now = useNow();
  const { tool, setTool, color, setColor, size, setSize } = useBrush({ color: 0 });
  const [text, setText] = useState('');
  const drawer = s.drawer === me.id;
  const name = partner.display_name;
  const left = s.until - now;
  const revealing = s.phase === 'reveal';
  const cells = s.secret ? maskWith(s.secret.mask, s.revealed) : [];
  const last = s.results[s.results.length - 1];
  const boardW = Math.min(width - 32, Math.floor(((screenH - insets.top - (drawer ? 300 : 360)) * 3) / 4));
  const myGuesses = s.guesses.filter((g) => g.by === me.id);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-gold-50" style={{ paddingTop: insets.top + 8 }}>
      <Header
        title=""
        onClose={() => game.leave()}
        left={
          <View className="flex-1 flex-row items-center gap-2.5">
            <View className={cn('h-9 w-9 items-center justify-center rounded-full', drawer ? 'bg-plum-800' : partnerSlot === 'a' ? 'bg-rose-400' : 'bg-teal-500')}>
              <Text className="font-sans-bold text-body text-white">{(drawer ? me.display_name : name).slice(0, 1).toUpperCase()}</Text>
            </View>
            <View className="flex-1">
              <Text className="font-sans-bold text-body">{drawer ? `Draw: ${s.word}` : `${name} is drawing`}</Text>
              <Text className="text-micro text-ink-soft">{`Round ${s.round + 1} of ${s.rounds} · Team ${s.score}`}</Text>
            </View>
          </View>
        }
      />
      <View className="absolute right-4" style={{ top: insets.top + 10 }}>
        <View accessibilityRole="timer" className="h-10 flex-row items-center gap-1.5 rounded-full bg-plum-800 px-3">
          <Clock size={16} color="#FCC24F" />
          <Text className="font-sans-bold text-body text-paper">{clock(revealing ? 0 : left)}</Text>
        </View>
      </View>
      <View className="px-4 pb-3 pt-2.5">
        {drawer ? (
          <Text className="text-center text-small text-ink-soft">{`${name} sees  ${cells.join('')}`}</Text>
        ) : (
          <Blanks cells={cells} />
        )}
      </View>
      <View className="items-center">
        <View>
          <Board
            session={session}
            state={state}
            tool={tool}
            color={color}
            size="m"
            cursor={drawer ? null : cursor}
            partnerName={name}
            partnerSlot={partnerSlot}
            disabled={!drawer || revealing}
            width={boardW}
            label={drawer ? `Your drawing of ${s.word}` : `${name}’s drawing`}
          />
          {revealing && last ? (
            <View className="absolute inset-0 items-center justify-center rounded-[20px] bg-plum-900/50 p-6">
              <View className="w-full items-center gap-1 rounded-[24px] bg-paper-raised p-6">
                <Text className="font-sans-bold text-micro uppercase tracking-[0.5px] text-gold-700">{last.solved ? 'Got it!' : 'Time’s up'}</Text>
                <Display className="text-title">{last.word}</Display>
                <Text className="text-body text-ink-soft">{last.solved ? `+${last.points} each, in ${Math.round(last.ms / 1000)} s` : 'No points this round'}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>
      {drawer ? (
        <View className="gap-2 px-4 pt-3">
          <Toolbar dense tool={tool} onTool={setTool} color={color} onColor={setColor} size={size} onSize={setSize} onUndo={() => session.undo()} canUndo={session.canUndo} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {s.guesses.map((g, i) => (
              <View key={i} className={cn('rounded-full px-3 py-1', g.result === 'close' ? 'bg-gold-200' : g.result === 'right' ? 'bg-sage-100' : 'bg-paper-raised')}>
                <Text className={cn('text-small', g.result === 'wrong' ? 'text-ink-muted line-through' : 'font-sans-semibold')}>{g.text}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : (
        <>
          <View className="gap-1.5 px-5 pt-3.5">
            {myGuesses.slice(-3).map((g, i) => (
              <View key={i} className="flex-row items-center gap-2">
                <Text className={cn('text-body', g.result === 'wrong' ? 'text-ink-muted line-through' : 'font-sans-semibold')}>{g.text}</Text>
                {g.result === 'close' ? (
                  <View className="rounded-full bg-gold-200 px-2.5 py-0.5">
                    <Text className="font-sans-bold text-micro text-gold-700">So close!</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
          <View className="mt-auto flex-row gap-2 px-4" style={{ paddingBottom: insets.bottom + 16 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              editable={!revealing}
              autoCorrect={false}
              autoCapitalize="none"
              placeholder="Type a guess"
              placeholderTextColor={c.placeholder}
              accessibilityLabel="Your guess"
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={() => {
                if (game.guess(text)) setText('');
              }}
              className="h-[52px] flex-1 rounded-[14px] border-2 border-gold-400 bg-paper-raised px-4 font-sans text-lead text-ink"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send guess"
              onPress={() => {
                if (game.guess(text)) setText('');
              }}
              className="h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-plum-800"
            >
              <Send size={20} color="#FCFAFB" />
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

// --------------------------------------------------------------- results ---

function Results({ state: s }: { state: GameState }) {
  const { me, partner } = useCouple();
  const insets = useSafeAreaInsets();
  const game = useDrawGame();
  const hub = useDrawHub();
  const { stats, reload } = useDrawGames();
  const save = useSaveDrawing();
  const [saved, setSaved] = useState<'idle' | 'busy' | 'done'>('idle');
  const [snap, setSnap] = useState<{ strokes: ReturnType<typeof hub.session>['snapshot']; round: number; word: string; label: string } | null>(null);
  const shot = useRef<BoardHandle>(null);
  const queue = useRef<(() => void) | null>(null);
  const solved = s.results.filter((r) => r.solved);
  const fastest = solved.length ? Math.min(...solved.map((r) => r.ms)) : null;
  useEffect(() => reload(), [reload]);

  // Each round's picture is made by an off-screen board, one at a time.
  useEffect(() => {
    if (!snap) return;
    const t = setTimeout(() => queue.current?.(), 120);
    return () => clearTimeout(t);
  }, [snap]);

  async function saveAll() {
    setSaved('busy');
    for (const r of s.results) {
      const st = hub.session(roundCanvas(s.id, r.round)).snapshot;
      if (!st.strokes.length) continue;
      const label = `“${r.word}”${r.solved ? ` · ${Math.round(r.ms / 1000)} s` : ''}`;
      await new Promise<void>((resolve) => {
        queue.current = async () => {
          try {
            const png = await shot.current!.toPng();
            await save({ kind: 'canvas', strokes: st.strokes, png, title: label });
          } catch {
            /* keep going */
          }
          resolve();
        };
        setSnap({ strokes: st, round: r.round, word: r.word, label });
      });
    }
    setSnap(null);
    setSaved('done');
  }

  return (
    <View className="flex-1 overflow-hidden bg-plum-800">
      <View pointerEvents="none" className="absolute -right-[90px] -top-[70px] h-[280px] w-[280px] rounded-full bg-gold-400 opacity-90" />
      <ScrollView contentContainerClassName="gap-4 px-4" contentContainerStyle={{ paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 }}>
        <View className="gap-1.5 px-2">
          <Text className="font-sans-bold text-micro uppercase tracking-[0.5px] text-gold-200">{`Game over · ${s.results.length} rounds`}</Text>
          <Text className="font-sans-bold text-[44px] leading-[48px] text-paper">{`${s.score} points`}</Text>
          <Display light italic className="text-[19px] leading-[25px] text-plum-200">
            {`${s.score >= stats.best && s.score > 0 ? 'Your best game yet. ' : ''}${solved.length} of ${s.results.length} guessed.`}
          </Display>
        </View>
        <View className="rounded-[20px] bg-plum-700 p-1.5">
          {s.results.map((r) => (
            <View key={r.round} className="flex-row items-center gap-3 p-2.5">
              <View className={cn('h-2 w-2 rounded-full', r.drawer === me.id ? 'bg-rose-400' : 'bg-teal-300')} />
              <Text className={cn('flex-1 font-sans-semibold text-body', r.solved ? 'text-paper' : 'text-plum-300')}>{r.word}</Text>
              <Text className="text-micro text-plum-200">{r.solved ? `${Math.round(r.ms / 1000)} s${r.ms === fastest ? ' · fastest' : ''}` : 'time ran out'}</Text>
              <Text className={cn('w-12 text-right font-sans-bold text-body', r.solved ? 'text-paper' : 'text-plum-300')}>{r.solved ? `+${r.points}` : '0'}</Text>
            </View>
          ))}
        </View>
        <View className="flex-row gap-2">
          <Stat night value={stats.played} label="games played" />
          <Stat night value={Math.max(stats.best, s.score)} label="best team score" />
          <Stat night value={fastest != null ? `${Math.max(1, Math.round(fastest / 1000))} s` : '–'} label="fastest guess" />
        </View>
        <View className="gap-2 pt-6">
          <Pressable accessibilityRole="button" onPress={() => void game.invite(s.packs, s.settings)} className="h-[52px] items-center justify-center rounded-control bg-gold-400">
            <Text className="font-sans-bold text-body text-gold-900">Play again</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={saved !== 'idle'} onPress={() => void saveAll()} className="h-12 items-center justify-center rounded-control bg-white/10">
            <Text className="font-sans-semibold text-body text-paper">
              {saved === 'done' ? 'Saved to Our drawings' : saved === 'busy' ? 'Saving…' : `Save all ${s.results.length} drawings`}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => game.leave()} className="h-11 items-center justify-center">
            <Text className="text-body text-plum-200">Back to Draw & Guess</Text>
          </Pressable>
        </View>
        <Text className="text-center text-micro text-plum-300">{`Played with ${partner.display_name}`}</Text>
      </ScrollView>
      {snap ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: -2000, top: 0 }}>
          <Board ref={shot} session={hub.session(roundCanvas(s.id, snap.round))} state={snap.strokes} tool="pen" color={0} size="m" width={300} disabled raised={false} label="" />
        </View>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------- turn mode ---

function TurnDraw({ gameId, round, packs, settings, onDone }: { gameId: string; round: number; packs: PackId[]; settings: GameSettings; onDone: () => void }) {
  const { sb, couple, me, partner, channel } = useCouple();
  const insets = useSafeAreaInsets();
  const { width, height: screenH } = useWindowDimensions();
  const { session, state } = useLocalSession();
  const turns = useDrawGames();
  const board = useRef<BoardHandle>(null);
  const [choices, setChoices] = useState<Word[]>([]);
  const [word, setWord] = useState<Word | null>(null);
  const [started, setStarted] = useState(0);
  const [busy, setBusy] = useState(false);
  const { tool, setTool, color, setColor, size, setSize } = useBrush({ color: 0 });
  const now = useNow(!!word);
  const sent = useRef(false);
  const boardW = Math.min(width - 32, Math.floor(((screenH - insets.top - 300) * 3) / 4));

  useEffect(() => {
    void (async () => {
      const ours = packs.includes('ours') ? ourWords(await ourWordTexts(sb, couple.id).catch(() => [])) : [];
      setChoices(pickChoices(packs, ours, [], Math.random, settings.choices));
    })();
  }, [sb, couple.id, packs, settings.choices]);

  async function send() {
    if (!word || sent.current) return;
    sent.current = true;
    setBusy(true);
    session.finish();
    try {
      const png = await board.current!.toPng();
      const d = await saveGuessTurn(sb, { coupleId: couple.id, me: me.id, gameId, round, word: word.text, level: word.level, pack: word.pack, strokes: session.snapshot.strokes, png, ms: Date.now() - started, settings });
      channel.sendChanged(DRAW_TOPIC);
      void notifyPartner(sb, { category: 'guess_turn', drawingId: d.id });
      turns.reload();
      onDone();
    } catch {
      sent.current = false;
      setBusy(false);
    }
  }

  const left = word ? started + settings.drawMs - now : settings.drawMs;
  useEffect(() => {
    if (word && left <= 0) void send();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!word) {
    return (
      <View className="flex-1 bg-gold-50" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }}>
        <Header title="Draw & Guess" onClose={onDone} />
        <View className="items-center gap-2 px-6 pt-8">
          <Text className="font-sans-bold text-micro uppercase tracking-[0.5px] text-gold-700">{`Round ${round + 1} · your turn to draw`}</Text>
          <Display className="text-title">Pick a word</Display>
          <Display light italic className="text-center text-lead text-ink-soft">
            {`${partner.display_name} guesses later, watching your drawing come together.`}
          </Display>
        </View>
        <View className="gap-3 px-5 pt-7">
          {choices.map((w) => (
            <WordCard
              key={w.text}
              word={w}
              onPick={() => {
                setWord(w);
                setStarted(Date.now());
              }}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gold-50" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}>
      <Header title={`Draw: ${word.text}`} onClose={onDone} />
      <View className="flex-row items-center justify-between px-5 pb-3">
        <Text className="text-small text-ink-soft">It sends itself when time’s up.</Text>
        <Ring ms={left} total={settings.drawMs} size={52} />
      </View>
      <View className="items-center">
        <Board ref={board} session={session} state={state} tool={tool} color={color} size={size} width={boardW} disabled={busy} label={`Your drawing of ${word.text}`} />
      </View>
      <View className="gap-3 px-4 pt-3">
        <Toolbar dense tool={tool} onTool={setTool} color={color} onColor={setColor} size={size} onSize={setSize} onUndo={() => session.undo()} canUndo={session.canUndo} />
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void send()} className={cn('h-[52px] items-center justify-center rounded-control bg-rose-600', busy && 'opacity-60')}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text className="font-sans-semibold text-body text-white">Done, send it</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function TurnGuess({ onDone }: { onDone: () => void }) {
  const { sb, partner, channel } = useCouple();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { width, height: screenH } = useWindowDimensions();
  const turns = useDrawGames();
  const [d] = useState(turns.toGuess);
  const meta = d ? turnMeta(d) : null;
  const [file, setFile] = useState<DrawingFile | null>(null);
  const [started, setStarted] = useState(0);
  const [text, setText] = useState('');
  const [guesses, setGuesses] = useState<{ text: string; result: 'close' | 'wrong' }[]>([]);
  const [result, setResult] = useState<null | { solved: boolean; points: number; ms: number; word: string | null }>(null);
  const now = useNow(!!started && !result);
  const answered = useRef(false);
  const boardW = Math.min(width - 32, Math.floor(((screenH - insets.top - 360) * 3) / 4));

  useEffect(() => {
    if (!d) return;
    void loadStrokes(sb, d.strokes_path).then((f) => {
      setFile(f);
      setStarted(Date.now());
    });
  }, [sb, d]);

  async function finish(solved: boolean) {
    if (answered.current || !meta || !d) return;
    answered.current = true;
    const { drawMs } = turnClock(meta, 0);
    const ms = Math.min(drawMs, Date.now() - started);
    const points = solved ? pointsFor(ms, meta.level, drawMs) : 0;
    await answerGuess(sb, d.id, solved, ms, points).catch(() => {});
    const word = await turnWord(sb, d.id).catch(() => null);
    setResult({ solved, points, ms, word });
    channel.sendChanged(DRAW_TOPIC);
  }

  const elapsed = started ? now - started : 0;
  const { drawMs, revealed } = meta ? turnClock(meta, elapsed) : { drawMs: 80_000, revealed: {} as Record<number, string> };
  const left = drawMs - elapsed;
  useEffect(() => {
    if (started && !result && left <= 0) void finish(false);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!meta || !file) {
    return (
      <View className="flex-1 items-center justify-center bg-gold-50">
        <ActivityIndicator color={c.gold} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-gold-50" style={{ paddingTop: insets.top + 8 }}>
      <Header title={`${partner.display_name} drew this`} onClose={onDone} />
      <View className="flex-row items-center justify-between px-5 pb-3">
        <Blanks cells={maskWith(meta.secret.mask, result?.word ? Object.fromEntries([...result.word].map((ch, i) => [i, ch])) : revealed)} />
        <Ring ms={result ? 0 : left} total={drawMs} size={52} />
      </View>
      <View className="items-center">
        <Replay file={file} width={boardW} tone="paper" speed={1} controls={false} />
      </View>
      {result ? (
        <View className="mt-auto gap-2 px-5" style={{ paddingBottom: insets.bottom + 16 }}>
          <Text className="text-center font-sans-bold text-micro uppercase tracking-[0.5px] text-gold-700">{result.solved ? 'Got it!' : 'Time’s up'}</Text>
          <Display className="text-center text-title">{result.word ?? ''}</Display>
          <Text className="text-center text-body text-ink-soft">{result.solved ? `+${result.points} each, in ${Math.round(result.ms / 1000)} s` : 'No points this round'}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              turns.reload();
              onDone();
            }}
            className="mt-2 h-[52px] items-center justify-center rounded-control bg-rose-600"
          >
            <Text className="font-sans-semibold text-body text-white">Your turn to draw</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View className="gap-1.5 px-5 pt-3">
            {guesses.slice(-3).map((g, i) => (
              <View key={i} className="flex-row items-center gap-2">
                <Text className={cn('text-body', g.result === 'wrong' ? 'text-ink-muted line-through' : 'font-sans-semibold')}>{g.text}</Text>
                {g.result === 'close' ? (
                  <View className="rounded-full bg-gold-200 px-2.5 py-0.5">
                    <Text className="font-sans-bold text-micro text-gold-700">So close!</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
          <View className="mt-auto flex-row gap-2 px-4" style={{ paddingBottom: insets.bottom + 16 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              autoCorrect={false}
              autoCapitalize="none"
              placeholder="Type a guess"
              placeholderTextColor={c.placeholder}
              accessibilityLabel="Your guess"
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={() => submit()}
              className="h-[52px] flex-1 rounded-[14px] border-2 border-gold-400 bg-paper-raised px-4 font-sans text-lead text-ink"
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Send guess" onPress={() => submit()} className="h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-plum-800">
              <Send size={20} color="#FCFAFB" />
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );

  function submit() {
    const t = text.trim();
    if (!t || !meta) return;
    const r = checkSecret(t, meta.secret, meta.salt);
    setText('');
    if (r === 'right') void finish(true);
    else setGuesses((g) => [...g, { text: t, result: r }]);
  }
}

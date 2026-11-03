import {
  C4_COLS,
  C4_ROWS,
  CHAIN_GOAL,
  connectFour,
  ticTacToe,
  wordChain,
  type ConnectFour,
  type PartnerSlot,
  type Seat,
  type TicTacToe,
  type WordChain,
} from '@us/shared';
import * as Haptics from 'expo-haptics';
import { SendHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { BounceIn, FadeIn, SlideInUp, ZoomIn } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';

/** Each seat's colour: whoever sits there, in their own colour (a rose, b teal). */
export type SeatSlots = [PartnerSlot, PartnerSlot];

const COLOUR: Record<PartnerSlot, string> = { a: '#D9536F', b: '#2E9A93' };

interface BoardProps<S> {
  state: S;
  slots: SeatSlots;
  /** My seat, when it's my turn; null while waiting or after the end. */
  canPlay: Seat | null;
  onMove: (move: number | string) => void;
}

const tap = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

// ------------------------------------------------------------ tic-tac-toe ---

export function TicTacToeBoard({ state, slots, canPlay, onMove }: BoardProps<TicTacToe>) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 40, 360);
  const cell = (size - 20) / 3;
  const line = ticTacToe.line(state);
  return (
    <View style={{ width: size, height: size }} className="flex-row flex-wrap self-center" accessibilityLabel="Tic-tac-toe board">
      {state.cells.map((c, i) => {
        const free = c === -1 && canPlay !== null;
        const winning = line?.includes(i);
        return (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={c === -1 ? `Empty, row ${Math.floor(i / 3) + 1} column ${(i % 3) + 1}` : c === 0 ? 'X' : 'O'}
            disabled={!free}
            onPress={() => {
              tap();
              onMove(i);
            }}
            style={{ width: cell, height: cell, marginRight: i % 3 === 2 ? 0 : 10, marginBottom: i < 6 ? 10 : 0 }}
            className={cn('items-center justify-center rounded-[22px] border-2 bg-paper-raised', winning ? 'border-gold-400 bg-gold-50' : 'border-paper-edge active:bg-gold-50')}
          >
            {c !== -1 ? (
              <Animated.View entering={state.last === i ? ZoomIn.springify().damping(12) : undefined}>
                <Svg width={cell * 0.6} height={cell * 0.6} viewBox="0 0 40 40" fill="none" stroke={COLOUR[slots[c as Seat]]} strokeWidth={5} strokeLinecap="round">
                  {c === 0 ? <Path d="M9 9 L31 31 M31 9 L9 31" /> : <Circle cx={20} cy={20} r={12} />}
                </Svg>
              </Animated.View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ----------------------------------------------------------- connect four ---

export function ConnectFourBoard({ state, slots, canPlay, onMove }: BoardProps<ConnectFour>) {
  const { width } = useWindowDimensions();
  const boardW = Math.min(width - 32, 440);
  const gap = 6;
  const disc = (boardW - 20 - gap * (C4_COLS - 1)) / C4_COLS;
  const line = connectFour.line(state);
  const inLine = (col: number, row: number) => !!line?.some((p) => p.col === col && p.row === row);
  return (
    <View style={{ width: boardW, padding: 10 }} className="flex-row self-center rounded-[26px] bg-plum-600" accessibilityLabel="Connect Four board">
      {Array.from({ length: C4_COLS }, (_, col) => {
        const open = canPlay !== null && connectFour.canDrop(state, col);
        return (
          <Pressable
            key={col}
            accessibilityRole="button"
            accessibilityLabel={`Drop in column ${col + 1}`}
            disabled={!open}
            onPress={() => {
              tap();
              onMove(col);
            }}
            style={{ marginRight: col === C4_COLS - 1 ? 0 : gap }}
            className="flex-col-reverse rounded-[12px] active:bg-white/10"
          >
            {Array.from({ length: C4_ROWS }, (_, row) => {
              const seat = connectFour.at(state, col, row);
              const fresh = state.last?.col === col && state.last.row === row;
              return (
                <View key={row} style={{ width: disc, height: disc, marginTop: gap, borderRadius: disc / 2 }} className="overflow-hidden bg-plum-900/45">
                  {seat !== -1 ? (
                    <Animated.View
                      entering={fresh ? SlideInUp.springify().damping(14) : undefined}
                      style={{
                        flex: 1,
                        borderRadius: disc / 2,
                        backgroundColor: COLOUR[slots[seat as Seat]],
                        borderWidth: inLine(col, row) ? 4 : 0,
                        borderColor: '#F7D07A',
                      }}
                    />
                  ) : null}
                </View>
              );
            })}
          </Pressable>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------- word chain ---

export function WordChainBoard({ state, slots, canPlay, onMove }: BoardProps<WordChain>) {
  const c = usePalette();
  const [word, setWord] = useState('');
  const next = wordChain.next(state);
  const problem = word.trim() ? wordChain.problem(state, word) : null;
  const send = () => {
    if (!word.trim() || problem) return;
    tap();
    onMove(word);
    setWord('');
  };
  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <View className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper-sunken">
          <View className="h-full rounded-full bg-gold-400" style={{ width: `${(state.words.length / CHAIN_GOAL) * 100}%` }} />
        </View>
        <Text className="font-sans-semibold text-small text-ink-soft">{`${state.words.length}/${CHAIN_GOAL}`}</Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {state.words.map((x, i) => (
          <Animated.View key={x.w} entering={i === state.words.length - 1 ? BounceIn : undefined} style={{ backgroundColor: COLOUR[slots[x.by]] }} className="rounded-full px-3 py-1.5">
            <Text className="font-sans-semibold text-body text-white">{x.w}</Text>
          </Animated.View>
        ))}
        {!state.words.length ? <Text className="text-small text-ink-soft">No words yet. The first one starts with the letter below.</Text> : null}
      </View>
      <Animated.View key={next} entering={FadeIn} className="h-16 w-16 items-center justify-center self-center rounded-[20px] bg-gold-100">
        <Display className="text-[34px] leading-[40px] text-gold-800">{next.toUpperCase()}</Display>
      </Animated.View>
      {canPlay !== null ? (
        <View className="gap-1.5">
          <View className="flex-row items-center gap-2 rounded-full border border-paper-edge bg-paper-raised py-1.5 pl-4 pr-1.5">
            <TextInput
              value={word}
              onChangeText={setWord}
              placeholder={`A word starting with “${next.toUpperCase()}”`}
              placeholderTextColor={c.inkMuted}
              accessibilityLabel="Your word"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={send}
              className="min-h-[40px] flex-1 font-sans text-body text-ink"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Play word"
              disabled={!word.trim() || !!problem}
              onPress={send}
              className={cn('h-10 w-10 items-center justify-center rounded-full bg-rose-600', (!word.trim() || problem) && 'opacity-40')}
            >
              <SendHorizontal size={18} color="#fff" />
            </Pressable>
          </View>
          {problem ? <Text className="px-3 text-small text-rose-700">{problem}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

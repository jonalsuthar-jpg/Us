import { CHAIN_GOAL, GAME_INFO, gameScore, IllegalMove, seatOf, type ConnectFour, type GameMove, type TicTacToe, type WordChain } from '@us/shared';
import { useCouple, useGames } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ArrowLeft, Flag, RotateCcw } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../ui/avatar';
import { Button } from '../ui/button';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';
import { ConnectFourBoard, TicTacToeBoard, WordChainBoard, type SeatSlots } from './boards';
import { Confetti } from './confetti';

/** One game: whose turn, the board, and the end (with a rematch). */
export function GameScreen({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const { me, partner, mySlot, partnerSlot, partnerOnline } = useCouple();
  const { games, loading, move, resign, start } = useGames();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const game = games.find((g) => g.id === id);

  // A buzz when my partner's move lands and it's my turn again.
  const lastTurn = useRef(game?.turn);
  useEffect(() => {
    if (game && game.turn === me.id && lastTurn.current && lastTurn.current !== me.id) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    lastTurn.current = game?.turn;
  }, [game?.turn, game, me.id]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/connect'));

  if (!game) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-paper px-8" style={{ paddingTop: insets.top }}>
        <Display light italic className="text-center text-lead text-ink-soft">
          {loading ? 'Setting up the board…' : 'This game isn’t here any more.'}
        </Display>
        {!loading ? <Button variant="secondary" onPress={back}>Back to Connect</Button> : null}
      </View>
    );
  }

  const info = GAME_INFO[game.kind];
  const mySeat = seatOf(game, me.id);
  const players = (game.state as { players: [string, string] }).players;
  const slots: SeatSlots = [players[0] === me.id ? mySlot : partnerSlot, players[1] === me.id ? mySlot : partnerSlot];
  const myTurn = game.status === 'active' && game.turn === me.id;
  const over = game.status !== 'active';
  const iWon = game.winner === me.id;
  const together = game.kind === 'wordchain' && game.status === 'draw';
  const kindScore = gameScore(games, me.id, game.kind);
  const canPlay = myTurn && !busy ? mySeat : null;

  const play = async (m: GameMove) => {
    if (busy || !myTurn || mySeat === null) return;
    setBusy(true);
    setError(null);
    try {
      const g = await move(game, m);
      if (g.status !== 'active') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setError(e instanceof IllegalMove ? e.message : /game_moved_on|not_your_turn/.test(String((e as Error).message)) ? 'The board changed. Here’s the latest.' : 'That move didn’t go through. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const rematch = async () => {
    const g = await start(game.kind);
    router.replace(`/play/${g.id}`);
  };

  const giveUp = () =>
    Alert.alert(game.kind === 'wordchain' ? 'Out of words?' : 'Give up this game?', `${partner.display_name} wins this one.`, [
      { text: 'Keep playing', style: 'cancel' },
      { text: game.kind === 'wordchain' ? 'I’m stuck' : 'Give up', style: 'destructive', onPress: () => void resign(game.id).catch(() => setError('Couldn’t end the game. Try again.')) },
    ]);

  const status = over
    ? together
      ? `You made a ${CHAIN_GOAL}-word chain together 🎉`
      : game.status === 'draw'
        ? 'It’s a draw'
        : iWon
          ? game.status === 'abandoned'
            ? `${partner.display_name} gave up. You win 🏆`
            : 'You win 🏆'
          : game.status === 'abandoned'
            ? `You gave up. ${partner.display_name} wins`
            : `${partner.display_name} wins`
    : myTurn
      ? 'Your turn'
      : `${partner.display_name}’s turn`;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-paper">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }} contentContainerClassName="gap-5 px-5">
        <View className="flex-row items-center gap-3">
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} className="h-11 w-11 items-center justify-center rounded-[14px] bg-paper-raised">
            <ArrowLeft size={20} color={c.inkSoft} />
          </Pressable>
          <View className="flex-1">
            <Text className="font-sans-semibold text-micro uppercase tracking-[1px] text-teal-700">Play</Text>
            <Display className="text-[24px] leading-[30px]" numberOfLines={1}>{`${info.emoji} ${info.title}`}</Display>
          </View>
          {!over ? (
            <Pressable accessibilityRole="button" accessibilityLabel={game.kind === 'wordchain' ? 'I’m stuck' : 'Give up'} onPress={giveUp} className="h-11 flex-row items-center gap-1.5 rounded-full px-3 active:bg-paper-sunken">
              <Flag size={16} color={c.inkSoft} />
              <Text className="text-small text-ink-soft">{game.kind === 'wordchain' ? 'Stuck' : 'Give up'}</Text>
            </Pressable>
          ) : null}
        </View>

        <View className="flex-row items-center justify-between gap-2 rounded-[22px] border border-paper-edge bg-paper-raised px-3.5 py-3">
          <Player label="You" name={me.display_name} slot={mySlot} active={myTurn} wins={kindScore.me} />
          <Text className={cn('flex-1 text-center font-sans-semibold text-body', myTurn ? 'text-rose-700' : over ? 'text-ink' : 'text-ink-soft')} accessibilityLiveRegion="polite">
            {status}
          </Text>
          <Player label={partner.display_name} name={partner.display_name} slot={partnerSlot} active={!over && !myTurn} wins={kindScore.partner} online={partnerOnline} right />
        </View>

        {game.kind === 'tictactoe' ? <TicTacToeBoard state={game.state as TicTacToe} slots={slots} canPlay={canPlay} onMove={play} /> : null}
        {game.kind === 'connect4' ? <ConnectFourBoard state={game.state as ConnectFour} slots={slots} canPlay={canPlay} onMove={play} /> : null}
        {game.kind === 'wordchain' ? <WordChainBoard state={game.state as WordChain} slots={slots} canPlay={canPlay} onMove={play} /> : null}

        {error ? <Text className="text-center text-small text-rose-700">{error}</Text> : null}
        {over ? (
          <View className="items-center">
            <Button icon={<RotateCcw size={18} color="#fff" />} onPress={() => void rematch()}>
              Rematch
            </Button>
          </View>
        ) : null}
      </ScrollView>
      {over && (iWon || together) ? <Confetti key={game.id} /> : null}
    </KeyboardAvoidingView>
  );
}

function Player({ label, name, slot, active, wins, online, right }: { label: string; name: string; slot: 'a' | 'b'; active: boolean; wins: number; online?: boolean; right?: boolean }) {
  return (
    <View className={cn('w-[84px] items-center gap-1', right && 'items-center')}>
      <View style={{ transform: [{ scale: active ? 1.12 : 1 }] }}>
        <Avatar name={name} slot={slot} size="sm" online={online} />
      </View>
      <Text numberOfLines={1} className="font-sans-semibold text-micro text-ink">
        {label}
      </Text>
      <Text className="text-micro text-ink-muted">{`${wins} ${wins === 1 ? 'win' : 'wins'}`}</Text>
    </View>
  );
}

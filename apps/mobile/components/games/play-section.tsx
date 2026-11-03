import { GAME_INFO, QUIZ_INFO, quizState, type GameKind, type QuizKind } from '@us/shared';
import { useCouple, useFeature, useGames, useQuizzes } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { cn } from '../ui/cn';
import { FormSheet } from '../ui/form-sheet';
import { Display, Text } from '../ui/text';

const GAME_TINT: Record<GameKind, string> = {
  tictactoe: 'border-rose-100 bg-rose-50',
  connect4: 'border-plum-100 bg-plum-50',
  wordchain: 'border-gold-100 bg-gold-50',
};
const QUIZ_TINT: Record<QuizKind, string> = {
  know_me: 'border-teal-100 bg-teal-50',
  this_or_that: 'border-sage-100 bg-sage-50',
};

/** Connect's Play area: the games and quizzes, what's waiting on me, and our score. */
export function PlaySection() {
  const gamesOn = useFeature('games');
  const quizzesOn = useFeature('quizzes');
  const { me, partner } = useCouple();
  const games = useGames(gamesOn);
  const quizzes = useQuizzes(quizzesOn);
  const [busy, setBusy] = useState(false);
  const [knowMe, setKnowMe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!gamesOn && !quizzesOn) return null;

  const run = async (go: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      router.push((await go()) as never);
    } catch {
      setError('Couldn’t start that. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const openGame = (kind: GameKind) => {
    const going = games.active.find((g) => g.kind === kind);
    if (going) return router.push(`/play/${going.id}` as never);
    void run(async () => `/play/${(await games.start(kind)).id}`);
  };
  const openQuiz = (kind: QuizKind, subject?: string) => void run(async () => `/play/quiz/${await quizzes.start(kind, subject)}`);

  const waiting = [
    ...games.active.map((g) => ({
      key: g.id,
      href: `/play/${g.id}`,
      title: `${GAME_INFO[g.kind].emoji} ${GAME_INFO[g.kind].title}`,
      line: g.turn === me.id ? 'Your move' : `${partner.display_name}’s move`,
      mine: g.turn === me.id,
      at: g.updated_at,
    })),
    ...quizzes.rounds
      .filter((r) => quizState(r) !== 'revealed')
      .map((r) => ({
        key: r.id,
        href: `/play/quiz/${r.id}`,
        title: `${QUIZ_INFO[r.kind].emoji} ${r.kind === 'know_me' ? 'Know me' : 'This or that'}`,
        line: quizState(r) === 'mine' ? 'Your turn to answer' : `Waiting for ${partner.display_name}`,
        mine: quizState(r) === 'mine',
        at: r.created_at,
      })),
  ].sort((a, b) => Number(b.mine) - Number(a.mine) || b.at.localeCompare(a.at));
  const { me: myWins, partner: theirWins } = games.score;

  const tiles: { key: string; tint: string; emoji: string; title: string; line: string; hot?: boolean; onPress: () => void }[] = [
    ...(gamesOn
      ? (Object.keys(GAME_INFO) as GameKind[]).map((kind) => {
          const hot = games.active.some((g) => g.kind === kind && g.turn === me.id);
          return { key: kind, tint: GAME_TINT[kind], emoji: GAME_INFO[kind].emoji, title: GAME_INFO[kind].title, line: hot ? 'Your move' : GAME_INFO[kind].blurb, hot, onPress: () => openGame(kind) };
        })
      : []),
    ...(quizzesOn
      ? (Object.keys(QUIZ_INFO) as QuizKind[]).map((kind) => ({
          key: kind,
          tint: QUIZ_TINT[kind],
          emoji: QUIZ_INFO[kind].emoji,
          title: kind === 'know_me' ? 'Know me?' : QUIZ_INFO[kind].title,
          line: QUIZ_INFO[kind].blurb,
          onPress: () => (kind === 'know_me' ? setKnowMe(true) : openQuiz(kind)),
        }))
      : []),
  ];

  return (
    <View className="gap-3">
      <View className="flex-row items-baseline justify-between">
        <Display className="text-heading">Play</Display>
        {gamesOn && myWins + theirWins > 0 ? <Text className="text-small text-ink-soft">{`You ${myWins} · ${theirWins} ${partner.display_name}`}</Text> : null}
      </View>

      {waiting.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2.5">
          {waiting.slice(0, 8).map((w) => (
            <Pressable
              key={w.key}
              accessibilityRole="button"
              onPress={() => router.push(w.href as never)}
              className={cn('rounded-[18px] border px-3.5 py-2.5 active:opacity-80', w.mine ? 'border-rose-200 bg-rose-50' : 'border-paper-edge bg-paper-raised')}
            >
              <Text className="font-sans-semibold text-small text-ink">{w.title}</Text>
              <Text className={cn('text-micro', w.mine ? 'font-sans-semibold text-rose-700' : 'text-ink-soft')}>{w.line}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View className="flex-row flex-wrap justify-between gap-y-3">
        {tiles.map((t) => (
          <Pressable
            key={t.key}
            accessibilityRole="button"
            accessibilityLabel={`${t.title}. ${t.line}`}
            disabled={busy}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => {});
              t.onPress();
            }}
            className={cn('h-[124px] w-[48.5%] justify-between rounded-[24px] border p-4 active:scale-[0.98]', t.tint, busy && 'opacity-60')}
          >
            <Text className="text-[28px] leading-[34px]">{t.emoji}</Text>
            <View className="gap-0.5">
              <Display className="text-[17px] leading-[21px]" numberOfLines={1}>
                {t.title}
              </Display>
              <Text className={cn('text-micro', t.hot ? 'font-sans-semibold text-rose-700' : 'text-ink-soft')} numberOfLines={1}>
                {t.line}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      {error ? <Text className="text-small text-rose-700">{error}</Text> : null}

      <FormSheet open={knowMe} title="How well do you know me?" onClose={() => setKnowMe(false)} centered>
        <View className="gap-2.5">
          <Text className="text-small text-ink-soft">One of you answers about yourself, the other guesses. Ten questions.</Text>
          {[
            { title: 'About me', line: `I answer, ${partner.display_name} guesses`, subject: me.id },
            { title: `About ${partner.display_name}`, line: `${partner.display_name} answers, I guess`, subject: partner.id },
          ].map((o) => (
            <Pressable
              key={o.subject}
              accessibilityRole="button"
              onPress={() => {
                setKnowMe(false);
                openQuiz('know_me', o.subject);
              }}
              className="rounded-[18px] border-2 border-paper-edge px-4 py-3 active:border-teal-400 active:bg-teal-50"
            >
              <Text className="font-sans-semibold text-body text-ink">{o.title}</Text>
              <Text className="text-small text-ink-soft">{o.line}</Text>
            </Pressable>
          ))}
        </View>
      </FormSheet>
    </View>
  );
}

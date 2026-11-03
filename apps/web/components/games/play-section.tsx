'use client';

import { GAME_INFO, QUIZ_INFO, quizState, type GameKind, type QuizKind } from '@us/shared';
import { useCouple, useFeature, useGames, useQuizzes } from '@us/shared/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';

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
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [knowMe, setKnowMe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!gamesOn && !quizzesOn) return null;

  const run = async (go: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      router.push(await go());
    } catch {
      setError('Couldn’t start that. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const openGame = (kind: GameKind) => {
    // Carry on with a game of this kind that's still going, rather than starting another.
    const going = games.active.find((g) => g.kind === kind);
    if (going) return router.push(`/connect/play/${going.id}`);
    void run(async () => `/connect/play/${(await games.start(kind)).id}`);
  };
  const openQuiz = (kind: QuizKind, subject?: string) => void run(async () => `/connect/play/quiz/${await quizzes.start(kind, subject)}`);

  const waiting = [
    ...games.active.map((g) => ({
      key: g.id,
      href: `/connect/play/${g.id}`,
      title: `${GAME_INFO[g.kind].emoji} ${GAME_INFO[g.kind].title}`,
      line: g.turn === me.id ? 'Your move' : `${partner.display_name}’s move`,
      mine: g.turn === me.id,
      at: g.updated_at,
    })),
    ...quizzes.rounds
      .filter((r) => quizState(r) !== 'revealed')
      .map((r) => ({
        key: r.id,
        href: `/connect/play/quiz/${r.id}`,
        title: `${QUIZ_INFO[r.kind].emoji} ${QUIZ_INFO[r.kind].title}`,
        line: quizState(r) === 'mine' ? 'Your turn to answer' : `Waiting for ${partner.display_name}`,
        mine: quizState(r) === 'mine',
        at: r.created_at,
      })),
  ].sort((a, b) => Number(b.mine) - Number(a.mine) || b.at.localeCompare(a.at));
  const { me: myWins, partner: theirWins } = games.score;

  return (
    <section id="play" aria-labelledby="play-title" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="play-title" className="font-display text-heading text-ink">
          Play
        </h2>
        {gamesOn && myWins + theirWins > 0 ? (
          <span className="text-small text-ink-soft">
            You <b className="text-ink">{myWins}</b> · <b className="text-ink">{theirWins}</b> {partner.display_name}
          </span>
        ) : null}
      </div>

      {waiting.length ? (
        <ul className="flex gap-2.5 overflow-x-auto pb-1">
          {waiting.slice(0, 8).map((w) => (
            <li key={w.key} className="shrink-0">
              <Link
                href={w.href}
                className={cn('flex flex-col rounded-[18px] border px-3.5 py-2.5', w.mine ? 'border-rose-200 bg-rose-50' : 'border-paper-edge bg-paper-raised')}
              >
                <span className="text-small font-semibold text-ink">{w.title}</span>
                <span className={cn('text-micro', w.mine ? 'font-semibold text-rose-700' : 'text-ink-soft')}>{w.line}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        {gamesOn
          ? (Object.keys(GAME_INFO) as GameKind[]).map((kind) => (
              <Tile
                key={kind}
                tint={GAME_TINT[kind]}
                emoji={GAME_INFO[kind].emoji}
                title={GAME_INFO[kind].title}
                line={games.active.some((g) => g.kind === kind && g.turn === me.id) ? 'Your move' : GAME_INFO[kind].blurb}
                hot={games.active.some((g) => g.kind === kind && g.turn === me.id)}
                disabled={busy}
                onClick={() => openGame(kind)}
              />
            ))
          : null}
        {quizzesOn
          ? (Object.keys(QUIZ_INFO) as QuizKind[]).map((kind) => (
              <Tile
                key={kind}
                tint={QUIZ_TINT[kind]}
                emoji={QUIZ_INFO[kind].emoji}
                title={QUIZ_INFO[kind].title}
                line={QUIZ_INFO[kind].blurb}
                disabled={busy}
                onClick={() => (kind === 'know_me' ? setKnowMe(true) : openQuiz(kind))}
              />
            ))
          : null}
      </div>
      {error ? <p className="text-small text-rose-700">{error}</p> : null}

      <Dialog open={knowMe} onOpenChange={setKnowMe} title="How well do you know me?" description="One of you answers about yourself, the other guesses. Ten questions.">
        <div className="grid gap-2.5">
          <ChoiceButton
            title="About me"
            line={`I answer, ${partner.display_name} guesses`}
            onClick={() => {
              setKnowMe(false);
              openQuiz('know_me', me.id);
            }}
          />
          <ChoiceButton
            title={`About ${partner.display_name}`}
            line={`${partner.display_name} answers, I guess`}
            onClick={() => {
              setKnowMe(false);
              openQuiz('know_me', partner.id);
            }}
          />
        </div>
      </Dialog>
    </section>
  );
}

function Tile({ tint, emoji, title, line, hot, disabled, onClick }: { tint: string; emoji: string; title: string; line: string; hot?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative flex h-[132px] flex-col justify-between overflow-hidden rounded-[24px] border p-4 text-left transition-transform active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
        tint,
      )}
    >
      <span className="text-[30px] leading-none" aria-hidden>
        {emoji}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-display text-[17px] leading-[21px] text-ink">{title}</span>
        <span className={cn('text-micro', hot ? 'font-semibold text-rose-700' : 'text-ink-soft')}>{line}</span>
      </span>
    </button>
  );
}

function ChoiceButton({ title, line, onClick }: { title: string; line: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[18px] border-2 border-paper-edge px-4 py-3 text-left hover:border-teal-400 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
    >
      <span className="block font-semibold text-ink">{title}</span>
      <span className="block text-small text-ink-soft">{line}</span>
    </button>
  );
}

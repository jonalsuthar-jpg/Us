'use client';

import {
  addDrawWord,
  answerGuess,
  checkSecret,
  DRAW_TOPIC,
  hintsShown,
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
  ROUNDS,
  saveGuessTurn,
  startDrawGame,
  turnMeta,
  turnWord,
  TURN_MS,
  type Difficulty,
  type DrawingFile,
  type DrawWord,
  type GameState,
  type PackId,
  type Word,
} from '@us/shared';
import { useCouple, useDrawGame, useDrawGames, useDrawHub, useDrawSession } from '@us/shared/react';
import { ArrowLeft, Clock, Send, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Spinner } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { Board } from './board';
import { useLocalSession } from './doodle-dialog';
import { useSaveDrawing } from './hooks';
import { renderPng } from './render';
import { Replay } from './replay';
import { Toolbar } from './toolbar';

const LEVEL_CHIP: Record<Difficulty, string> = {
  easy: 'bg-sage-100 text-sage-700',
  medium: 'bg-gold-100 text-gold-700',
  hard: 'bg-rose-100 text-rose-700',
};

/** Ticks every quarter second while `on`. */
function useNow(on = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

function Blanks({ cells, size = 'md' }: { cells: string[]; size?: 'md' | 'lg' }) {
  const words = cells.join('').split(' ');
  let i = 0;
  return (
    <span aria-hidden className="flex flex-wrap justify-center gap-x-4 gap-y-2">
      {words.map((w, wi) => {
        const start = i;
        i += w.length + 1;
        return (
          <span key={wi} className="flex gap-1.5">
            {[...w].map((ch, ci) => (
              <span
                key={start + ci}
                className={cn(
                  'border-b-[3px] border-gold-700 text-center font-bold text-gold-700',
                  size === 'lg' ? 'h-8 w-[26px] text-[22px] leading-8' : 'h-7 w-[22px] text-[19px] leading-7',
                )}
              >
                {ch === '_' ? '' : ch}
              </span>
            ))}
          </span>
        );
      })}
    </span>
  );
}

function Timer({ ms, total, label }: { ms: number; total: number; label: string }) {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  const pct = Math.max(0, Math.min(1, ms / total));
  return (
    <span role="timer" aria-label={label} className="relative flex h-14 w-14 items-center justify-center">
      <svg viewBox="0 0 56 56" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="28" cy="28" r="24" fill="none" stroke="#FFEDC0" strokeWidth="5" />
        <circle cx="28" cy="28" r="24" fill="none" stroke="#F3A823" strokeWidth="5" strokeDasharray={`${pct * 150.8} 150.8`} strokeLinecap="round" />
      </svg>
      <span className="font-bold text-gold-700">{secs}</span>
    </span>
  );
}

function RoundBar({ round, rounds }: { round: number; rounds: number }) {
  return (
    <div aria-label={`Round ${round + 1} of ${rounds}`} className="flex flex-[0_1_220px] gap-1.5">
      {Array.from({ length: rounds }, (_, i) => (
        <span key={i} className={cn('h-1.5 flex-1 rounded-full', i < round ? 'bg-gold-400' : i === round ? 'bg-gold-700' : 'bg-gold-200')} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ page ---

export function GuessGame() {
  const game = useDrawGame();
  const s = game.state;
  const turns = useDrawGames();
  const [turnMode, setTurnMode] = useState<null | 'draw' | 'guess'>(null);

  if (turnMode === 'draw' && turns.open) return <TurnDraw gameId={turns.open.id} round={turns.open.played} packs={turns.open.packs as PackId[]} onDone={() => setTurnMode(null)} />;
  if (turnMode === 'guess' && turns.toGuess) return <TurnGuess drawingId={turns.toGuess.id} strokesPath={turns.toGuess.strokes_path} onDone={() => setTurnMode(null)} />;
  if (s && s.phase !== 'left' && !(s.phase === 'done' && s.results.length === 0)) {
    if (s.phase === 'invited') return <Invited state={s} />;
    if (s.phase === 'done') return <Results state={s} />;
    return <LiveRound state={s} />;
  }
  return <Lobby onTurn={setTurnMode} left={s?.phase === 'left' ? s.leftBy : null} />;
}

// ----------------------------------------------------------------- lobby ---

function Lobby({ onTurn, left }: { onTurn: (m: 'draw' | 'guess') => void; left: string | null }) {
  const { sb, couple, me, partner, partnerOnline } = useCouple();
  const game = useDrawGame();
  const turns = useDrawGames();
  const [packs, setPacks] = useState<PackId[]>(['everyday', 'food']);
  const [words, setWords] = useState<DrawWord[]>([]);
  const [newWord, setNewWord] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const name = partner.display_name;

  useEffect(() => {
    void listDrawWords(sb, couple.id).then(setWords).catch(() => {});
  }, [sb, couple.id]);

  async function startTurns() {
    setBusy('turns');
    try {
      await startDrawGame(sb, { coupleId: couple.id, me: me.id, mode: 'turns', packs, rounds: ROUNDS });
      turns.reload();
      onTurn('draw');
    } finally {
      setBusy(null);
    }
  }

  const toggle = (p: PackId) => setPacks((cur) => (cur.includes(p) ? (cur.length > 1 ? cur.filter((x) => x !== p) : cur) : [...cur, p]));

  return (
    <div className="mx-auto max-w-[920px] space-y-6 px-5 py-8 sm:px-6">
      <header className="space-y-1.5">
        <Link href="/connect" className="inline-flex items-center gap-1 text-small font-semibold text-gold-700 hover:text-gold-800">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Connect
        </Link>
        <h1 className="font-display text-[34px] leading-[40px] text-ink">Draw &amp; Guess</h1>
        <p className="font-serif text-lead font-light italic text-ink-soft">Six rounds, one team. One of you draws, the other guesses, then you swap.</p>
      </header>

      {left ? <p className="rounded-[16px] bg-paper-sunken px-4 py-3 text-small text-ink-soft">{left === me.id ? 'You left the game.' : `${name} left the game.`}</p> : null}

      {turns.toGuess || turns.myTurnToDraw ? (
        <div className="flex flex-wrap items-center gap-4 rounded-[20px] bg-plum-800 p-5 text-paper">
          <div className="min-w-0 flex-1">
            <p className="text-micro font-bold uppercase tracking-[0.06em] text-gold-200">Game in turns · round {(turns.open?.played ?? 0) + 1} of {turns.open?.rounds}</p>
            <p className="font-display text-heading">{turns.toGuess ? `${name} drew something. Your turn to guess` : 'Your turn to draw'}</p>
          </div>
          <Button className="bg-gold-400 text-gold-900 hover:bg-gold-300" onClick={() => onTurn(turns.toGuess ? 'guess' : 'draw')}>
            {turns.toGuess ? 'Guess it' : 'Draw now'}
          </Button>
        </div>
      ) : turns.open ? (
        <p className="rounded-[16px] bg-paper-sunken px-4 py-3 text-small text-ink-soft">
          Game in turns: waiting for {name} ({turns.open.played} of {turns.open.rounds} rounds played, {turns.open.score} points so far).
        </p>
      ) : null}

      <section className="space-y-3 rounded-[24px] bg-gold-50 p-5">
        <h2 className="font-display text-lead text-ink">Word packs</h2>
        <div className="flex flex-wrap gap-2">
          {PACKS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={packs.includes(p.id)}
              onClick={() => toggle(p.id)}
              className={cn(
                'flex flex-col rounded-[16px] border px-3.5 py-2.5 text-left',
                packs.includes(p.id) ? 'border-gold-400 bg-paper-raised' : 'border-gold-100 bg-transparent opacity-70 hover:opacity-100',
              )}
            >
              <span className="text-body font-semibold text-ink">{p.name}</span>
              <span className="text-micro text-ink-soft">{p.id === 'ours' ? `${words.length} words + memory titles` : p.blurb}</span>
            </button>
          ))}
        </div>
        {packs.includes('ours') ? (
          <div className="space-y-2.5">
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const w = newWord.trim();
                if (!w) return;
                try {
                  const row = await addDrawWord(sb, couple.id, me.id, w);
                  setWords((cur) => [row, ...cur]);
                  setNewWord('');
                } catch {
                  /* a duplicate: ignore */
                }
              }}
            >
              <label htmlFor="new-word" className="sr-only">
                Add a word
              </label>
              <input
                id="new-word"
                value={newWord}
                maxLength={40}
                onChange={(e) => setNewWord(e.target.value)}
                placeholder="Our Goa trip, Mumbai rains, your mum’s dal…"
                className="h-11 min-w-0 flex-1 rounded-control border border-paper-edge bg-paper-raised px-3.5 text-body text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-gold-300"
              />
              <Button type="submit" variant="secondary">
                Add
              </Button>
            </form>
            {words.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {words.map((w) => (
                  <li key={w.id} className="inline-flex items-center gap-1 rounded-full bg-paper-raised py-1 pl-3 pr-1 text-small text-ink">
                    {w.word}
                    <button
                      type="button"
                      aria-label={`Remove ${w.word}`}
                      onClick={() => {
                        setWords((cur) => cur.filter((x) => x.id !== w.id));
                        void removeDrawWord(sb, w.id).catch(() => {});
                      }}
                      className="rounded-full p-1 text-ink-muted hover:bg-paper-sunken hover:text-ink"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={!partnerOnline || !!busy}
          onClick={async () => {
            setBusy('live');
            await game.invite(packs);
            setBusy(null);
          }}
          className="flex flex-col gap-1 rounded-[24px] bg-gold-400 p-5 text-left text-gold-900 transition-transform active:scale-[0.99] disabled:opacity-60"
        >
          <span className="font-display text-heading">{busy === 'live' ? 'Starting…' : 'Play live'}</span>
          <span className="text-small">{partnerOnline ? `${name} is in Us now. Play together, ${ROUNDS} rounds.` : `${name} isn’t in Us right now.`}</span>
        </button>
        <button
          type="button"
          disabled={!!busy || !!turns.open}
          onClick={() => void startTurns()}
          className="flex flex-col gap-1 rounded-[24px] border border-gold-200 bg-paper-raised p-5 text-left transition-transform active:scale-[0.99] disabled:opacity-60"
        >
          <span className="font-display text-heading text-ink">{busy === 'turns' ? 'Starting…' : 'Play in turns'}</span>
          <span className="text-small text-ink-soft">{turns.open ? 'Finish the game you have going first.' : `Draw yours now; ${name} guesses whenever they open Us.`}</span>
        </button>
      </div>
      {game.error ? <p role="alert" className="text-small text-rose-700">{game.error}</p> : null}

      <section className="grid grid-cols-3 gap-2.5">
        <Stat value={turns.stats.played} label="games played" />
        <Stat value={turns.stats.best} label="best team score" />
        <Stat value={turns.stats.fastestMs != null ? `${Math.max(1, Math.round(turns.stats.fastestMs / 1000))} s` : '–'} label={turns.stats.fastestWord ? `fastest: ${turns.stats.fastestWord}` : 'fastest guess'} />
      </section>
    </div>
  );
}

function Stat({ value, label, night }: { value: string | number; label: string; night?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-0.5 rounded-[16px] p-3', night ? 'bg-plum-700' : 'bg-paper-sunken')}>
      <span className={cn('font-display text-heading', night ? 'text-paper' : 'text-ink')}>{value}</span>
      <span className={cn('truncate text-[12px]', night ? 'text-plum-200' : 'text-ink-soft')}>{label}</span>
    </div>
  );
}

// --------------------------------------------------------------- invited ---

function Invited({ state }: { state: GameState }) {
  const { me, partner, sb } = useCouple();
  const game = useDrawGame();
  const [nudged, setNudged] = useState(false);
  const mine = state.players[0] === me.id;
  useEffect(() => {
    if (mine) game.resendInvite();
  }, [mine, game]);
  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-center gap-4 px-5 py-16 text-center">
      <span className="flex gap-1.5" aria-hidden>
        {['_', 'a', '_', '_'].map((c, i) => (
          <span key={i} className="h-8 w-[26px] border-b-[3px] border-gold-700 text-[22px] font-bold leading-8 text-gold-700">
            {c === '_' ? '' : c}
          </span>
        ))}
      </span>
      <h1 className="font-display text-title text-ink">{mine ? `Waiting for ${partner.display_name}…` : `${partner.display_name} wants to play Draw & Guess`}</h1>
      <p className="text-body text-ink-soft">{state.packs.map((p) => PACKS.find((x) => x.id === p)?.name).join(' · ')} · {state.rounds} rounds</p>
      {mine ? (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={nudged}
            onClick={() => {
              setNudged(true);
              void notifyPartner(sb, { category: 'draw_invite', game: true });
            }}
          >
            {nudged ? 'Notification sent' : 'Send a notification'}
          </Button>
          <Button variant="quiet" onClick={() => game.leave()}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="lg" className="bg-gold-400 text-gold-900 hover:bg-gold-300" onClick={() => void game.join()}>
            Join the game
          </Button>
          <Button variant="quiet" onClick={() => game.leave()}>
            Not now
          </Button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- live round ---

function LiveRound({ state: s }: { state: GameState }) {
  const { me, partner, partnerSlot } = useCouple();
  const game = useDrawGame();
  const { session, state, cursor } = useDrawSession(roundCanvas(s.id, s.round));
  const drawer = s.drawer === me.id;
  const now = useNow();
  const [tool, setTool] = useState<'pen' | 'marker' | 'eraser'>('pen');
  const [color, setColor] = useState(0);
  const [text, setText] = useState('');
  const [flash, setFlash] = useState<null | 'close' | 'wrong'>(null);
  const name = partner.display_name;
  const left = s.until - now;
  const cells = s.secret ? maskWith(s.secret.mask, s.revealed) : [];
  const nextHint = s.phase === 'drawing' ? 20_000 - ((now - s.startedAt) % 20_000) : 0;
  const myGuesses = s.guesses.filter((g) => g.by === me.id);

  const header = (
    <header className="flex flex-wrap items-center gap-4 border-b border-gold-100 bg-paper-raised px-5 py-3.5 sm:px-6">
      <h1 className="font-display text-heading text-ink">Draw &amp; Guess</h1>
      <RoundBar round={s.round} rounds={s.rounds} />
      <span className="text-small text-ink-soft">
        Round {s.round + 1} of {s.rounds}
      </span>
      <span className="ml-auto inline-flex h-10 items-center rounded-full bg-gold-100 px-3.5 font-bold text-gold-700">Team {s.score}</span>
      <Button variant="secondary" size="sm" onClick={() => game.leave()}>
        Leave game
      </Button>
    </header>
  );

  if (s.phase === 'choosing') {
    return (
      <div className="min-h-dvh bg-gold-50">
        {header}
        <div className="mx-auto flex max-w-[520px] flex-col items-center gap-2 px-5 py-10 text-center">
          <span className="text-micro font-bold uppercase tracking-[0.06em] text-gold-700">Round {s.round + 1} · {drawer ? 'your turn to draw' : `${name} draws`}</span>
          <h2 className="font-display text-title text-ink">{drawer ? 'Pick a word' : `${name} is picking a word…`}</h2>
          {drawer ? (
            <>
              <p className="font-serif text-lead font-light italic text-ink-soft">{name} can’t see it. Harder words score more.</p>
              <div className="mt-5 flex w-full flex-col gap-3">
                {s.choices.map((w) => (
                  <WordCard key={w.text} word={w} onPick={() => game.pick(w)} />
                ))}
              </div>
            </>
          ) : null}
          <div className="mt-6">
            <Timer ms={left} total={10_000} label={`${Math.ceil(left / 1000)} seconds to choose`} />
          </div>
          {drawer ? <p className="text-micro text-ink-muted">Picks one for you when time’s up</p> : null}
        </div>
      </div>
    );
  }

  const revealing = s.phase === 'reveal';
  const last = s.results[s.results.length - 1];

  return (
    <div className="min-h-dvh bg-gold-50">
      {header}
      <main className="mx-auto flex max-w-[1180px] flex-wrap items-start justify-center gap-6 p-4 sm:p-6">
        <section className="flex w-full flex-col gap-3 md:w-[220px]">
          {drawer ? (
            <div className="flex flex-col gap-1.5 rounded-[20px] bg-plum-800 p-[18px] text-paper">
              <span className="text-micro font-bold uppercase tracking-[0.06em] text-gold-200">You’re drawing</span>
              <span className="font-display text-[30px] leading-[34px]">{s.word}</span>
              <span className="text-micro text-plum-200">
                {PACKS.find((p) => p.id === s.pack)?.name} · {s.level ? LEVEL_NAME[s.level].toLowerCase() : ''}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-[20px] bg-paper-raised p-4">
              <span className="text-micro font-bold text-ink-muted">{name} is drawing</span>
              <Blanks cells={cells} />
            </div>
          )}
          <div className="flex items-center gap-3.5 rounded-[20px] bg-paper-raised p-4">
            <Timer ms={revealing ? 0 : left} total={TURN_MS} label={`${Math.ceil(left / 1000)} seconds left`} />
            <span className="text-micro leading-[19px] text-ink-soft">{hintsShown(now - s.startedAt) < 3 && !revealing ? `Next letter shows in ${Math.ceil(nextHint / 1000)} s` : 'No more hints'}</span>
          </div>
          {drawer ? (
            <div className="flex flex-col gap-2 rounded-[20px] bg-paper-raised p-4">
              <span className="text-micro font-bold text-ink-muted">{name} sees</span>
              <span className="font-display text-heading tracking-[0.25em] text-gold-700">{cells.join('')}</span>
            </div>
          ) : null}
        </section>

        <div className="relative min-w-0 flex-[0_1_500px]">
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
            label={drawer ? `Your drawing of ${s.word}` : `${name}’s drawing`}
          />
          {revealing && last ? (
            <div className="absolute inset-0 flex items-center justify-center rounded-[24px] bg-plum-900/50 p-6 backdrop-blur-[2px]">
              <div className="w-full max-w-[320px] rounded-[24px] bg-paper-raised p-6 text-center shadow-xl">
                <p className="text-micro font-bold uppercase tracking-[0.06em] text-gold-700">{last.solved ? 'Got it!' : 'Time’s up'}</p>
                <p className="mt-1 font-display text-title text-ink">{last.word}</p>
                <p className="mt-1 text-body text-ink-soft">{last.solved ? `+${last.points} each, in ${Math.round(last.ms / 1000)} s` : 'No points this round'}</p>
              </div>
            </div>
          ) : null}
          {drawer ? (
            <Toolbar
              tool={tool}
              onTool={setTool}
              color={color}
              onColor={setColor}
              onUndo={() => session.undo()}
              canUndo={session.canUndo}
              orientation="horizontal"
              colors={[0, 1, 2, 4, 5, 7]}
              className="mt-3 bg-transparent p-0 shadow-none"
            />
          ) : null}
          {drawer ? <p className="mt-2 text-right text-micro text-ink-muted">No letters or numbers, please.</p> : null}
        </div>

        <aside aria-label={drawer ? `${name}’s guesses` : 'Your guesses'} className="flex w-full flex-col gap-2.5 rounded-[20px] bg-paper-raised p-4 md:max-w-[280px] md:flex-[1_1_240px]">
          <h2 className="flex items-center gap-2 text-body font-bold text-ink">{drawer ? `${name}’s guesses` : 'Your guesses'}</h2>
          <ol className="flex flex-col gap-2">
            {(drawer ? s.guesses : myGuesses).map((g, i) => (
              <li key={i} className="flex items-center gap-2 text-body">
                {g.result === 'wrong' ? (
                  <span className="text-ink-muted line-through">{g.text}</span>
                ) : (
                  <>
                    <span className="font-semibold text-ink">{g.text}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-bold', g.result === 'right' ? 'bg-sage-100 text-sage-700' : 'bg-gold-200 text-gold-800')}>
                      {g.result === 'right' ? 'Got it' : 'So close'}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ol>
          {!drawer && !revealing ? (
            <form
              className="mt-auto flex gap-2 pt-2"
              onSubmit={(e) => {
                e.preventDefault();
                const r = game.guess(text);
                if (r) setText('');
                if (r === 'close' || r === 'wrong') {
                  setFlash(r);
                  setTimeout(() => setFlash(null), 900);
                }
              }}
            >
              <label htmlFor="guess" className="sr-only">
                Your guess
              </label>
              <input
                id="guess"
                autoFocus
                autoComplete="off"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type a guess"
                className={cn(
                  'h-[52px] min-w-0 flex-1 rounded-[14px] border-2 bg-paper-raised px-4 text-lead text-ink focus:outline-none',
                  flash === 'close' ? 'border-gold-500' : flash === 'wrong' ? 'border-rose-300' : 'border-gold-400',
                )}
              />
              <button type="submit" aria-label="Send guess" className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-plum-800 text-paper">
                <Send className="h-5 w-5" aria-hidden />
              </button>
            </form>
          ) : (
            <p className="mt-1.5 text-micro leading-[19px] text-ink-muted">
              {s.level ? `Guessed in the next ${Math.max(0, Math.ceil(left / 1000))} s: +${pointsFor(Math.max(0, now - s.startedAt), s.level)} each. ` : ''}Faster scores more for both of you.
            </p>
          )}
        </aside>
      </main>
    </div>
  );
}

function WordCard({ word, onPick }: { word: Word; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} className="flex items-center gap-3.5 rounded-[20px] bg-paper-raised p-[18px] text-left shadow-[0_6px_18px_rgba(124,80,6,0.08)] transition-transform hover:-translate-y-0.5">
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="font-display text-[22px] text-ink">{word.text}</span>
        <span className="text-micro text-ink-soft">{PACKS.find((p) => p.id === word.pack)?.name}</span>
      </span>
      <span className={cn('rounded-full px-2.5 py-1 text-micro font-bold', LEVEL_CHIP[word.level])}>
        {LEVEL_NAME[word.level]} · {LEVEL_MULT[word.level]}×
      </span>
    </button>
  );
}

// --------------------------------------------------------------- results ---

function Results({ state: s }: { state: GameState }) {
  const { me, partner } = useCouple();
  const game = useDrawGame();
  const { stats, reload } = useDrawGames();
  const save = useSaveDrawing();
  const hub = useDrawHub();
  const [saved, setSaved] = useState<'idle' | 'busy' | 'done'>('idle');
  const solved = s.results.filter((r) => r.solved);
  const fastest = solved.length ? Math.min(...solved.map((r) => r.ms)) : null;
  useEffect(() => reload(), [reload]);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-plum-800 text-paper">
      <span aria-hidden className="absolute -right-24 -top-20 h-[280px] w-[280px] rounded-full bg-gold-400/90" />
      <div className="relative mx-auto flex max-w-[520px] flex-col gap-5 px-5 pb-10 pt-16">
        <div className="space-y-1.5">
          <p className="text-micro font-bold uppercase tracking-[0.06em] text-gold-200">Game over · {s.results.length} rounds</p>
          <h1 className="font-display text-[44px] leading-[48px] tracking-[-0.02em]">{s.score} points</h1>
          <p className="font-serif text-[19px] font-light italic text-plum-200">
            {s.score >= stats.best && s.score > 0 ? 'Your best game yet. ' : ''}
            {solved.length} of {s.results.length} guessed.
          </p>
        </div>
        <ol className="flex flex-col rounded-[20px] bg-plum-700 p-1.5">
          {s.results.map((r) => (
            <li key={r.round} className={cn('flex items-center gap-3 p-2.5', !r.solved && 'text-plum-300')}>
              <span className={cn('h-2 w-2 rounded-full', r.drawer === me.id ? 'bg-rose-400' : 'bg-teal-300')} />
              <span className="flex-1 text-body font-semibold">{r.word}</span>
              <span className="text-micro text-plum-200">{r.solved ? `${Math.round(r.ms / 1000)} s${r.ms === fastest ? ' · fastest' : ''}` : 'time ran out'}</span>
              <span className="w-12 text-right font-bold">{r.solved ? `+${r.points}` : '0'}</span>
            </li>
          ))}
        </ol>
        <div className="grid grid-cols-3 gap-2">
          <Stat night value={stats.played} label="games played" />
          <Stat night value={Math.max(stats.best, s.score)} label="best team score" />
          <Stat night value={fastest != null ? `${Math.max(1, Math.round(fastest / 1000))} s` : '–'} label="fastest guess" />
        </div>
        <div className="flex flex-col gap-2 pt-4">
          <Button size="lg" className="bg-gold-400 text-gold-900 hover:bg-gold-300" onClick={() => void game.invite(s.packs)}>
            Play again
          </Button>
          <Button
            variant="night"
            disabled={saved !== 'idle'}
            onClick={async () => {
              setSaved('busy');
              for (const r of s.results) {
                const strokes = hub.session(roundCanvas(s.id, r.round)).snapshot.strokes;
                if (strokes.length) await save({ kind: 'canvas', strokes, title: `“${r.word}”${r.solved ? ` · ${Math.round(r.ms / 1000)} s` : ''}` }).catch(() => {});
              }
              setSaved('done');
            }}
          >
            {saved === 'done' ? 'Saved to Our drawings' : saved === 'busy' ? 'Saving…' : `Save all ${s.results.length} drawings`}
          </Button>
          <Button variant="quiet" className="text-plum-200 hover:text-paper" onClick={() => game.leave()}>
            Back to Draw &amp; Guess
          </Button>
        </div>
        <p className="text-center text-micro text-plum-300">Played with {partner.display_name}</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ turn mode ---

/** My turn in a game played in turns: pick a word, draw it in 80 s, send it. */
function TurnDraw({ gameId, round, packs, onDone }: { gameId: string; round: number; packs: PackId[]; onDone: () => void }) {
  const { sb, couple, me, partner, channel } = useCouple();
  const { session, state } = useLocalSession();
  const turns = useDrawGames();
  const [choices, setChoices] = useState<Word[]>([]);
  const [word, setWord] = useState<Word | null>(null);
  const [started, setStarted] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState<'pen' | 'marker' | 'eraser'>('pen');
  const [color, setColor] = useState(0);
  const now = useNow(!!word);
  const sent = useRef(false);

  useEffect(() => {
    void (async () => {
      const ours = packs.includes('ours') ? ourWords(await ourWordTexts(sb, couple.id).catch(() => [])) : [];
      setChoices(pickChoices(packs, ours, []));
    })();
  }, [sb, couple.id, packs]);

  async function send() {
    if (!word || sent.current) return;
    sent.current = true;
    setBusy(true);
    session.finish();
    try {
      const strokes = session.snapshot.strokes;
      const png = await renderPng(strokes, null);
      const d = await saveGuessTurn(sb, { coupleId: couple.id, me: me.id, gameId, round, word: word.text, level: word.level, pack: word.pack, strokes, png, ms: Date.now() - started });
      channel.sendChanged(DRAW_TOPIC);
      void notifyPartner(sb, { category: 'guess_turn', drawingId: d.id });
      turns.reload();
      onDone();
    } catch {
      sent.current = false;
      setBusy(false);
    }
  }

  const left = word ? started + TURN_MS - now : TURN_MS;
  useEffect(() => {
    if (word && left <= 0) void send();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!word) {
    return (
      <div className="min-h-dvh bg-gold-50">
        <div className="mx-auto flex max-w-[520px] flex-col items-center gap-2 px-5 py-12 text-center">
          <span className="text-micro font-bold uppercase tracking-[0.06em] text-gold-700">Round {round + 1} · your turn to draw</span>
          <h1 className="font-display text-title text-ink">Pick a word</h1>
          <p className="font-serif text-lead font-light italic text-ink-soft">{partner.display_name} guesses it later, watching your drawing come together.</p>
          <div className="mt-5 flex w-full flex-col gap-3">
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
          </div>
          <Button variant="quiet" className="mt-4" onClick={onDone}>
            Not now
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gold-50">
      <main className="mx-auto flex max-w-[980px] flex-wrap items-start justify-center gap-6 p-4 sm:p-6">
        <section className="flex w-full flex-col gap-3 md:w-[220px]">
          <div className="flex flex-col gap-1.5 rounded-[20px] bg-plum-800 p-[18px] text-paper">
            <span className="text-micro font-bold uppercase tracking-[0.06em] text-gold-200">You’re drawing</span>
            <span className="font-display text-[30px] leading-[34px]">{word.text}</span>
          </div>
          <div className="flex items-center gap-3.5 rounded-[20px] bg-paper-raised p-4">
            <Timer ms={left} total={TURN_MS} label={`${Math.ceil(left / 1000)} seconds left`} />
            <span className="text-micro text-ink-soft">It sends itself when time’s up.</span>
          </div>
          <Button size="lg" loading={busy} onClick={() => void send()}>
            Done, send it
          </Button>
        </section>
        <div className="min-w-0 flex-[0_1_500px]">
          <Board session={session} state={state} tool={tool} color={color} size="m" disabled={busy} label={`Your drawing of ${word.text}`} />
          <Toolbar tool={tool} onTool={setTool} color={color} onColor={setColor} onUndo={() => session.undo()} canUndo={session.canUndo} orientation="horizontal" colors={[0, 1, 2, 4, 5, 7]} className="mt-3 bg-transparent p-0 shadow-none" />
        </div>
      </main>
    </div>
  );
}

/** My partner's turn, replayed: guess before 80 s runs out. */
function TurnGuess({ drawingId, strokesPath, onDone }: { drawingId: string; strokesPath: string; onDone: () => void }) {
  const { sb, partner, channel } = useCouple();
  const turns = useDrawGames();
  const d = turns.toGuess;
  const meta = d ? turnMeta(d) : null;
  const [file, setFile] = useState<DrawingFile | null>(null);
  const [started, setStarted] = useState(0);
  const [text, setText] = useState('');
  const [guesses, setGuesses] = useState<{ text: string; result: 'right' | 'close' | 'wrong' }[]>([]);
  const [result, setResult] = useState<null | { solved: boolean; points: number; ms: number; word: string | null }>(null);
  const now = useNow(!!started && !result);
  const answered = useRef(false);

  useEffect(() => {
    void loadStrokes(sb, strokesPath).then((f) => {
      setFile(f);
      setStarted(Date.now());
    });
  }, [sb, strokesPath]);

  async function finish(solved: boolean) {
    if (answered.current || !meta) return;
    answered.current = true;
    const ms = Math.min(TURN_MS, Date.now() - started);
    const points = solved ? pointsFor(ms, meta.level) : 0;
    await answerGuess(sb, drawingId, solved, ms, points).catch(() => {});
    const word = await turnWord(sb, drawingId).catch(() => null);
    setResult({ solved, points, ms, word });
    channel.sendChanged(DRAW_TOPIC);
  }

  const elapsed = started ? now - started : 0;
  const left = TURN_MS - elapsed;
  useEffect(() => {
    if (started && !result && left <= 0) void finish(false);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const revealed = useMemo(() => {
    const out: Record<number, string> = {};
    meta?.hints.slice(0, hintsShown(elapsed)).forEach((h) => (out[h.i] = h.ch));
    return out;
  }, [meta, elapsed]);

  if (!meta || !file) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gold-50">
        <Spinner className="h-6 w-6 text-gold-500" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gold-50">
      <main className="mx-auto flex max-w-[980px] flex-wrap items-start justify-center gap-6 p-4 sm:p-6">
        <section className="flex w-full flex-col gap-3 md:w-[240px]">
          <div className="flex flex-col items-center gap-3 rounded-[20px] bg-paper-raised p-4">
            <span className="text-micro font-bold text-ink-muted">{partner.display_name} drew this</span>
            <Blanks cells={maskWith(meta.secret.mask, result?.word ? Object.fromEntries([...result.word].map((c, i) => [i, c])) : revealed)} />
          </div>
          <div className="flex items-center gap-3.5 rounded-[20px] bg-paper-raised p-4">
            <Timer ms={result ? 0 : left} total={TURN_MS} label={`${Math.ceil(left / 1000)} seconds left`} />
            <span className="flex items-center gap-1.5 text-micro text-ink-soft">
              <Clock className="h-3.5 w-3.5" aria-hidden /> A letter shows every 20 s
            </span>
          </div>
        </section>
        <div className="min-w-0 flex-[0_1_460px]">
          <Replay file={file} tone="paper" autoPlay />
        </div>
        <aside className="flex w-full flex-col gap-2.5 rounded-[20px] bg-paper-raised p-4 md:max-w-[280px] md:flex-[1_1_240px]">
          {result ? (
            <div className="space-y-2 text-center">
              <p className="text-micro font-bold uppercase tracking-[0.06em] text-gold-700">{result.solved ? 'Got it!' : 'Time’s up'}</p>
              <p className="font-display text-title text-ink">{result.word}</p>
              <p className="text-body text-ink-soft">{result.solved ? `+${result.points} each, in ${Math.round(result.ms / 1000)} s` : 'No points this round'}</p>
              <Button
                block
                className="mt-2"
                onClick={() => {
                  turns.reload();
                  onDone();
                }}
              >
                Your turn to draw
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-body font-bold text-ink">Your guesses</h2>
              <ol className="flex flex-col gap-2">
                {guesses.map((g, i) => (
                  <li key={i} className="flex items-center gap-2 text-body">
                    {g.result === 'wrong' ? (
                      <span className="text-ink-muted line-through">{g.text}</span>
                    ) : (
                      <>
                        <span className="font-semibold">{g.text}</span>
                        <span className="rounded-full bg-gold-200 px-2 py-0.5 text-[12px] font-bold text-gold-800">So close</span>
                      </>
                    )}
                  </li>
                ))}
              </ol>
              <form
                className="flex gap-2 pt-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = text.trim();
                  if (!t) return;
                  const r = checkSecret(t, meta.secret, meta.salt);
                  setText('');
                  if (r === 'right') void finish(true);
                  else setGuesses((g) => [...g, { text: t, result: r }]);
                }}
              >
                <label htmlFor="turn-guess" className="sr-only">
                  Your guess
                </label>
                <input
                  id="turn-guess"
                  autoFocus
                  autoComplete="off"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type a guess"
                  className="h-[52px] min-w-0 flex-1 rounded-[14px] border-2 border-gold-400 bg-paper-raised px-4 text-lead text-ink focus:outline-none"
                />
                <button type="submit" aria-label="Send guess" className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-plum-800 text-paper">
                  <Send className="h-5 w-5" aria-hidden />
                </button>
              </form>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}


'use client';

import { dailyState, quizState, quizVerdict, rateGap, roundScore, type QuizKind, type QuizRound } from '@us/shared';
import { useCouple, useDailyDoodle, useDrawGames, useDrawings, useFeature, usePartnerDrawing, useQuizzes } from '@us/shared/react';
import { ChevronRight, CircleCheck, Images, Mail, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { TodayQuestion, useDaily } from './daily-question';

const QUIZ_ORDER: QuizKind[] = ['this_or_that', 'know_me', 'most_likely', 'rate_it'];

/**
 * Connect, as rows: one wide, glossy card per thing to do, each activity in
 * its own colour. Today's doodle and question are pastel, so they read as
 * "our moment" rather than a game.
 */
export function ConnectRows({ settings }: { settings?: ReactNode }) {
  const draw = useFeature('draw');
  const quizzesOn = useFeature('quizzes');
  const dailyOn = useFeature('daily_question');
  const quizzes = useQuizzes(quizzesOn);
  const doodle = useDailyDoodle(draw);
  const daily = useDaily();
  const { drawings } = useDrawings();

  const today = daily.data?.today;
  const steps = [
    ...(quizzesOn ? QUIZ_ORDER.map((k) => !!quizzes.today[k] && quizState(quizzes.today[k]!) !== 'mine') : []),
    ...(draw ? [doodle.mine] : []),
    ...(dailyOn ? [!!today && today.my_answer !== null] : []),
  ];
  const streak = daily.data?.streak ?? 0;

  return (
    <div className="space-y-8 sm:space-y-10">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="relative inline-block font-display text-[36px] font-extrabold leading-10 tracking-tight text-plum-800 dark:text-ink sm:text-[44px] sm:leading-[1.1]">
            Connect
            <svg aria-hidden viewBox="0 0 20 20" className="absolute -right-5 -top-1 h-5 w-5" fill="none" strokeLinecap="round">
              <path d="M4 12 L8 4" stroke="#F5547C" strokeWidth="3" />
              <path d="M10 14 L16 10" stroke="#F5547C" strokeWidth="3" />
            </svg>
          </h1>
          <p className="mt-1 text-body text-ink-soft">Tell · Play · Draw · Together</p>
          <p className="mt-1 text-micro text-ink-muted">
            <b className="text-ink-soft">
              {steps.filter(Boolean).length} of {steps.length}
            </b>{' '}
            done today{streak > 1 ? ` · ${streak}-day streak` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Mascots />
          {settings}
        </div>
      </header>

      {draw ? (
        <Section title="Play anytime">
          <DrawTogetherRow />
          <DrawGuessRow />
        </Section>
      ) : null}

      {quizzesOn ? (
        <Section title="Daily games" aside="New at midnight">
          {QUIZ_ORDER.map((kind) => (
            <GameRow key={kind} kind={kind} round={quizzes.today[kind]} loading={quizzes.loading} />
          ))}
        </Section>
      ) : null}

      {draw || dailyOn ? (
        <Section title="Today’s moments">
          {draw ? <DoodleRow doodle={doodle} /> : null}
          {dailyOn ? <QuestionRow daily={daily} /> : null}
        </Section>
      ) : null}

      {draw || dailyOn ? (
        <Section title="Ours">
          <div className="grid grid-cols-2 gap-3 md:col-span-2">
            {draw ? <OursLink href="/connect/draw/gallery" count={drawings.length} label={['Our', 'drawings']} tone="text-rose-600" icon={<Images className="h-6 w-6 text-rose-500" aria-hidden />} /> : null}
            {dailyOn ? (
              <OursLink href="/connect/questions" count={daily.data?.together ?? 0} label={['Our', 'answers']} tone="text-teal-700" icon={<CircleCheck className="h-6 w-6 text-teal-500" aria-hidden />} />
            ) : null}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="space-y-3.5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-extrabold uppercase tracking-[0.08em] text-plum-700 dark:text-ink-soft">{title}</h2>
          <span aria-hidden className="mt-1.5 block h-[3px] w-8 rounded-full bg-rose-400" />
        </div>
        {aside ? <span className="pb-1 text-small text-ink-muted">{aside}</span> : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

interface Theme {
  /** Card gradient and text colour. */
  card: string;
  /** Coloured drop shadow. */
  glow: string;
  /** Pill behind the action. */
  pill: string;
  /** Hairline between the picture and the words. */
  rule: string;
  /** Faint picture on the right of the card. */
  mark?: ReactNode;
}

interface RowProps {
  href?: string;
  onClick?: () => void;
  theme: Theme;
  art: ReactNode;
  /** The white tile behind the picture; false for a picture that sits on the card. */
  tile?: boolean;
  eyebrow?: ReactNode;
  title?: ReactNode;
  line: ReactNode;
  action: string;
  tall?: boolean;
}

function Row({ href, onClick, theme, art, tile = true, eyebrow, title, line, action, tall }: RowProps) {
  const body = (
    <>
      {/* gloss */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />
      {theme.mark ? (
        <span aria-hidden className="pointer-events-none absolute bottom-1 right-28 opacity-25">
          {theme.mark}
        </span>
      ) : null}
      <span className="relative shrink-0">
        {tile ? (
          <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[20px] bg-white shadow-[0_8px_18px_-10px_rgba(36,25,51,0.55)]">{art}</span>
        ) : (
          <span className="flex h-16 w-16 items-center justify-center">{art}</span>
        )}
        {tile ? <Sparks /> : null}
      </span>
      <span aria-hidden className={cn('relative h-12 w-px shrink-0', theme.rule)} />
      <span className="relative flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        {eyebrow}
        {title ? <span className="truncate text-[19px] font-extrabold leading-6">{title}</span> : null}
        <span className="line-clamp-2 text-[13px] leading-[17px] opacity-90">{line}</span>
      </span>
      <span className={cn('relative inline-flex shrink-0 items-center gap-1 rounded-full py-2 pl-3.5 pr-2.5 text-small font-extrabold shadow-[0_6px_14px_-8px_rgba(36,25,51,0.5)]', theme.pill)}>
        {action}
        <ChevronRight className="h-4 w-4" aria-hidden />
      </span>
    </>
  );
  const cls = cn(
    'relative isolate flex w-full items-center gap-3.5 overflow-hidden rounded-[26px] pl-3.5 pr-3.5 transition-transform hover:-translate-y-0.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
    tall ? 'h-[104px]' : 'h-[92px]',
    theme.card,
    theme.glow,
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={!onClick} className={cls}>
      {body}
    </button>
  );
}

/** The little burst of lines at a tile's corner. */
function Sparks() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="absolute -right-2 -top-2 h-4 w-4" fill="none" stroke="#FCC24F" strokeWidth="2.2" strokeLinecap="round">
      <path d="M8 1 v4" />
      <path d="M13 4 l-3 3" />
      <path d="M15 10 h-4" />
    </svg>
  );
}

const THEME = {
  draw: {
    card: 'bg-gradient-to-br from-[#F7709A] to-[#E2336A] text-white',
    glow: 'shadow-[0_16px_30px_-18px_rgba(226,51,106,0.9)]',
    pill: 'bg-white/95 text-rose-600',
    rule: 'bg-white/35',
    mark: (
      <svg viewBox="0 0 80 40" className="h-10 w-20" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round">
        <path d="M4 34 c12 -24 22 -28 30 -12 s18 10 30 -16" />
      </svg>
    ),
  },
  guess: {
    card: 'bg-gradient-to-br from-[#FCCB5A] to-[#F0A01A] text-plum-800',
    glow: 'shadow-[0_16px_30px_-18px_rgba(216,140,12,0.9)]',
    pill: 'bg-[#FFF4DA] text-gold-700',
    rule: 'bg-plum-800/15',
  },
  this_or_that: {
    card: 'bg-gradient-to-br from-[#36B36B] to-[#1D743E] text-white',
    glow: 'shadow-[0_16px_30px_-18px_rgba(29,116,62,0.9)]',
    pill: 'bg-white/95 text-sage-700',
    rule: 'bg-white/30',
    mark: (
      <svg viewBox="0 0 40 40" className="h-10 w-10" fill="none" stroke="#fff" strokeWidth="3">
        <rect x="8" y="8" width="24" height="24" rx="5" transform="rotate(20 20 20)" />
        <text x="20" y="27" textAnchor="middle" fontSize="18" fontWeight="800" fill="#fff" stroke="none">
          ?
        </text>
      </svg>
    ),
  },
  know_me: {
    card: 'bg-gradient-to-br from-[#22B8A6] to-[#0A776D] text-white',
    glow: 'shadow-[0_16px_30px_-18px_rgba(10,119,109,0.9)]',
    pill: 'bg-white/95 text-teal-700',
    rule: 'bg-white/30',
    mark: (
      <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="#fff" strokeWidth="2">
        <path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" />
      </svg>
    ),
  },
  most_likely: {
    card: 'bg-gradient-to-br from-[#8A6BB8] to-[#4B3468] text-white',
    glow: 'shadow-[0_16px_30px_-18px_rgba(75,52,104,0.9)]',
    pill: 'bg-white/95 text-plum-600',
    rule: 'bg-white/30',
  },
  rate_it: {
    card: 'bg-gradient-to-br from-[#40357A] to-[#241933] text-white',
    glow: 'shadow-[0_16px_30px_-18px_rgba(36,25,51,0.95)]',
    pill: 'bg-gold-300 text-plum-800',
    rule: 'bg-white/25',
    mark: (
      <svg viewBox="0 0 40 40" className="h-10 w-10" fill="#fff">
        <path d="M10 4l2 4 4 .6-3 2.9.7 4.1-3.7-2-3.7 2 .7-4.1-3-2.9 4-.6z" />
        <path d="M28 18l2 4 4 .6-3 2.9.7 4.1-3.7-2-3.7 2 .7-4.1-3-2.9 4-.6z" />
      </svg>
    ),
  },
  doodle: {
    card: 'border-2 border-white bg-gradient-to-br from-[#FFE3EC] to-[#FFF4F7] text-ink dark:border-paper-edge dark:from-rose-50 dark:to-paper-raised',
    glow: 'shadow-[0_16px_30px_-22px_rgba(226,51,106,0.7)]',
    pill: 'bg-rose-600 text-white',
    rule: 'bg-rose-200',
  },
  question: {
    card: 'border-2 border-white bg-gradient-to-br from-[#D8F5EE] to-[#F1FCF9] text-ink dark:border-paper-edge dark:from-teal-50 dark:to-paper-raised',
    glow: 'shadow-[0_16px_30px_-22px_rgba(10,119,109,0.7)]',
    pill: 'bg-teal-600 text-white',
    rule: 'bg-teal-200',
  },
} satisfies Record<string, Theme>;

const WAITING_PILL = 'bg-white/25 text-white shadow-none';
const QUIET_PILL = 'bg-paper-sunken text-ink-muted shadow-none';

function DrawTogetherRow() {
  const { partner, partnerOnline } = useCouple();
  const drawing = usePartnerDrawing();
  const name = partner.display_name;
  return (
    <Row
      href="/connect/draw"
      theme={THEME.draw}
      art={
        <svg aria-hidden viewBox="0 0 44 44" className="h-11 w-11" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 30 c6 -14 12 -16 16 -8 s9 6 14 -12" stroke="#E2336A" strokeWidth="3.5" />
          <path d="M28 38 l10 -10 l-3 -3 l-10 10 l-1 4z" fill="#F3A823" stroke="#AE6F08" strokeWidth="1.5" />
        </svg>
      }
      title="Draw together"
      line={drawing ? `${name} is drawing now` : partnerOnline ? `${name} is online · paint & doodle in sync` : 'Paint & doodle in sync'}
      action={drawing ? 'Join' : 'Open'}
    />
  );
}

function DrawGuessRow() {
  const { partner } = useCouple();
  const { stats, toGuess, myTurnToDraw } = useDrawGames();
  return (
    <Row
      href="/connect/draw/guess"
      theme={THEME.guess}
      art={
        <svg aria-hidden viewBox="0 0 44 44" className="h-11 w-11" fill="none">
          <path d="M6 7 h32 a6 6 0 0 1 6 6 v14 a6 6 0 0 1 -6 6 h-18 l-8 7 v-7 h-6 a6 6 0 0 1 -6 -6 v-14 a6 6 0 0 1 6 -6z" fill="#241933" />
          <path d="M24 11 l-7 11 h6 l-3 8 l8 -12 h-6z" fill="#F3A823" />
        </svg>
      }
      title="Draw & Guess"
      line={toGuess ? `${partner.display_name} drew one for you` : myTurnToDraw ? 'Your turn to draw' : stats.best ? `Best team score ${stats.best}` : 'A fun drawing challenge'}
      action={toGuess ? 'Guess' : myTurnToDraw ? 'Draw' : 'Play'}
    />
  );
}

/** The pink one (me) and the teal one (my partner). */
function Blob({ fill, blush, className }: { fill: string; blush: string; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 60 60" className={className} fill="none">
      <circle cx="30" cy="30" r="26" fill={fill} />
      <ellipse cx="22" cy="16" rx="9" ry="5" fill="#fff" opacity=".35" />
      <circle cx="22" cy="30" r="3.4" fill="#241933" />
      <circle cx="38" cy="30" r="3.4" fill="#241933" />
      <ellipse cx="15" cy="38" rx="4.5" ry="2.6" fill={blush} opacity=".55" />
      <ellipse cx="45" cy="38" rx="4.5" ry="2.6" fill={blush} opacity=".55" />
      <path d="M25 39 q5 5 10 0" stroke="#241933" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

const GAME_ART: Record<QuizKind, { art: ReactNode; tile?: boolean }> = {
  this_or_that: {
    tile: false,
    art: (
      <span aria-hidden className="flex">
        <span className="flex h-12 w-8 -rotate-6 items-center justify-center rounded-l-[12px] rounded-r-[4px] bg-gradient-to-b from-[#FF86A3] to-[#F5547C] text-[17px] font-extrabold text-white shadow-[0_6px_12px_-6px_rgba(36,25,51,0.6)]">A</span>
        <span className="-ml-0.5 flex h-12 w-8 rotate-6 items-center justify-center rounded-l-[4px] rounded-r-[12px] bg-gradient-to-b from-[#50CBB9] to-[#0C8F82] text-[17px] font-extrabold text-white shadow-[0_6px_12px_-6px_rgba(36,25,51,0.6)]">B</span>
      </span>
    ),
  },
  know_me: { art: <Blob fill="#50CBB9" blush="#FF86A3" className="h-12 w-12" /> },
  most_likely: {
    art: (
      <span aria-hidden className="flex">
        <Blob fill="#FF86A3" blush="#F5547C" className="h-8 w-8" />
        <Blob fill="#50CBB9" blush="#FF86A3" className="-ml-1.5 h-8 w-8" />
      </span>
    ),
  },
  rate_it: {
    tile: false,
    art: (
      <svg aria-hidden viewBox="0 0 24 24" className="h-14 w-14 drop-shadow-[0_6px_8px_rgba(0,0,0,0.35)]">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" fill="#FCC24F" stroke="#F3A823" strokeWidth="1" strokeLinejoin="round" />
      </svg>
    ),
  },
};

const GAME_TITLE: Record<QuizKind, string> = {
  this_or_that: 'This or that',
  know_me: 'Know me',
  most_likely: 'Who’s more likely',
  rate_it: 'Rate it together',
};

/** One daily game: today's first question, or where we've got to. */
function GameRow({ kind, round, loading }: { kind: QuizKind; round: QuizRound | undefined; loading: boolean }) {
  const { me, partner } = useCouple();
  const name = partner.display_name;
  const state = round ? quizState(round) : null;
  const first = round?.items[0];
  const total = round?.questions.length ?? 8;
  let theme: Theme = THEME[kind];

  let line: string;
  let action: string;
  if (!round) {
    line = loading ? 'Shuffling today’s questions…' : 'Not ready yet';
    action = '…';
  } else if (state === 'mine') {
    action = 'Play';
    line =
      kind === 'this_or_that' && first
        ? `${first.options[0]} or ${first.options[1]}? Pick & know each other`
        : kind === 'know_me'
          ? round.subject_id === me.id
            ? 'About you today · answer, they guess'
            : `Guess ${name}’s answers today`
          : kind === 'most_likely' && first?.prompt
            ? `…to ${first.prompt}?`
            : first?.prompt
              ? `“${first.prompt}” and ${total - 1} more`
              : `${total} to play`;
  } else if (state === 'waiting') {
    action = 'Waiting';
    theme = { ...theme, pill: WAITING_PILL };
    line = `You’re done · ${name}’s turn`;
  } else {
    const score = roundScore(round);
    action = `${score}/${total}`;
    line = kind === 'rate_it' ? `Done · ${rateGap(round.my_answers, round.partner_answers)} apart on average` : `Done · ${quizVerdict(kind, score, total).replace(/\s\S+$/u, '')}`;
  }

  return (
    <Row
      href={round ? `/connect/play/quiz/${round.id}` : undefined}
      theme={theme}
      art={GAME_ART[kind].art}
      tile={GAME_ART[kind].tile}
      title={GAME_TITLE[kind]}
      line={line}
      action={action}
    />
  );
}

function DoodleRow({ doodle }: { doodle: ReturnType<typeof useDailyDoodle> }) {
  const { me, partner } = useCouple();
  const name = partner.display_name;
  const mine = doodle.drawings.find((d) => d.created_by === me.id);
  const theirs = doodle.drawings.find((d) => d.created_by !== me.id);
  const both = doodle.mine && doodle.partner;
  const line = both
    ? 'You both drew it · see side by side'
    : doodle.mine
      ? `Yours is in · waiting for ${name}`
      : doodle.partner
        ? `${name} drew it · draw yours to see`
        : `Draw it, then see ${name}’s`;
  const action = both ? 'See' : doodle.mine ? 'Waiting' : 'Draw';
  return (
    <Row
      href="/connect/draw/daily"
      tall
      tile={false}
      theme={action === 'Waiting' ? { ...THEME.doodle, pill: QUIET_PILL } : THEME.doodle}
      art={
        <span aria-hidden className="flex">
          <Polaroid tilt="-rotate-[8deg]" url={mine ? doodle.urls[mine.png_path] : undefined} empty={!doodle.mine} />
          <Polaroid tilt="-ml-3 rotate-[8deg]" url={both && theirs ? doodle.urls[theirs.png_path] : undefined} blurred={doodle.partner && !doodle.mine} />
        </span>
      }
      eyebrow={<span className="text-small font-extrabold text-rose-700">Today’s doodle</span>}
      title={<span className="font-serif font-medium">“{doodle.prompt}”</span>}
      line={<span className="text-ink-soft">{line}</span>}
      action={action}
    />
  );
}

function Polaroid({ tilt, url, empty, blurred }: { tilt: string; url?: string; empty?: boolean; blurred?: boolean }) {
  return (
    <span className={cn('flex h-[56px] w-11 items-center justify-center overflow-hidden rounded-lg bg-white shadow-[0_8px_16px_-8px_rgba(36,25,51,0.5)]', tilt)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : empty ? (
        <Plus className="h-5 w-5 text-rose-500" />
      ) : (
        <svg viewBox="0 0 40 40" className={cn('h-8 w-8', blurred && 'blur-[3px]')} fill="none" stroke="#0C8F82" strokeWidth="2.6" strokeLinecap="round">
          <path d="M8 32V16l12-9 12 9v16Z" />
        </svg>
      )}
    </span>
  );
}

function QuestionRow({ daily }: { daily: ReturnType<typeof useDaily> }) {
  const [open, setOpen] = useState(false);
  const today = daily.data?.today;
  const state = today ? dailyState(today) : null;
  const action = state === 'revealed' ? 'Read' : state === 'waiting' ? 'Waiting' : 'Answer';
  return (
    <>
      <Row
        onClick={() => setOpen(true)}
        tall
        theme={action === 'Waiting' ? { ...THEME.question, pill: QUIET_PILL } : THEME.question}
        tile={false}
        art={
          <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-gradient-to-br from-teal-500 to-teal-700 shadow-[0_8px_18px_-10px_rgba(10,119,109,0.8)]">
            <Mail className="h-8 w-8 text-white" aria-hidden />
          </span>
        }
        eyebrow={<span className="text-small font-extrabold text-teal-700">Today’s question</span>}
        line={<span className="font-serif text-[15px] leading-[19px] text-ink">{today?.prompt ?? 'Loading today’s question…'}</span>}
        action={action}
      />
      <Dialog open={open} onOpenChange={setOpen} title="Today’s question" className="sm:w-[min(92vw,560px)]">
        {daily.data ? <TodayQuestion daily={daily} /> : null}
      </Dialog>
    </>
  );
}

function OursLink({ href, count, label, tone, icon }: { href: string; count: number; label: [string, string]; tone: string; icon: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[22px] border border-paper-edge bg-paper-raised px-4 py-3.5 shadow-[0_12px_26px_-20px_rgba(36,25,51,0.6)] transition-transform hover:-translate-y-0.5"
    >
      <span className={cn('text-[30px] font-extrabold leading-none', tone)}>{count}</span>
      <span className="flex-1 text-small leading-[18px] text-ink">
        {label[0]}
        <br />
        {label[1]}
      </span>
      {icon}
    </Link>
  );
}

/** The two of us, cheek to cheek, a heart above. */
function Mascots() {
  return (
    <span className="relative flex h-[72px] w-[104px] items-center justify-center rounded-[28px] bg-white/80 shadow-[0_14px_30px_-18px_rgba(36,25,51,0.6)] dark:bg-paper-raised">
      <Blob fill="#FF86A3" blush="#F5547C" className="h-12 w-12 motion-safe:animate-[us-bob_2.6s_ease-in-out_infinite]" />
      <Blob fill="#50CBB9" blush="#FF86A3" className="-ml-3 h-12 w-12 motion-safe:animate-[us-bob_2.6s_ease-in-out_0.5s_infinite]" />
      <svg aria-hidden viewBox="0 0 24 24" className="absolute -top-1.5 left-1/2 h-5 w-5 -translate-x-1/2" fill="#F5547C">
        <path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" />
      </svg>
    </span>
  );
}

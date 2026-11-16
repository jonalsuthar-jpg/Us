'use client';

import { dailyState, quizState, quizVerdict, rateGap, roundScore, type QuizKind, type QuizRound } from '@us/shared';
import { useCouple, useDailyDoodle, useDrawGames, useDrawings, useFeature, usePartnerDrawing, useQuizzes } from '@us/shared/react';
import { Mail, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { TodayQuestion, useDaily } from './daily-question';

/**
 * Connect, as rows: one wide, short card per thing to do. Each activity has
 * its own solid colour; today's doodle and question are light, so they read
 * as "our moment" rather than a game.
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

  return (
    <div className="space-y-7 sm:space-y-9">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[32px] font-extrabold leading-9 tracking-tight text-ink sm:text-[40px] sm:leading-[1.1]">Connect</h1>
          <p className="mt-1 text-small text-ink-soft">
            <b className="text-ink">
              {steps.filter(Boolean).length} of {steps.length}
            </b>{' '}
            done today{daily.data && daily.data.streak > 1 ? ` · ${daily.data.streak}-day streak` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Mascots className="h-[54px] w-[86px] sm:h-[72px] sm:w-[115px]" />
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
          <div className="grid grid-cols-2 gap-2.5 md:col-span-2">
            {draw ? <OursLink href="/connect/draw/gallery" count={drawings.length} label="Our drawings" tone="text-rose-600" /> : null}
            {dailyOn ? <OursLink href="/connect/questions" count={daily.data?.together ?? 0} label="Our answers" tone="text-teal-700" /> : null}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

const QUIZ_ORDER: QuizKind[] = ['this_or_that', 'know_me', 'most_likely', 'rate_it'];

function Section({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-ink-muted">{title}</h2>
        {aside ? <span className="text-micro text-ink-muted">{aside}</span> : null}
      </div>
      <div className="grid gap-2.5 md:grid-cols-2 md:gap-3">{children}</div>
    </section>
  );
}

interface RowProps {
  href?: string;
  onClick?: () => void;
  /** Card colours: background and text. */
  tone: string;
  art: ReactNode;
  /** Square behind the picture. */
  artTone?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  line: ReactNode;
  action: string;
  actionTone: string;
  tall?: boolean;
  label?: string;
}

function Row({ href, onClick, tone, art, artTone = 'bg-white/95', eyebrow, title, line, action, actionTone, tall, label }: RowProps) {
  const body = (
    <>
      <span className={cn('flex h-[58px] w-[58px] shrink-0 items-center justify-center overflow-hidden rounded-[18px]', artTone)}>{art}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        {eyebrow}
        <span className="truncate text-[17px] font-extrabold leading-[21px]">{title}</span>
        <span className="line-clamp-2 text-[12.5px] leading-4 opacity-90">{line}</span>
      </span>
      <span className={cn('shrink-0 rounded-full px-3 py-1.5 text-micro font-extrabold', actionTone)}>{action}</span>
    </>
  );
  const cls = cn(
    'flex w-full items-center gap-3.5 overflow-hidden rounded-[22px] pl-3 pr-3.5 transition-transform hover:-translate-y-0.5 hover:shadow-[0_14px_26px_-18px_rgba(36,25,51,0.7)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
    tall ? 'h-24' : 'h-[84px]',
    tone,
  );
  return href ? (
    <Link href={href} className={cls} aria-label={label}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls} aria-label={label}>
      {body}
    </button>
  );
}

const WHITE_PILL = 'bg-white';
const SOFT_PILL = 'bg-white/20 text-white';

function DrawTogetherRow() {
  const { partner, partnerOnline } = useCouple();
  const drawing = usePartnerDrawing();
  const name = partner.display_name;
  return (
    <Row
      href="/connect/draw"
      tone="bg-[#E2336A] text-white"
      art={
        <svg aria-hidden viewBox="0 0 44 44" className="h-11 w-11" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 32 c6 -14 12 -16 16 -8 s9 6 14 -12" stroke="#E2336A" strokeWidth="3.5" />
          <path d="M30 38 l9 -9 l-3 -3 l-9 9 l-1 4z" fill="#F3A823" stroke="#AE6F08" strokeWidth="1.5" />
        </svg>
      }
      title="Draw together"
      line={drawing ? `${name} is drawing now` : partnerOnline ? `${name} is online · one canvas, live` : 'One canvas, live'}
      action={drawing ? 'Join' : 'Open'}
      actionTone={cn(WHITE_PILL, 'text-rose-600')}
    />
  );
}

function DrawGuessRow() {
  const { partner } = useCouple();
  const { stats, toGuess, myTurnToDraw } = useDrawGames();
  return (
    <Row
      href="/connect/draw/guess"
      tone="bg-gold-400 text-plum-800"
      art={
        <svg aria-hidden viewBox="0 0 44 44" className="h-11 w-11" fill="none">
          <path d="M6 6 h32 a6 6 0 0 1 6 6 v14 a6 6 0 0 1 -6 6 h-18 l-8 7 v-7 h-6 a6 6 0 0 1 -6 -6 v-14 a6 6 0 0 1 6 -6z" fill="#241933" />
          <text x="22" y="26" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="16" fill="#F3A823">
            ?
          </text>
        </svg>
      }
      title="Draw & Guess"
      line={toGuess ? `${partner.display_name} drew one for you` : myTurnToDraw ? 'Your turn to draw' : stats.best ? `Best team score ${stats.best}` : 'Six rounds, one team'}
      action={toGuess ? 'Guess' : myTurnToDraw ? 'Draw' : 'Play'}
      actionTone="bg-plum-800 text-gold-300"
    />
  );
}

const GAME: Record<QuizKind, { title: string; tone: string; pill: string; art: ReactNode; artTone?: string }> = {
  this_or_that: {
    title: 'This or that',
    tone: 'bg-sage-600 text-white',
    pill: 'text-sage-700',
    artTone: 'bg-transparent',
    art: (
      <span aria-hidden className="flex h-full w-full text-[10px] font-extrabold text-white">
        <span className="flex flex-1 items-center justify-center bg-rose-300">A</span>
        <span className="flex flex-1 items-center justify-center bg-teal-300">B</span>
      </span>
    ),
  },
  know_me: {
    title: 'Know me',
    tone: 'bg-teal-600 text-white',
    pill: 'text-teal-700',
    art: (
      <svg aria-hidden viewBox="0 0 60 60" className="h-[46px] w-[46px]" fill="none">
        <path d="M28 10 C42 10 50 21 50 35 C50 48 41 55 28 55 C15 55 6 48 6 35 C6 21 14 10 28 10Z" fill="#50CBB9" />
        <circle cx="21" cy="33" r="3.5" fill="#241933" />
        <circle cx="35" cy="33" r="3.5" fill="#241933" />
        <ellipse cx="15" cy="41" rx="4" ry="2.5" fill="#FF86A3" opacity=".6" />
        <path d="M24 42 q4 3.5 8 0" stroke="#241933" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="50" cy="12" r="9" fill="#F3A823" />
        <text x="50" y="17" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="13" fill="#241933">
          ?
        </text>
      </svg>
    ),
  },
  most_likely: {
    title: 'Who’s more likely',
    tone: 'bg-plum-600 text-white',
    pill: 'text-plum-600',
    art: (
      <svg aria-hidden viewBox="0 0 48 40" className="h-10 w-12" fill="none">
        <path d="M14 8 C22 8 26 14 26 22 C26 30 21 34 14 34 C7 34 2 30 2 22 C2 14 6 8 14 8Z" fill="#FF86A3" />
        <circle cx="10" cy="21" r="2.2" fill="#241933" />
        <circle cx="18" cy="21" r="2.2" fill="#241933" />
        <path d="M34 6 C42 6 46 12 46 20 C46 28 41 32 34 32 C27 32 22 28 22 20 C22 12 26 6 34 6Z" fill="#50CBB9" />
        <circle cx="30" cy="19" r="2.2" fill="#241933" />
        <circle cx="38" cy="19" r="2.2" fill="#241933" />
        <path d="M18 2 q6 -3 12 0" stroke="#634882" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 3" />
      </svg>
    ),
  },
  rate_it: {
    title: 'Rate it together',
    tone: 'bg-plum-800 text-white',
    pill: 'text-plum-800',
    artTone: 'bg-gold-50',
    art: (
      <svg aria-hidden viewBox="0 0 24 24" className="h-11 w-11" fill="#F3A823" stroke="#D88C0C" strokeWidth="1" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
      </svg>
    ),
  },
};

/** One daily game: what today's first question is, or where we've got to. */
function GameRow({ kind, round, loading }: { kind: QuizKind; round: QuizRound | undefined; loading: boolean }) {
  const { me, partner } = useCouple();
  const g = GAME[kind];
  const name = partner.display_name;
  const state = round ? quizState(round) : null;
  const first = round?.items[0];
  const total = round?.questions.length ?? 8;

  let line: string;
  let action: string;
  let pill = cn(WHITE_PILL, g.pill);
  if (!round) {
    line = loading ? 'Shuffling today’s questions…' : 'Not ready yet';
    action = '…';
  } else if (state === 'mine') {
    action = 'Play';
    line =
      kind === 'this_or_that' && first
        ? `${first.options[0]} or ${first.options[1]}? ${total} quick picks`
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
    pill = SOFT_PILL;
    line = `You’re done · ${name}’s turn`;
  } else {
    const score = roundScore(round);
    action = `${score}/${total}`;
    line = kind === 'rate_it' ? `Done · ${rateGap(round.my_answers, round.partner_answers)} apart on average` : `Done · ${quizVerdict(kind, score, total).replace(/\s\S+$/u, '')}`;
  }

  return (
    <Row
      href={round ? `/connect/play/quiz/${round.id}` : undefined}
      tone={g.tone}
      art={g.art}
      artTone={g.artTone}
      title={g.title}
      line={line}
      action={action}
      actionTone={pill}
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
      tone="border border-paper-edge bg-rose-50 text-ink"
      artTone="bg-transparent"
      art={
        <span aria-hidden className="flex">
          <Polaroid tilt="-rotate-6" url={mine ? doodle.urls[mine.png_path] : undefined} empty={!doodle.mine} />
          <Polaroid tilt="-ml-2.5 rotate-6" url={both && theirs ? doodle.urls[theirs.png_path] : undefined} blurred={doodle.partner && !doodle.mine} />
        </span>
      }
      eyebrow={<span className="text-micro font-bold text-rose-700">Today’s doodle</span>}
      title={<span className="font-serif font-medium">“{doodle.prompt}”</span>}
      line={<span className="text-ink-soft">{line}</span>}
      action={action}
      actionTone={action === 'Waiting' ? 'bg-paper-sunken text-ink-muted' : 'bg-rose-600 text-white'}
    />
  );
}

function Polaroid({ tilt, url, empty, blurred }: { tilt: string; url?: string; empty?: boolean; blurred?: boolean }) {
  return (
    <span className={cn('flex h-[52px] w-10 items-center justify-center overflow-hidden rounded-md bg-white shadow-[0_6px_14px_-8px_rgba(36,25,51,0.5)]', empty && 'border-2 border-dashed border-rose-300', tilt)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : empty ? (
        <Plus className="h-4 w-4 text-rose-500" />
      ) : (
        <svg viewBox="0 0 40 40" className={cn('h-7 w-7', blurred && 'blur-[3px]')} fill="none" stroke="#0C8F82" strokeWidth="2.6" strokeLinecap="round">
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
        tone="border border-paper-edge bg-teal-50 text-ink"
        artTone="bg-teal-600"
        art={<Mail className="h-[30px] w-[30px] text-white" aria-hidden />}
        eyebrow={<span className="text-micro font-bold text-teal-700">Today’s question</span>}
        title={<span className="sr-only">Today’s question</span>}
        line={<span className="font-serif text-[15px] leading-[19px] text-ink">{today?.prompt ?? 'Loading today’s question…'}</span>}
        action={action}
        actionTone={action === 'Waiting' ? 'bg-paper-sunken text-ink-muted' : 'bg-teal-600 text-white'}
      />
      <Dialog open={open} onOpenChange={setOpen} title="Today’s question" className="sm:w-[min(92vw,560px)]">
        {daily.data ? <TodayQuestion daily={daily} /> : null}
      </Dialog>
    </>
  );
}

function OursLink({ href, count, label, tone }: { href: string; count: number; label: string; tone: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-[18px] border border-paper-edge bg-paper-raised p-3 hover:bg-paper-sunken">
      <span className={cn('text-[20px] font-extrabold', tone)}>{count}</span>
      <span className="text-small font-bold leading-4 text-ink">{label}</span>
    </Link>
  );
}

/** The two of us: a pink one and a teal one, and a heart. */
function Mascots({ className }: { className?: string }) {
  return (
    <svg role="img" aria-label="The two of you" viewBox="0 0 86 54" className={className} fill="none">
      <g className="motion-safe:animate-[us-bob_2.6s_ease-in-out_infinite]">
        <path d="M24 8 C36 8 42 17 42 29 C42 41 34 48 24 48 C14 48 6 41 6 29 C6 17 12 8 24 8Z" fill="#FF86A3" />
        <circle cx="18" cy="27" r="2.8" fill="#241933" />
        <circle cx="30" cy="27" r="2.8" fill="#241933" />
        <ellipse cx="13" cy="34" rx="3.4" ry="2" fill="#F5547C" opacity=".6" />
        <path d="M21 34 q3 3 6 0" stroke="#241933" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g className="motion-safe:animate-[us-bob_2.6s_ease-in-out_0.5s_infinite]">
        <path d="M62 10 C74 10 80 19 80 30 C80 42 72 48 62 48 C52 48 44 42 44 30 C44 19 50 10 62 10Z" fill="#50CBB9" />
        <circle cx="56" cy="28" r="2.8" fill="#241933" />
        <circle cx="68" cy="28" r="2.8" fill="#241933" />
        <ellipse cx="73" cy="35" rx="3.4" ry="2" fill="#FF86A3" opacity=".6" />
        <path d="M59 35 q3 3 6 0" stroke="#241933" strokeWidth="2" strokeLinecap="round" />
      </g>
      <path d="M43 6 c-2 -4 -8 -2 -5 2 l5 5 l5 -5 c3 -4 -3 -6 -5 -2z" fill="#F5547C" />
    </svg>
  );
}

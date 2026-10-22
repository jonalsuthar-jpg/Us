'use client';

import { SPARK_DIVISIONS, SPARK_KIND_LABEL, SPARK_RULES, SPARK_TIERS, sparkNextLine, togetherStreak, type SparkKind, type SparkState } from '@us/shared';
import { usePlant } from '@us/shared/react';
import { Camera, Check, CircleHelp, HeartPulse, Image, Lock, MessageCircle, Phone, PhoneIncoming, Smile, Sparkles, Users, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/cn';
import { Emblem } from './emblem';

type Tab = 'today' | 'mine' | 'ladder';

const ICON: Partial<Record<SparkKind, LucideIcon>> = {
  first_move: Sparkles,
  snap: Camera,
  call_start: Phone,
  call_pickup: PhoneIncoming,
  question: CircleHelp,
  media: Image,
  tap: HeartPulse,
  status: Smile,
  message: MessageCircle,
};

/** Spark Rank in full: where we are, what's left to earn today, my own effort, the ladder. */
export function RankSheet({ open, onOpenChange, state }: { open: boolean; onOpenChange: (open: boolean) => void; state: SparkState }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Spark Rank" className="sm:w-[min(92vw,480px)]">
      {open ? <Body state={state} /> : null}
    </Dialog>
  );
}

function Body({ state }: { state: SparkState }) {
  const [tab, setTab] = useState<Tab>('today');
  const plant = usePlant();
  const streak = plant.state ? togetherStreak(plant.state.last30) : 0;
  const { division, next, progress } = state.rank;

  return (
    <div className="-mx-6 max-h-[72dvh] space-y-5 overflow-y-auto px-6 pb-1">
      <div className="flex flex-col items-center text-center">
        <div className="relative flex h-32 w-32 items-center justify-center">
          <span className="absolute h-28 w-28 rounded-full opacity-30 animate-[us-rank-glow_2.4s_ease-in-out_infinite]" style={{ backgroundColor: division.tier.colors[0] }} />
          <Emblem division={division} className="relative h-[92px] w-[92px]" />
        </div>
        <p className="font-display text-title text-ink">{division.name}</p>
        <p className="text-small text-ink-muted">
          Climbing together · {state.daysLeft === 0 ? 'last day' : `${state.daysLeft} ${state.daysLeft === 1 ? 'day' : 'days'} left`} in {state.month}
        </p>
      </div>

      <div>
        <div className="mb-1.5 flex justify-between text-micro text-ink-muted">
          <span>{division.name}</span>
          <span>{next?.name ?? ''}</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-paper-sunken">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${Math.round(progress * 100)}%`, background: `linear-gradient(90deg, ${division.tier.colors[0]}, ${division.tier.colors[1]})` }}
          />
        </div>
        <p className="mt-2 text-center text-small text-ink-soft">{sparkNextLine(state)}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat value={`+${state.today}`} label="Today, together" />
        <Stat value={`${streak} ${streak === 1 ? 'day' : 'days'}`} label="Together streak" />
        <Stat value={state.sparks.toLocaleString()} label="Season Sparks" />
      </div>

      <Segmented
        label="Show"
        value={tab}
        onChange={setTab}
        className="flex w-full [&>button]:flex-1"
        options={[
          { value: 'today', label: 'Today' },
          { value: 'mine', label: 'My effort' },
          { value: 'ladder', label: 'Ladder' },
        ]}
      />

      {tab === 'today' ? <Today state={state} streak={streak} together={!!plant.state?.grewToday} /> : null}
      {tab === 'mine' ? <Mine state={state} /> : null}
      {tab === 'ladder' ? <Ladder state={state} /> : null}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 rounded-[16px] border border-paper-edge px-3 py-2.5">
      <p className="truncate text-lead font-bold text-ink">{value}</p>
      <p className="truncate text-micro text-ink-muted">{label}</p>
    </div>
  );
}

function Eyebrow({ children }: { children: string }) {
  return <p className="mt-1 text-micro font-semibold uppercase tracking-[0.12em] text-ink-muted">{children}</p>;
}

function Today({ state, streak, together }: { state: SparkState; streak: number; together: boolean }) {
  // Mirrors the bonus in spark_award(): more on a streak of three, then seven.
  const bonus = streak >= 6 ? 30 : streak >= 2 ? 25 : 20;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 rounded-[18px] bg-sage-50 p-3.5 text-sage-700">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-paper-raised">
          <Users className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="flex-1">
          <p className="text-small font-semibold">{together ? 'Together day bonus' : 'Both of you, today'}</p>
          <p className="text-micro">
            {together ? `You both showed up today${streak >= 3 ? ` · ${streak}-day streak` : ''}` : 'When you both do something for each other, you both earn it'}
          </p>
        </div>
        {together ? <Check className="h-[18px] w-[18px]" aria-label="Earned" /> : <span className="text-small font-bold">+{bonus}</span>}
      </div>

      <Eyebrow>Ways to earn today</Eyebrow>
      <ul>
        {SPARK_RULES.map((r) => {
          const used = state.mine.usedToday[r.kind] ?? 0;
          const done = used >= r.cap;
          const Icon = ICON[r.kind] ?? Sparkles;
          const gold = r.kind === 'first_move';
          return (
            <li key={r.kind} className="flex items-center gap-3 border-b border-paper-sunken py-3">
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]', gold ? 'bg-gold-50 text-gold-700' : 'bg-rose-50 text-rose-700')}>
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-small font-semibold text-ink">{r.label}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-paper-sunken">
                    <div className={cn('h-full rounded-full', gold ? 'bg-gold-400' : 'bg-rose-400')} style={{ width: `${Math.min(100, (used / r.cap) * 100)}%` }} />
                  </div>
                  <span className="whitespace-nowrap text-micro text-ink-muted">
                    {Math.min(used, r.cap)} of {r.cap}
                  </span>
                </div>
              </div>
              {done ? (
                <span className="flex items-center gap-1 rounded-full bg-sage-50 px-2.5 py-1 text-micro font-semibold text-sage-700">
                  <Check className="h-3 w-3" aria-hidden />
                  Done
                </span>
              ) : (
                <span className="whitespace-nowrap rounded-full bg-gold-50 px-2.5 py-1 text-micro font-semibold text-gold-700">
                  +{r.sparks}
                  {r.kind === 'message' ? ' each' : ''}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="pt-2 text-micro text-ink-muted">A first move is the first message, snap, tap or call after four quiet hours. Calls also earn a Spark for every two minutes you talk.</p>
    </div>
  );
}

function Mine({ state }: { state: SparkState }) {
  const max = Math.max(1, ...state.mine.byKind.map((k) => k.sparks));
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-micro text-ink-soft">
        <Lock className="h-3.5 w-3.5" aria-hidden />
        Only you can see this. Your partner just sees the rank you share.
      </p>
      <div className="rounded-[20px] bg-plum-800 p-5">
        <p className="text-micro text-plum-200">Your Sparks this season</p>
        <p className="text-[36px] font-bold leading-[42px] text-paper">{state.mine.season.toLocaleString()}</p>
        <p className="text-small text-plum-200">+{state.mine.today} today</p>
      </div>
      <div className="flex items-center gap-3 rounded-[20px] border border-gold-100 bg-gold-50 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-paper-raised">
          <Sparkles className="h-[22px] w-[22px] fill-gold-400 text-gold-400" aria-hidden />
        </span>
        <div>
          <p className="font-bold text-gold-800">
            {state.mine.firstMoves} {state.mine.firstMoves === 1 ? 'first move' : 'first moves'}
          </p>
          <p className="text-small text-gold-700">
            {state.mine.firstMoves ? `You reached out first ${state.mine.firstMoves === 1 ? 'once' : `${state.mine.firstMoves} times`} this season.` : 'Be the one who reaches out first.'}
          </p>
        </div>
      </div>
      {state.mine.byKind.length ? (
        <div>
          <Eyebrow>Where your Sparks came from</Eyebrow>
          <ul>
            {state.mine.byKind.map((k) => (
              <li key={k.kind} className="grid grid-cols-[8rem_minmax(0,1fr)_2.5rem] items-center gap-3 py-2">
                <span className="truncate text-small text-ink-soft">{SPARK_KIND_LABEL[k.kind]}</span>
                <span className="h-2 overflow-hidden rounded-full bg-paper-sunken">
                  <span className={cn('block h-full rounded-full', k.kind === 'first_move' ? 'bg-gold-400' : 'bg-rose-400')} style={{ width: `${(k.sparks / max) * 100}%` }} />
                </span>
                <span className="text-right text-small font-semibold text-ink">{k.sparks}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Ladder({ state }: { state: SparkState }) {
  const current = state.rank.division;
  return (
    <div className="space-y-1">
      <p className="text-small text-ink-soft">Every tier has I, II and III, each with more gold. Eternal is the top.</p>
      <ol>
        {SPARK_TIERS.map((t, i) => {
          const here = i === current.tierIndex;
          const reached = i < current.tierIndex;
          const shown = here ? current : SPARK_DIVISIONS[i * 3 + (reached ? 2 : 0)]!;
          return (
            <li
              key={t.key}
              className={cn('flex items-center gap-3 rounded-[16px] border px-2.5 py-2', here ? 'border-rose-200 bg-rose-50' : 'border-transparent', i > current.tierIndex && 'opacity-50')}
            >
              <Emblem division={shown} className="h-[38px] w-[38px]" />
              <div className="flex-1">
                <p className="font-semibold text-ink">{t.name}</p>
                <p className="text-micro text-ink-muted">From {SPARK_DIVISIONS[i * 3]!.at.toLocaleString()} Sparks</p>
              </div>
              {here ? <span className="text-micro font-semibold text-rose-700">You’re here</span> : reached ? <span className="text-micro font-semibold text-sage-700">Reached</span> : null}
            </li>
          );
        })}
      </ol>
      <Eyebrow>Season peaks</Eyebrow>
      {state.peaks.length ? (
        <ul className="grid grid-cols-3 gap-2">
          {state.peaks.map((p) => (
            <li key={p.season} className="flex flex-col items-center gap-1 rounded-[16px] border border-paper-edge px-2 py-3">
              <Emblem division={p.division} className="h-10 w-10" />
              <span className="truncate text-small font-semibold text-ink">{p.division.name}</span>
              <span className="text-micro text-ink-muted">{p.month}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-ink-soft">This is your first season. Where you end up is kept here.</p>
      )}
      <p className="pt-2 text-micro text-ink-muted">A new season starts on the 1st. You keep 40% of your Sparks and climb again.</p>
    </div>
  );
}

'use client';

import {
  addDecisionOption,
  addListItem,
  clearDoneItems,
  deleteListItem,
  LIST_NAMES,
  LISTS,
  listDecisionOptions,
  listItems,
  setListItemDone,
  sortListItems,
  type ListName,
} from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { BookOpen, Check, ChevronDown, ChevronRight, Clapperboard, Dices, Globe, Plus, ShoppingBag, X, type LucideIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/cn';
import { SLOT_BG, TONE, type Tone } from './tones';

/** Each list's colour: a gradient for its tile when it's open, the deep stop for its bar. */
const STYLE: Record<ListName, { tone: Tone; Icon: LucideIcon; ring: string; tile: string; decide?: string }> = {
  groceries: { tone: 'teal', Icon: ShoppingBag, ring: '#0A776D', tile: 'from-[#22B8A6] to-[#0A776D]' },
  bucket: { tone: 'gold', Icon: Globe, ring: '#E0950F', tile: 'from-[#FCCB5A] to-[#E0950F]' },
  watch: { tone: 'rose', Icon: Clapperboard, ring: '#E2336A', tile: 'from-[#F7709A] to-[#E2336A]', decide: 'Film night' },
  read: { tone: 'plum', Icon: BookOpen, ring: '#4B3468', tile: 'from-[#8A6BB8] to-[#4B3468]', decide: 'Next book' },
};

/** Shared lists: groceries, a bucket list, things to watch and read. Either of you ticks things off. */
export function PlanLists({ onPick }: { onPick?: (category: string) => void }) {
  const { sb, couple, me, partner, mySlot, partnerSlot } = useCouple();
  const items = useCoupleData('plan:lists', () => listItems(sb, couple.id), [sb, couple.id, true]);
  const options = useCoupleData('plan:decisions', () => (onPick ? listDecisionOptions(sb, couple.id) : Promise.resolve([])), [sb, couple.id, !!onPick]);
  const [list, setList] = useState<ListName>('groceries');
  const [text, setText] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: Error) => setError(e.message);

  const all = items.data ?? [];
  const shown = sortListItems(all.filter((i) => i.list === list));
  const open = shown.filter((i) => !i.done_at);
  const done = shown.filter((i) => i.done_at);
  const meta = LISTS[list];
  const style = STYLE[list];
  const nameOf = (id: string | null) => (id === me.id ? 'you' : id === partner.id ? partner.display_name : 'someone');
  const again =
    list === 'groceries'
      ? [...new Map(done.map((i) => [i.text.toLowerCase(), i])).values()].filter((i) => !open.some((o) => o.text.toLowerCase() === i.text.toLowerCase())).slice(0, 5)
      : [];

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    try {
      await items.mutate(() => addListItem(sb, { couple_id: couple.id, list, text, added_by: me.id }));
      setText('');
    } catch (err) {
      fail(err as Error);
    }
  }

  // Puts this list's open items on a Decide wheel (adding any that aren't there yet), then opens it.
  async function pickOne() {
    const category = style.decide!;
    setBusy(true);
    setError(null);
    try {
      const have = new Set((options.data ?? []).filter((o) => o.category === category).map((o) => o.label.toLowerCase()));
      const missing = open.map((i) => i.text.trim().slice(0, 120)).filter((t) => t && !have.has(t.toLowerCase()));
      if (missing.length) await options.mutate(() => Promise.all(missing.map((label) => addDecisionOption(sb, { couple_id: couple.id, category, label }))));
      onPick!(category);
    } catch (e) {
      fail(e as Error);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* All four lists at once: two by two on phones, a row on wider screens. */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        {LIST_NAMES.map((n) => {
          const s = STYLE[n];
          const of = all.filter((i) => i.list === n);
          const left = of.filter((i) => !i.done_at).length;
          const on = n === list;
          const pct = of.length ? Math.round(((of.length - left) / of.length) * 100) : 0;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              onClick={() => (setList(n), setShowDone(false))}
              className={cn(
                'flex items-center gap-2.5 rounded-[20px] p-2.5 text-left shadow-[0_10px_22px_-16px_rgba(63,44,102,0.7)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                on ? cn('bg-gradient-to-br text-white', s.tile) : 'bg-paper-raised text-ink',
              )}
            >
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px]', on ? 'bg-white' : TONE[s.tone].wash)}>
                <s.Icon className={cn('h-5 w-5', on ? '' : TONE[s.tone].ink)} style={on ? { color: s.ring } : undefined} />
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block truncate text-small font-extrabold">{LISTS[n].title}</span>
                <span className="flex items-center gap-1.5">
                  <span className={cn('h-[5px] flex-1 overflow-hidden rounded-full', on ? 'bg-white/30' : TONE[s.tone].wash)}>
                    <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: on ? '#fff' : s.ring }} />
                  </span>
                  <span className={cn('text-[11px] font-bold', on ? 'text-white' : TONE[s.tone].ink)}>{left ? `${left} left` : of.length ? 'Done' : 'Empty'}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <form onSubmit={add} className="flex gap-2">
        <input
          aria-label={`Add to ${meta.title}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          placeholder={meta.placeholder}
          className="h-[52px] min-w-0 flex-1 rounded-2xl border-[1.5px] border-paper-edge bg-paper-raised px-4 text-body text-ink placeholder:text-ink-muted/70 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-400/15"
        />
        <button type="submit" aria-label="Add" className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
          <Plus className="h-[22px] w-[22px]" strokeWidth={2.4} />
        </button>
      </form>

      {again.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-micro text-ink-muted">Buy again</span>
          {again.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => void items.mutate(() => setListItemDone(sb, i.id, null)).catch(fail)}
              className="h-9 rounded-full border border-dashed border-plum-300 px-3 text-small text-plum-600 hover:bg-paper-sunken"
            >
              + {i.text}
            </button>
          ))}
        </div>
      ) : null}

      {style.decide && onPick && open.length > 1 ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void pickOne()}
          className="flex w-full items-center gap-3 rounded-sheet bg-plum-800 px-4 py-3.5 text-left text-paper disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          <Dices className="h-[22px] w-[22px] text-gold-200" />
          <span className="flex-1">
            <span className="block font-semibold">Pick one for tonight</span>
            <span className="block text-micro text-paper/70">Spin the wheel with these {open.length}</span>
          </span>
          <ChevronRight className="h-[18px] w-[18px] text-gold-200" />
        </button>
      ) : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="rounded-sheet border border-paper-edge bg-paper-raised px-4">
        {open.length === 0 && !items.loading ? (
          <div className="py-8 text-center">
            <p className="font-serif text-lead italic text-ink">{done.length ? 'All done.' : `Nothing on ${meta.title.toLowerCase()} yet`}</p>
            <p className="mt-1 text-small text-ink-soft">Add the next thing above. {partner.display_name} sees it right away.</p>
          </div>
        ) : (
          <ul>
            {open.map((i) => (
              <li key={i.id} className="group flex items-center gap-2 border-b border-paper-sunken py-1">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={false}
                  aria-label={i.text}
                  onClick={() => void items.mutate(() => setListItemDone(sb, i.id, me.id)).catch(fail)}
                  className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                >
                  <span className="h-6 w-6 rounded-full border-2 border-plum-300 transition-colors group-hover:border-sage-500" />
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block text-ink">{i.text}</span>
                  <span className="block text-micro text-ink-muted">Added by {nameOf(i.added_by)}</span>
                </span>
                <span className={cn('h-2 w-2 rounded-full', SLOT_BG[i.added_by === me.id ? mySlot : partnerSlot])} />
                <IconButton label={`Remove ${i.text}`} size="sm" onClick={() => void items.mutate(() => deleteListItem(sb, i.id)).catch(fail)}>
                  <X className="h-4 w-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        {done.length ? (
          <>
            <button type="button" aria-expanded={showDone} onClick={() => setShowDone((x) => !x)} className="flex h-12 w-full items-center justify-between text-small font-medium text-ink-soft hover:text-ink">
              Done ({done.length})
              <ChevronDown className={cn('h-[18px] w-[18px] transition-transform', showDone && 'rotate-180')} />
            </button>
            {showDone ? (
              <>
                <ul>
                  {done.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 border-t border-paper-sunken py-1">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked
                        aria-label={i.text}
                        onClick={() => void items.mutate(() => setListItemDone(sb, i.id, null)).catch(fail)}
                        className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                      >
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sage-500 text-white">
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </span>
                      </button>
                      <span className="min-w-0 flex-1">
                        <span className="block text-ink-muted line-through">{i.text}</span>
                        <span className="block text-micro text-ink-muted">
                          {meta.doneLabel} · {nameOf(i.done_by)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-end pb-2">
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() =>
                      window.confirm(`Clear ${done.length} ticked ${done.length === 1 ? 'item' : 'items'} from ${meta.title}?`) &&
                      void items.mutate(() => clearDoneItems(sb, couple.id, list)).catch(fail)
                    }
                  >
                    Clear ticked
                  </Button>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

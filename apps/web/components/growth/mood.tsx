'use client';

import { addMood, deleteMood, listMyMoods, moodLabel, MOODS } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { EmptyNote, ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { TextAreaField } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';

const TONE = ['bg-plum-300', 'bg-plum-200', 'bg-gold-200', 'bg-sage-300', 'bg-sage-400'];

export function GrowthMood() {
  const { sb, me, partner, channel } = useCouple();
  const moods = useCoupleData('growth:my-moods', () => listMyMoods(sb), [sb]);
  const list = moods.data ?? [];
  const [score, setScore] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [nudge, setNudge] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!score) return;
    setError(null);
    try {
      await moods.mutate(() => addMood(sb, { owner_id: me.id, score, note: note.trim() || null, nudge }));
      // Their nudge card refreshes; the ping carries no data.
      if (nudge) channel.sendChanged('growth:nudges');
      setSent(nudge ? `Saved. ${partner.display_name} got a gentle nudge — nothing else.` : 'Saved, just for you.');
      setScore(null);
      setNote('');
      setNudge(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Oldest → newest for the strip.
  const strip = [...list].slice(0, 14).reverse();

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Sheet pad="md">
        <form onSubmit={save} className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-heading text-ink">How are you, really?</h2>
            <PrivacyBadge privacy="private" partnerName={partner.display_name} />
          </div>
          <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="How you feel">
            {MOODS.map((m, i) => (
              <button
                key={m.score}
                type="button"
                role="radio"
                aria-checked={score === m.score}
                onClick={() => setScore(m.score)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-control border px-1 py-3 text-small transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                  score === m.score ? 'border-ink/30 bg-paper-sunken text-ink' : 'border-paper-edge text-ink-soft hover:text-ink',
                )}
              >
                <span className={cn('h-5 w-5 rounded-full', TONE[i])} aria-hidden />
                {m.label}
              </button>
            ))}
          </div>
          <TextAreaField label="Anything on your mind? (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} hint="Only you will ever see this note." />
          <label className="flex items-start gap-3 rounded-control bg-sage-50 p-3 text-small text-ink">
            <input type="checkbox" checked={nudge} onChange={(e) => setNudge(e.target.checked)} className="mt-0.5 h-4 w-4 accent-sage-500" />
            <span>
              Let {partner.display_name} know I could use a little extra care.
              <span className="block text-micro text-ink-soft">They’ll get a soft nudge. Never your mood or your note.</span>
            </span>
          </label>
          {error && <ErrorNote>{error}</ErrorNote>}
          {sent && !score && <p className="text-small text-sage-700" role="status">{sent}</p>}
          <Button type="submit" disabled={!score}>
            Check in
          </Button>
        </form>
      </Sheet>

      <section aria-labelledby="mood-history" className="space-y-4">
        <h3 id="mood-history" className="font-display text-lead text-ink">
          Your last few weeks
        </h3>
        {list.length === 0 ? (
          <EmptyNote title="No check-ins yet">A quiet record, just for you.</EmptyNote>
        ) : (
          <>
            <div className="flex h-16 items-end gap-1" role="img" aria-label={`Your last ${strip.length} check-ins`}>
              {strip.map((m) => (
                <span key={m.id} className={cn('flex-1 rounded-t-hair', TONE[m.score - 1])} style={{ height: `${m.score * 20}%` }} />
              ))}
            </div>
            <ul className="divide-y divide-paper-edge rounded-sheet border border-paper-edge bg-paper-raised">
              {list.slice(0, 10).map((m) => (
                <li key={m.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', TONE[m.score - 1])} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-small text-ink">
                      {moodLabel(m.score)}
                      <span className="text-ink-muted"> · {new Date(m.created_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                      {m.nudge_partner && <span className="text-sage-700"> · nudged</span>}
                    </p>
                    {m.note ? <p className="mt-0.5 line-clamp-2 text-small text-ink-soft">{m.note}</p> : null}
                  </div>
                  <IconButton label="Delete check-in" size="sm" onClick={() => void moods.mutate(() => deleteMood(sb, m.id)).catch((e) => setError(e.message))}>
                    <X className="h-4 w-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

'use client';

import {
  CAPSULE_TIMES,
  CAPSULE_TOPIC,
  capsuleDatePicks,
  capsuleMoment,
  capsuleProblem,
  editCapsule,
  formatCapsuleMoment,
  listCountdowns,
  sealCapsule,
  toDateKey,
  type Capsule,
} from '@us/shared';
import { useChatKey, useCouple, useCoupleData } from '@us/shared/react';
import { useEffect, useState, type FormEvent } from 'react';
import { ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, TextAreaField } from '@/components/ui/field';
import { Chip } from '@/components/ui/segmented';

const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * Write a message now and seal it until a date and time. Both are always
 * asked for, in this browser's time zone, and shown together before sealing.
 */
export function CapsuleDialog({ open, editing, onOpenChange, onDone }: { open: boolean; editing?: { capsule: Capsule; text: string } | null; onOpenChange: (o: boolean) => void; onDone: (sealedFor: string) => void }) {
  const { sb, couple, me, partner, channel } = useCouple();
  const { sealer } = useChatKey();
  const countdowns = useCoupleData('home', () => listCountdowns(sb, couple.id), [sb, couple.id, 'capsule']);
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('20:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    if (editing) {
      const at = new Date(editing.capsule.deliver_at);
      setText(editing.text);
      setDate(toDateKey(at));
      setTime(hm(at));
    } else {
      setText('');
      setDate(toDateKey(new Date(Date.now() + 30 * 86_400_000)));
      setTime('20:00');
    }
  }, [open, editing]);

  const at = capsuleMoment(date, time);
  const problem = capsuleProblem(at);
  const picks = capsuleDatePicks(countdowns.data ?? [], partner.display_name);

  async function seal(e: FormEvent) {
    e.preventDefault();
    if (!at || problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const cipher = await sealer();
      if (!cipher) throw new Error('Time capsules need encrypted chat. It turns on once you both have the new app.');
      if (editing) await editCapsule(sb, editing.capsule, { text, at }, cipher);
      else await sealCapsule(sb, { coupleId: couple.id, me: me.id }, text, at, cipher);
      channel.sendChanged(CAPSULE_TOPIC);
      onDone(formatCapsuleMoment(at));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit time capsule' : 'Time capsule'}
      description={`Write it now. ${partner.display_name} can read it only when it opens: they’ll know something is waiting, nothing more.`}
    >
      <form onSubmit={seal} className="space-y-4">
        <TextAreaField label="Your message" value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={4000} placeholder="Dear future us…" required autoFocus />
        <fieldset className="space-y-2">
          <legend className="text-small font-medium text-ink">Opens on</legend>
          <div className="flex flex-wrap gap-2">
            {picks.map((p) => (
              <Chip key={p.label} selected={date === p.date} onClick={() => setDate(p.date)}>
                {p.label}
              </Chip>
            ))}
          </div>
          <Field label="Date" type="date" value={date} min={toDateKey(new Date())} onChange={(e) => e.target.value && setDate(e.target.value)} required />
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-small font-medium text-ink">At</legend>
          <div className="flex flex-wrap gap-2">
            {CAPSULE_TIMES.map((t) => (
              <Chip key={t.time} selected={time === t.time} onClick={() => setTime(t.time)}>
                {t.label} {t.time}
              </Chip>
            ))}
          </div>
          <Field label="Time" type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} required />
        </fieldset>
        <p aria-live="polite" className="rounded-sheet bg-gold-50 px-4 py-3 font-semibold text-gold-800">
          {at ? `Opens ${formatCapsuleMoment(at)}` : 'Pick a date and a time'}
          {at && problem ? <span className="block text-small font-normal text-rose-700">{problem}</span> : null}
        </p>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <div className="flex justify-end">
          <Button type="submit" loading={busy} disabled={!text.trim() || !at || !!problem}>
            {editing ? 'Save' : 'Seal it 💌'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

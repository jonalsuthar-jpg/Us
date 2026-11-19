'use client';

import { firstRunCountdowns, friendlyError, offerFirstRun, saveFirstRun, setupDoneKey } from '@us/shared';
import { useCouple } from '@us/shared/react';
import { ImagePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { pushPermission, requestPushPermission } from '@/lib/push';

type Step = 'dates' | 'photo' | 'notify';

/**
 * A short welcome for a new couple: the dates that matter (anniversary,
 * birthdays) become countdowns on Home, a photo of the two of you, and
 * notifications. Every step saves on its own and can be skipped; it's offered
 * once per person on this browser.
 */
export function FirstRunSetup({ hasPhoto, onPhoto, onSaved }: { hasPhoto: boolean; onPhoto: (file: File) => Promise<void>; onSaved: () => void }) {
  const { sb, couple, me, partner, channel } = useCouple();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('dates');
  const [dates, setDates] = useState({ anniversary: '', myBirthday: '', theirBirthday: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const welcome = new URLSearchParams(location.search).get('welcome') === '1';
      if (!localStorage.getItem(setupDoneKey(me.id)) && (welcome || offerFirstRun(couple.paired_at))) setOpen(true);
    } catch {
      // no storage: don't nag
    }
  }, [me.id, couple.paired_at]);

  const finish = () => {
    try {
      localStorage.setItem(setupDoneKey(me.id), '1');
    } catch {
      // ignore
    }
    setOpen(false);
  };
  const next = () => {
    setError(null);
    if (step === 'dates') setStep(hasPhoto ? 'notify' : 'photo');
    else if (step === 'photo') setStep('notify');
    else finish();
  };

  async function saveDates() {
    const rows = firstRunCountdowns(dates, { me: me.display_name, partner: partner.display_name });
    if (!rows.length) return next();
    setBusy(true);
    try {
      await saveFirstRun(sb, { coupleId: couple.id, meId: me.id }, rows);
      channel.sendChanged('home');
      onSaved();
      next();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && finish()}
      title={step === 'dates' ? 'The days that matter' : step === 'photo' ? 'A photo of you two' : 'Know when they reach out'}
      description={
        step === 'dates'
          ? 'Home counts down to each one. Add what you know; you can change them any time.'
          : step === 'photo'
            ? 'It sits at the top of Home for both of you.'
            : `So you hear when ${partner.display_name} messages, calls or thinks of you.`
      }
    >
      {step === 'dates' ? (
        <div className="space-y-4">
          <Field label="When did you get together?" type="date" value={dates.anniversary} onChange={(e) => setDates({ ...dates, anniversary: e.target.value })} />
          <Field label="Your birthday" type="date" value={dates.myBirthday} onChange={(e) => setDates({ ...dates, myBirthday: e.target.value })} />
          <Field label={`${partner.display_name}’s birthday`} type="date" value={dates.theirBirthday} onChange={(e) => setDates({ ...dates, theirBirthday: e.target.value })} />
          {error ? (
            <p role="alert" className="text-small text-rose-700">
              {error}
            </p>
          ) : null}
          <div className="flex justify-between gap-3 pt-2">
            <Button variant="quiet" onClick={next}>
              Skip
            </Button>
            <Button loading={busy} onClick={() => void saveDates()}>
              Save and continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'photo' ? (
        <div className="space-y-4">
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              try {
                await onPhoto(f);
                next();
              } catch (err) {
                setError(friendlyError(err));
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button block loading={busy} onClick={() => file.current?.click()}>
            <ImagePlus className="h-4 w-4" /> Choose a photo
          </Button>
          {error ? (
            <p role="alert" className="text-small text-rose-700">
              {error}
            </p>
          ) : null}
          <Button variant="quiet" block onClick={next}>
            Later
          </Button>
        </div>
      ) : null}

      {step === 'notify' ? (
        <div className="space-y-3">
          <Button
            block
            disabled={pushPermission()}
            onClick={async () => {
              await requestPushPermission().catch(() => false);
              finish();
            }}
          >
            {pushPermission() ? 'Notifications are on' : 'Turn on notifications'}
          </Button>
          <Button variant="quiet" block onClick={finish}>
            {pushPermission() ? 'Done' : 'Not now'}
          </Button>
        </div>
      ) : null}
    </Dialog>
  );
}

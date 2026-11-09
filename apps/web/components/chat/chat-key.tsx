'use client';

import { fromBase64, MIN_PIN_LENGTH, shortCode } from '@us/shared';
import { useChatKey, useCouple } from '@us/shared/react';
import { Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';

const PIN_ERRORS: Record<string, string> = {
  wrong_pin: 'That isn’t your chat PIN.',
  no_backup: 'You haven’t set a chat PIN yet. Allow this browser from another device you’re signed in on.',
  pin_too_short: `Use at least ${MIN_PIN_LENGTH} characters.`,
};

/** Set (`mode: 'set'`) or enter (`'unlock'`) the chat PIN. */
export function PinDialog({ mode, open, onClose }: { mode: 'set' | 'unlock'; open: boolean; onClose: () => void }) {
  const { setPin, unlockWithPin } = useChatKey();
  const [pin, setPinText] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'set' && pin.length < MIN_PIN_LENGTH) return setError(PIN_ERRORS.pin_too_short!);
    if (mode === 'set' && pin !== again) return setError('The two don’t match.');
    setBusy(true);
    try {
      await (mode === 'set' ? setPin(pin) : unlockWithPin(pin));
      setPinText('');
      setAgain('');
      onClose();
    } catch (err) {
      setError(PIN_ERRORS[(err as Error).message] ?? 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={mode === 'set' ? 'Set a chat PIN' : 'Enter your chat PIN'}
      description={
        mode === 'set'
          ? `Your chat is end-to-end encrypted. This PIN lets a new phone or browser read it when none of your other devices is around. Use at least ${MIN_PIN_LENGTH} characters; we can’t reset it for you.`
          : 'Your chat PIN opens your encrypted messages in this browser.'
      }
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <Field label="Chat PIN" type="password" autoFocus autoComplete="off" value={pin} onChange={(e) => setPinText(e.target.value)} error={mode === 'unlock' ? error : null} />
        {mode === 'set' ? (
          <Field label="Once more" type="password" autoComplete="off" value={again} onChange={(e) => setAgain(e.target.value)} error={error} />
        ) : null}
        <Button type="submit" block loading={busy}>
          {mode === 'set' ? 'Save PIN' : 'Unlock'}
        </Button>
        {busy && mode === 'unlock' ? <p className="text-micro text-ink-muted">Checking… this takes a few seconds.</p> : null}
      </form>
    </Dialog>
  );
}

/**
 * Over the thread: this browser is waiting for the chat key, or I should
 * have a PIN backup and don't yet. Old messages being encrypted shows here too.
 */
export function ChatKeyBanner() {
  const { status, myCode, hasBackup, migrating, refresh, waitingFor } = useChatKey();
  const { partner } = useCouple();
  const [dialog, setDialog] = useState<'set' | 'unlock' | null>(null);

  let banner: { text: string; action?: string; mode?: 'set' | 'unlock' | 'retry' } | null = null;
  if (status === 'unavailable') {
    banner = { text: 'Encryption isn’t working on this browser yet, so messages are sent as before.', action: 'Retry', mode: 'retry' };
  } else if (status === 'waiting' && waitingFor === 'partner') {
    // My first device: my partner's app shares the key with it the next time it's open.
    banner = {
      text: `Waiting for ${partner.display_name} to open Us, so their app can share the key with this browser.`,
      ...(hasBackup ? { action: 'Use chat PIN', mode: 'unlock' as const } : null),
    };
  } else if (status === 'waiting') {
    banner = {
      text: `Open Us on another device you’re signed in on and allow this browser. Code ${myCode ?? ''}.`,
      action: 'Use chat PIN',
      mode: 'unlock',
    };
  } else if (status === 'ready' && hasBackup === false) {
    banner = { text: 'Your chat is end-to-end encrypted. Set a PIN so you can read it on a new device.', action: 'Set PIN', mode: 'set' };
  } else if (migrating) {
    banner = { text: 'Encrypting your earlier messages…' };
  }

  return (
    <>
      {banner ? (
        <div className="flex items-center gap-3 border-b border-paper-edge bg-paper-sunken px-4 py-2 text-small">
          <Lock className="h-4 w-4 shrink-0" aria-hidden />
          <p className="flex-1">{banner.text}</p>
          {banner.action ? (
            <button type="button" onClick={() => (banner!.mode === 'retry' ? refresh() : setDialog(banner!.mode as 'set' | 'unlock'))} className="font-medium text-rose-700 underline-offset-4 hover:underline">
              {banner.action}
            </button>
          ) : null}
        </div>
      ) : null}
      <PinDialog mode={dialog ?? 'set'} open={dialog !== null} onClose={() => setDialog(null)} />
    </>
  );
}

/** Anywhere in the app: another of my devices is asking for the chat key. */
export function ChatKeyApproval() {
  const { pending, approve, dismiss } = useChatKey();
  const [busy, setBusy] = useState(false);
  const next = pending[0];
  if (!next) return null;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && dismiss(next.device.id)}
      title="Allow a new device?"
      description={`${next.device.label} wants to read your encrypted chat. Allow it only if it’s yours and it shows this code:`}
    >
      <p className="mb-6 text-center font-display text-title tracking-widest">{next.code}</p>
      <div className="flex flex-col gap-3">
        <Button
          block
          loading={busy}
          onClick={() => {
            setBusy(true);
            void approve(next.device.id).finally(() => setBusy(false));
          }}
        >
          Allow
        </Button>
        <Button block variant="secondary" onClick={() => dismiss(next.device.id)}>
          Not now
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * Settings: our devices that can read the chat, each with its code (the same
 * code on that device means nobody slipped in a key of their own), my PIN,
 * and signing a device of mine out of the chat.
 */
export function ChatSecurity({ meId, partnerName }: { meId: string; partnerName: string }) {
  const { status, devices, myDeviceId, hasBackup, revoke } = useChatKey();
  const [dialog, setDialog] = useState<'set' | 'unlock' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const mine = devices.filter((d) => d.user_id === meId);
  const theirs = devices.filter((d) => d.user_id !== meId);
  const row = (d: (typeof devices)[number], canRevoke: boolean) => (
    <li key={d.id} className="flex items-center justify-between gap-3 py-2">
      <span>
        <span className="block text-body text-ink">
          {d.label}
          {d.id === myDeviceId ? <span className="text-ink-muted"> · this browser</span> : null}
        </span>
        <span className="font-mono text-small tracking-wider text-ink-soft">{shortCode(fromBase64(d.public_key))}</span>
      </span>
      {canRevoke && d.id !== myDeviceId ? (
        <Button
          size="sm"
          variant="secondary"
          loading={busy === d.id}
          onClick={() => {
            setBusy(d.id);
            void revoke(d.id).finally(() => setBusy(null));
          }}
        >
          Sign out
        </Button>
      ) : null}
    </li>
  );
  return (
    <div className="space-y-4">
      <p className="text-small text-ink-soft">
        {status === 'ready'
          ? `Messages, photos, voice notes and reactions are encrypted on your devices. Only you and ${partnerName} can read them; not even we can. Each device has a code: if it shows the same code on that device, it’s really yours.`
          : status === 'waiting'
            ? 'This browser can’t read your encrypted chat yet. Allow it from another device, or use your chat PIN.'
            : 'Checking your chat keys…'}
      </p>
      <div>
        <h3 className="text-small font-medium text-ink">Your devices</h3>
        <ul className="divide-y divide-paper-edge">{mine.map((d) => row(d, true))}</ul>
      </div>
      {theirs.length ? (
        <div>
          <h3 className="text-small font-medium text-ink">{`${partnerName}’s devices`}</h3>
          <ul className="divide-y divide-paper-edge">{theirs.map((d) => row(d, false))}</ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {status === 'ready' ? (
          <Button variant="secondary" onClick={() => setDialog('set')}>
            {hasBackup ? 'Change chat PIN' : 'Set chat PIN'}
          </Button>
        ) : status === 'waiting' ? (
          <Button variant="secondary" onClick={() => setDialog('unlock')}>
            Use chat PIN
          </Button>
        ) : null}
      </div>
      <PinDialog mode={dialog ?? 'set'} open={dialog !== null} onClose={() => setDialog(null)} />
    </div>
  );
}

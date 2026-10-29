'use client';

import { clearMyPhoto, deleteAccount, friendlyError, setMyPhoto, unpair, updateMyProfile } from '@us/shared';
import { COUPLE_ENDED_TOPIC, useAccess, useCouple } from '@us/shared/react';
import { BellRing, Camera, Check, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { env } from '@/lib/env';
import { logoutPush, pushPermission, requestPushPermission } from '@/lib/push';
import { playChime } from '@/lib/sounds';
import { getThemePref, setThemePref, type ThemePref } from '@/lib/theme';

export default function SettingsPage() {
  const { sb, me, partner, mySlot, partnerSlot, couple, channel, myPhotoPath, photosChanged } = useCouple();
  const isAdmin = useAccess()?.is_admin ?? false;
  const router = useRouter();
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function photoAction(run: () => Promise<unknown>) {
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      await run();
      photosChanged();
    } catch (e) {
      setPhotoError(friendlyError(e));
    } finally {
      setPhotoBusy(false);
    }
  }
  const [name, setName] = useState(me.display_name);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [push, setPush] = useState(false);
  const [theme, setTheme] = useState<ThemePref>('system');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fromReset, setFromReset] = useState(false);
  const [leaving, setLeaving] = useState<'unpair' | 'delete' | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  useEffect(() => {
    setPush(pushPermission());
    setTheme(getThemePref());
    // Arrived from a password-reset email: jump straight to choosing a new one.
    if (new URLSearchParams(location.search).has('reset')) {
      setFromReset(true);
      document.getElementById('new-password')?.focus();
    }
  }, []);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    const { error: err } = await sb.auth.updateUser({ password: newPassword });
    if (err) setPasswordMsg({ ok: false, text: friendlyError(err) });
    else {
      setPasswordMsg({ ok: true, text: 'Password updated.' });
      setNewPassword('');
      setFromReset(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await updateMyProfile(sb, me.id, { display_name: name.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-12 px-5 py-10 sm:px-10 sm:py-16">
      <header>
        <h1 className="font-display text-title text-ink">Settings</h1>
      </header>

      {isAdmin && (
        <Link href="/admin" className="block rounded-sheet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
          <Sheet tone="note" accent="plum" pad="sm" className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-plum-700" aria-hidden />
            <span className="flex-1 text-small text-ink">Admin console: requests, people, features</span>
          </Sheet>
        </Link>
      )}

      <section aria-labelledby="you" className="space-y-5">
        <h2 id="you" className="font-display text-heading text-ink">
          You
        </h2>
        <div className="flex items-center gap-5">
          <Avatar name={me.display_name} slot={mySlot} size="lg" />
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" loading={photoBusy} onClick={() => photoInput.current?.click()}>
                {!photoBusy && <Camera className="h-4 w-4" />} {myPhotoPath ? 'Change photo' : 'Add a profile photo'}
              </Button>
              {myPhotoPath ? (
                <Button
                  type="button"
                  variant="quiet"
                  size="sm"
                  disabled={photoBusy}
                  onClick={() => void photoAction(() => clearMyPhoto(sb, { id: me.id, avatar_url: myPhotoPath }))}
                >
                  Remove photo
                </Button>
              ) : null}
            </div>
            <p className="text-small text-ink-muted">Only {partner.display_name} can see it.</p>
            {photoError ? <p className="text-small text-rose-700">{photoError}</p> : null}
          </div>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void photoAction(() => setMyPhoto(sb, { id: me.id, avatar_url: myPhotoPath }, couple.id, file, file.type || 'image/jpeg'));
            }}
          />
        </div>
        <form onSubmit={save} className="flex items-end gap-3">
          <div className="flex-1">
            <Field label="Your name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} error={error} />
          </div>
          <Button type="submit" variant="secondary" disabled={!name.trim() || name === me.display_name}>
            {saved ? <Check className="h-4 w-4" /> : null}
            {saved ? 'Saved' : 'Save'}
          </Button>
        </form>
      </section>

      <section aria-labelledby="password" className="space-y-4">
        <h2 id="password" className="font-display text-heading text-ink">
          Password
        </h2>
        {fromReset && <p className="text-small text-ink-soft">You’re signed in from the reset link. Choose a new password.</p>}
        <form onSubmit={changePassword} className="flex items-end gap-3">
          <div className="flex-1">
            <Field
              id="new-password"
              label="New password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              hint="At least 8 characters."
              error={passwordMsg && !passwordMsg.ok ? passwordMsg.text : null}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={newPassword.length < 8} className="mb-7">
            Update
          </Button>
        </form>
        {passwordMsg?.ok && (
          <p className="text-small text-sage-700" role="status">
            {passwordMsg.text}
          </p>
        )}
      </section>

      <section aria-labelledby="pair" className="space-y-4">
        <h2 id="pair" className="font-display text-heading text-ink">
          The two of you
        </h2>
        <Sheet pad="md" className="flex items-center gap-4">
          <div className="flex -space-x-3">
            <Avatar name={me.display_name} slot={mySlot} />
            <Avatar name={partner.display_name} slot={partnerSlot} />
          </div>
          <p className="text-small text-ink-soft">
            Paired with <span className="font-medium text-ink">{partner.display_name}</span> since{' '}
            {new Date(couple.paired_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.
            Your colour is {mySlot === 'a' ? 'rose' : 'teal'}; theirs is {partnerSlot === 'a' ? 'rose' : 'teal'}.
          </p>
        </Sheet>
        <div className="space-y-2 text-small text-ink-soft">
          <p>How privacy is shown everywhere in Us:</p>
          <div className="flex flex-wrap gap-2">
            <PrivacyBadge privacy="shared" partnerName={partner.display_name} />
            <PrivacyBadge privacy="private" partnerName={partner.display_name} />
            <PrivacyBadge privacy="private-until-reveal" partnerName={partner.display_name} />
          </div>
        </div>
      </section>

      <section aria-labelledby="appearance" className="space-y-4">
        <h2 id="appearance" className="font-display text-heading text-ink">
          Appearance
        </h2>
        <Segmented
          label="Theme"
          options={[
            { value: 'system', label: 'Match device' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={theme}
          onChange={(t) => {
            setTheme(t);
            setThemePref(t);
          }}
        />
        <p className="text-small text-ink-muted">Saved on this device. Calls always use the night palette.</p>
      </section>

      <section aria-labelledby="notify" className="space-y-4">
        <h2 id="notify" className="font-display text-heading text-ink">
          Notifications
        </h2>
        {env.oneSignalAppId ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={push ? 'secondary' : 'primary'}
              disabled={push}
              onClick={async () => setPush(await requestPushPermission())}
            >
              <BellRing className="h-4 w-4" /> {push ? 'Notifications on' : 'Turn on notifications'}
            </Button>
            <Button variant="quiet" onClick={playChime}>
              Hear the chime
            </Button>
          </div>
        ) : (
          <p className="text-small text-ink-muted">
            Push isn’t configured for this deployment (set NEXT_PUBLIC_ONESIGNAL_APP_ID).{' '}
            <button className="underline underline-offset-2" onClick={playChime}>
              Hear the chime
            </button>
          </p>
        )}
      </section>

      <section aria-labelledby="leaving" className="space-y-4">
        <h2 id="leaving" className="font-display text-heading text-ink">
          Leaving
        </h2>
        <p className="text-small text-ink-soft">
          Unpairing deletes everything you and {partner.display_name} share, for both of you: messages, plans, memories and their photos, and
          your daily answers. Deleting your account removes all of it, and you.
        </p>
        {leaveError && <p role="alert" className="text-small text-rose-700">{leaveError}</p>}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            loading={leaving === 'unpair'}
            disabled={!!leaving}
            onClick={async () => {
              const typed = window.prompt(
                `This deletes everything you share with ${partner.display_name}, for both of you, and can’t be undone.\n\nType UNPAIR to confirm.`,
              );
              if (typed?.trim().toUpperCase() !== 'UNPAIR') return;
              setLeaveError(null);
              setLeaving('unpair');
              try {
                channel.sendChanged(COUPLE_ENDED_TOPIC);
                await unpair(sb, couple.id);
                window.location.assign('/pair');
              } catch (err) {
                setLeaveError(friendlyError(err));
                setLeaving(null);
              }
            }}
          >
            Unpair
          </Button>
          <Button
            variant="quiet"
            loading={leaving === 'delete'}
            disabled={!!leaving}
            onClick={async () => {
              const typed = window.prompt('This permanently deletes your account and everything you share. It can’t be undone.\n\nType DELETE to confirm.');
              if (typed?.trim().toUpperCase() !== 'DELETE') return;
              setLeaveError(null);
              setLeaving('delete');
              try {
                channel.sendChanged(COUPLE_ENDED_TOPIC);
                await deleteAccount(sb);
                await logoutPush();
                await sb.auth.signOut().catch(() => {});
                window.location.assign('/sign-up');
              } catch (err) {
                setLeaveError(friendlyError(err));
                setLeaving(null);
              }
            }}
          >
            Delete my account
          </Button>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 border-t border-paper-edge pt-8">
        <Link href="/design" className="text-small text-ink-soft underline-offset-4 hover:underline">
          Design system
        </Link>
        <Button
          variant="secondary"
          onClick={async () => {
            await logoutPush();
            await sb.auth.signOut();
            router.replace('/sign-in');
          }}
        >
          Sign out
        </Button>
      </section>
    </div>
  );
}

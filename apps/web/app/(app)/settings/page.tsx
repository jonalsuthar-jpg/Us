'use client';

import { friendlyError, updateMyProfile } from '@us/shared';
import { useCouple } from '@us/shared/react';
import { BellRing, Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Sheet } from '@/components/ui/sheet';
import { env } from '@/lib/env';
import { logoutPush, pushPermission, requestPushPermission } from '@/lib/push';
import { playChime } from '@/lib/sounds';

export default function SettingsPage() {
  const { sb, me, partner, mySlot, partnerSlot, couple } = useCouple();
  const router = useRouter();
  const [name, setName] = useState(me.display_name);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [push, setPush] = useState(false);

  useEffect(() => setPush(pushPermission()), []);

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

      <section aria-labelledby="you" className="space-y-5">
        <h2 id="you" className="font-display text-heading text-ink">
          You
        </h2>
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

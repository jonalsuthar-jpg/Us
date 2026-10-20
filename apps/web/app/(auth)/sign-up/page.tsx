'use client';

import { friendlyError } from '@us/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { getSupabase } from '@/lib/supabase/client';

/**
 * There's no public directory of users and nothing to "join" — signing up
 * creates one half of a couple. Pairing happens next, by invite code.
 */
export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await getSupabase().auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name.trim() },
          emailRedirectTo: `${location.origin}/auth/callback?next=/pair`,
        },
      });
      if (error) throw error;
      if (data.session) {
        router.replace('/pair');
        router.refresh();
      } else {
        setConfirm(true);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (confirm) {
    return (
      <div className="space-y-4">
        <h2 className="font-display text-title text-ink">One more step.</h2>
        <p className="text-ink-soft">
          Confirm your email from the link we sent to <strong className="font-medium text-ink">{email}</strong>, then
          you’ll pair with your person.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <div>
        <h2 className="font-display text-title text-ink">Make a space for two.</h2>
        <p className="mt-1 text-ink-soft">You’ll invite your partner right after.</p>
      </div>

      <div className="space-y-4">
        <Field
          label="What should they call you?"
          autoComplete="nickname"
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="At least 8 characters."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && (
        <Sheet tone="note" accent="rose" pad="sm" role="alert" className="text-small text-rose-800">
          {error}
        </Sheet>
      )}

      <Button type="submit" block size="lg" loading={busy} disabled={!name.trim() || !email}>
        Create account
      </Button>

      <p className="border-t border-paper-edge pt-6 text-small text-ink-soft">
        Already have one?{' '}
        <Link href="/sign-in" className="font-medium text-rose-700 underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

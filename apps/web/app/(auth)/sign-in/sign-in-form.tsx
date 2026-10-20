'use client';

import { friendlyError } from '@us/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { getSupabase } from '@/lib/supabase/client';

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/talk';
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sb = getSupabase();
    try {
      if (mode === 'password') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      } else {
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;
        setSent(true);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <h2 className="font-display text-title text-ink">Check your inbox.</h2>
        <p className="text-ink-soft">
          We sent a sign-in link to <strong className="font-medium text-ink">{email}</strong>. It works once.
        </p>
        <Button variant="quiet" onClick={() => setSent(false)}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <div>
        <h2 className="font-display text-title text-ink">Welcome back.</h2>
        <p className="mt-1 text-ink-soft">Sign in to your shared space.</p>
      </div>

      <div className="space-y-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {mode === 'password' && (
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </div>

      {error && (
        <Sheet tone="note" accent="rose" pad="sm" role="alert" className="text-small text-rose-800">
          {error}
        </Sheet>
      )}

      <div className="space-y-3">
        <Button type="submit" block size="lg" loading={busy}>
          {mode === 'password' ? 'Sign in' : 'Email me a link'}
        </Button>
        <Button
          type="button"
          variant="quiet"
          block
          onClick={() => {
            setMode(mode === 'password' ? 'magic' : 'password');
            setError(null);
          }}
        >
          {mode === 'password' ? 'Sign in with a magic link instead' : 'Use my password instead'}
        </Button>
      </div>

      <p className="border-t border-paper-edge pt-6 text-small text-ink-soft">
        New here?{' '}
        <Link href="/sign-up" className="font-medium text-rose-700 underline-offset-4 hover:underline">
          Create your space
        </Link>
      </p>
    </form>
  );
}

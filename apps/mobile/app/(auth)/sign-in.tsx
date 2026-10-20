import { friendlyError } from '@us/shared';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { AuthFrame } from '@/components/auth-frame';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { Display, Text } from '@/components/ui/text';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else router.replace('/home');
  }

  async function forgot() {
    const address = email.trim();
    if (!address) return setError('Enter your email first, then tap “Forgot your password?”.');
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(
      address,
      env.webUrl ? { redirectTo: `${env.webUrl}/auth/callback?next=${encodeURIComponent('/settings?reset=1')}` } : undefined,
    );
    if (error) setError(friendlyError(error));
    else Alert.alert('Check your inbox', `We sent a link to reset your password to ${address}. Open it to choose a new one.`);
  }

  return (
    <AuthFrame>
      <Display className="text-title">Welcome back.</Display>
      <Text className="mt-1 text-ink-soft">Sign in to your shared space.</Text>
      <View className="mt-6 gap-4">
        <Field label="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <Field label="Password" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} onSubmitEditing={submit} />
        <Pressable accessibilityRole="button" onPress={forgot} hitSlop={8} className="self-start">
          <Text className="text-small text-ink-soft underline">Forgot your password?</Text>
        </Pressable>
        {error && (
          <Sheet tone="note" accent="rose" pad="sm">
            <Text accessibilityRole="alert" className="text-small text-rose-800">
              {error}
            </Text>
          </Sheet>
        )}
        <Button size="lg" loading={busy} disabled={!email || !password} onPress={submit}>
          Sign in
        </Button>
      </View>
      <View className="mt-8 flex-row border-t border-paper-edge pt-6">
        <Text className="text-small text-ink-soft">New here? </Text>
        <Link href="/sign-up" replace>
          <Text className="font-sans-medium text-small text-rose-700">Create your space</Text>
        </Link>
      </View>
    </AuthFrame>
  );
}

import { friendlyError } from '@us/shared';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AuthFrame } from '@/components/auth-frame';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { Display, Text } from '@/components/ui/text';
import { supabase } from '@/lib/supabase';

export default function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() } },
    });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else if (data.session) router.replace('/pair');
    else setConfirm(true);
  }

  if (confirm) {
    return (
      <AuthFrame>
        <Display className="text-title">One more step.</Display>
        <Text className="mt-2 text-ink-soft">
          Confirm your email from the link we sent to {email}, then come back and sign in.
        </Text>
        <Button variant="secondary" className="mt-6" onPress={() => router.replace('/sign-in')}>
          Back to sign in
        </Button>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <Display className="text-title">Make a space for two.</Display>
      <Text className="mt-1 text-ink-soft">You’ll invite your partner right after.</Text>
      <View className="mt-6 gap-4">
        <Field label="What should they call you?" autoComplete="nickname" maxLength={60} value={name} onChangeText={setName} />
        <Field label="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <Field label="Password" hint="At least 8 characters." secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} />
        {error && (
          <Sheet tone="note" accent="rose" pad="sm">
            <Text accessibilityRole="alert" className="text-small text-rose-800">
              {error}
            </Text>
          </Sheet>
        )}
        <Button size="lg" loading={busy} disabled={!name.trim() || !email} onPress={submit}>
          Create account
        </Button>
      </View>
      <View className="mt-8 flex-row border-t border-paper-edge pt-6">
        <Text className="text-small text-ink-soft">Already have one? </Text>
        <Link href="/sign-in" replace>
          <Text className="font-sans-medium text-small text-rose-700">Sign in</Text>
        </Link>
      </View>
    </AuthFrame>
  );
}

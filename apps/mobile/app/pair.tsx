import {
  createInvite,
  formatInviteCode,
  friendlyError,
  getCoupleContext,
  redeemInvite,
  watchForPairing,
  type CoupleContext,
  type Invite,
} from '@us/shared';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Seal } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Sheet } from '@/components/ui/sheet';
import { Display, Text } from '@/components/ui/text';
import { supabase } from '@/lib/supabase';
import { usePalette } from '@/components/ui/palette';

type Step = 'loading' | 'choose' | 'invite' | 'join' | 'paired';

export default function Pair() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [code, setCode] = useState('');
  const c = usePalette();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paired, setPaired] = useState<CoupleContext | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return router.replace('/sign-in');
      setUserId(data.user.id);
      const ctx = await getCoupleContext(supabase, data.user.id).catch(() => null);
      if (ctx) router.replace('/home');
      else setStep('choose');
    });
  }, []);

  useEffect(() => {
    if (step !== 'invite' || !userId) return;
    return watchForPairing(supabase, userId, onPaired);
  }, [step, userId]);

  function onPaired(ctx: CoupleContext) {
    setPaired(ctx);
    setStep('paired');
    setTimeout(() => router.replace('/home'), 2200);
  }

  async function startInvite() {
    setBusy(true);
    setError(null);
    try {
      setInvite(await createInvite(supabase));
      setStep('invite');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      await redeemInvite(supabase, code);
      const ctx = await getCoupleContext(supabase, userId);
      if (ctx) onPaired(ctx);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
      contentContainerClassName="flex-grow px-6"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Seal size={28} />
          <Display italic className="text-heading">
            Us
          </Display>
        </View>
        <Button
          variant="quiet"
          size="sm"
          onPress={async () => {
            await supabase.auth.signOut();
            router.replace('/sign-in');
          }}
        >
          Sign out
        </Button>
      </View>

      <View className="flex-1 justify-center py-10">
        {step === 'loading' && <ActivityIndicator color={c.rose} />}

        {step === 'choose' && (
          <Animated.View entering={FadeIn}>
            <Display className="text-title">Now, find your person.</Display>
            <Text className="mt-3 text-ink-soft">
              Us only ever holds two people. One of you makes an invite; the other enters it. Once paired, it’s permanent.
            </Text>
            <View className="mt-8 gap-4">
              <Choice accent="rose" title="Invite my partner" body="Get a code to send them however you usually talk." onPress={startInvite} busy={busy} />
              <Choice accent="teal" title="I have a code" body="Your partner already invited you." onPress={() => setStep('join')} />
            </View>
            {error && <Text className="mt-4 text-small text-rose-700">{error}</Text>}
          </Animated.View>
        )}

        {step === 'invite' && invite && (
          <Animated.View entering={FadeIn}>
            <Text className="font-sans-medium text-small text-rose-700">Your invite</Text>
            <Display className="mt-1 text-title">Send them this code.</Display>
            <Sheet pad="lg" className="mt-6 items-center">
              <Text selectable accessibilityLabel={`Invite code ${invite.code.split('').join(' ')}`} className="font-display text-[40px] tracking-[4px]">
                {invite.code}
              </Text>
              <View className="mt-5 flex-row gap-3">
                <Button variant="secondary" onPress={() => void Clipboard.setStringAsync(invite.code)}>
                  Copy
                </Button>
                <Button onPress={() => void Share.share({ message: `Join me on Us — our code is ${invite.code}` })}>Share</Button>
              </View>
              <Text className="mt-5 text-micro text-ink-muted">
                Works once · expires {new Date(invite.expires_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}
              </Text>
            </Sheet>
            <View className="mt-8 flex-row items-center justify-center gap-3">
              <ActivityIndicator size="small" color={c.teal} />
              <Text className="text-ink-soft" accessibilityLiveRegion="polite">
                Waiting for them to join…
              </Text>
            </View>
          </Animated.View>
        )}

        {step === 'join' && (
          <Animated.View entering={FadeIn}>
            <Display className="text-title">Enter their code.</Display>
            <Text className="mt-2 text-ink-soft">Eight letters and numbers — capitals don’t matter.</Text>
            <TextInput
              accessibilityLabel="Invite code"
              autoFocus
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="ABCD-EFGH"
              placeholderTextColor={c.faint}
              value={code}
              onChangeText={(t) => setCode(formatInviteCode(t))}
              className={cn(
                'mt-6 h-20 rounded-control border bg-paper-raised text-center font-display text-[32px] tracking-[4px] text-ink',
                error ? 'border-rose-600' : 'border-paper-edge',
              )}
            />
            {error && <Text accessibilityRole="alert" className="mt-2 text-small text-rose-700">{error}</Text>}
            <View className="mt-5 flex-row gap-3">
              <Button variant="secondary" onPress={() => setStep('choose')}>
                Back
              </Button>
              <Button className="flex-1" loading={busy} disabled={code.length < 9} onPress={join}>
                Pair with them
              </Button>
            </View>
          </Animated.View>
        )}

        {step === 'paired' && paired && (
          <View className="items-center">
            <Animated.View entering={ZoomIn.springify()}>
              <Seal size={140} />
            </Animated.View>
            <Display className="mt-6 text-title">
              You and <Display italic>{paired.partner.display_name}</Display>.
            </Display>
            <Text className="mt-2 text-ink-soft">Your space is ready.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function Choice({ accent, title, body, onPress, busy }: { accent: 'rose' | 'teal'; title: string; body: string; onPress: () => void; busy?: boolean }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy}
      className="overflow-hidden rounded-sheet border border-paper-edge bg-paper-raised p-6 active:bg-paper-sunken"
    >
      <View className={cn('absolute -right-8 -top-8 h-24 w-24 rounded-full', accent === 'rose' ? 'bg-rose-200' : 'bg-teal-200')} />
      <Display className="text-heading">{title}</Display>
      <Text className="mt-2 text-small text-ink-soft">{body}</Text>
      {busy && <ActivityIndicator className="mt-3 self-start" color={c.rose} />}
    </Pressable>
  );
}

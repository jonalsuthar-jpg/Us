import { getCoupleContext, tokens, type CoupleContext } from '@us/shared';
import { CallProvider, CoupleProvider, useCallManager, useCallState, useCouple } from '@us/shared/react';
import { router, Stack, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
import { CallScreen } from '@/components/call/call-screen';
import { TapHeart } from '@/components/tap-heart';
import { env } from '@/lib/env';
import { initPush, onPush } from '@/lib/push';
import { nativeRtc } from '@/lib/rtc';
import { playChime, startRing, stopRing } from '@/lib/sounds';
import { supabase } from '@/lib/supabase';
import { usePalette } from '@/components/ui/palette';

/** Resolves the couple, then mounts realtime + calls for every screen (tabs and settings). */
export default function AppLayout() {
  const [ctx, setCtx] = useState<CoupleContext | null>(null);
  const c = usePalette();

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return router.replace('/sign-in');
      const c = await getCoupleContext(supabase, data.user.id).catch(() => null);
      if (cancelled) return;
      if (!c) router.replace('/pair');
      else setCtx(c);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/sign-in');
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!ctx) {
    return (
      <View className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator color={tokens.colors.rose[400]} />
      </View>
    );
  }

  return (
    <CoupleProvider sb={supabase} context={ctx} platform={Platform.OS} onEnded={() => router.replace('/pair')}>
      <CallProvider rtc={nativeRtc} forceRelay={env.forceRelay}>
        <Bridge />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.paper } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
        </Stack>
        <TapHeart />
        <CallScreen />
      </CallProvider>
    </CoupleProvider>
  );
}

/** Push registration, ringing, the chime, and notification deep links. */
function Bridge() {
  const { me, partner, channel } = useCouple();
  const call = useCallState();
  const calls = useCallManager();
  const pathname = usePathname();
  const path = useRef(pathname);
  path.current = pathname;
  // Answer/Decline tapped on a call notification: acted on once that call is ringing here.
  const [callAction, setCallAction] = useState<{ callId: string; action: 'answer' | 'decline' } | null>(null);

  useEffect(() => {
    initPush(me.id);
    return onPush({
      click: (d, actionId) => {
        if (d?.callId && (actionId === 'answer' || actionId === 'decline')) setCallAction({ callId: d.callId, action: actionId });
        if (d?.url) router.push(d.url as never);
      },
    });
  }, [me.id]);

  useEffect(() => {
    if (!callAction || call.phase !== 'incoming' || call.call?.id !== callAction.callId) return;
    setCallAction(null);
    void (callAction.action === 'answer' ? calls.accept() : calls.decline());
  }, [callAction, call.phase, call.call?.id, calls]);

  useEffect(
    () =>
      channel.messages.on(({ type, row }) => {
        if (type !== 'INSERT' || row.sender_id !== partner.id || row.kind !== 'text') return;
        if (path.current !== '/talk' || AppState.currentState !== 'active') void playChime();
      }),
    [channel, partner.id],
  );

  useEffect(() => {
    if (call.phase === 'incoming') void startRing();
    else stopRing();
    return stopRing;
  }, [call.phase]);

  return null;
}

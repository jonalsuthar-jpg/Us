import { getCoupleContext, getMyAccess, tokens, type CoupleContext, type MyAccess } from '@us/shared';
import { AccessProvider, CallProvider, clearDataCache, CoupleProvider, hydrateDataCache, setDataCacheStore, useCallManager, useCallState, useCouple } from '@us/shared/react';
import * as Linking from 'expo-linking';
import { router, Stack, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
import { CallScreen } from '@/components/call/call-screen';
import { DrawBridge, drawRoute } from '@/components/draw/draw-bridge';
import { TapHeart } from '@/components/tap-heart';
import { readAccess, readBoot, saveAccess, saveContext } from '@/lib/boot-cache';
import { dataCacheStore } from '@/lib/data-cache-store';
import { env } from '@/lib/env';
import { initPush, onPush } from '@/lib/push';
import { nativeRtc } from '@/lib/rtc';
import { playChime, startRing, stopRing } from '@/lib/sounds';
import { supabase } from '@/lib/supabase';
import { usePalette } from '@/components/ui/palette';

// Every screen's last-known data survives a cold start.
setDataCacheStore(dataCacheStore);

/** Resolves access and the couple, then mounts realtime + calls for every screen (tabs and settings). */
export default function AppLayout() {
  const [ctx, setCtx] = useState<CoupleContext | null>(null);
  const [access, setAccess] = useState<MyAccess | null>(null);
  const c = usePalette();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // The session and last-known couple are on the device, so a cold start
      // shows the app at once and checks with the server behind it.
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return router.replace('/sign-in');
      const [cached, cachedAccess] = await Promise.all([readBoot(userId), readAccess(userId), hydrateDataCache()]);
      if (cancelled) return;
      if (cachedAccess.status !== 'approved') return router.replace('/waiting');
      setAccess(cachedAccess);
      if (cached) setCtx(cached);

      const { data: fresh, error } = await supabase.auth.getUser();
      if (cancelled) return;
      // No status means the request never got an answer (offline): keep going on the saved session.
      const offline = !!error && !error.status;
      if (!fresh.user && !(offline && cached)) return router.replace('/sign-in');
      if (offline) return;
      let next: CoupleContext | null;
      try {
        const freshAccess = await getMyAccess(supabase);
        if (cancelled) return;
        saveAccess(userId, freshAccess);
        if (freshAccess.status !== 'approved') return router.replace('/waiting');
        if (JSON.stringify(freshAccess) !== JSON.stringify(cachedAccess)) setAccess(freshAccess);
        next = await getCoupleContext(supabase, userId);
      } catch {
        // Offline: keep the saved couple if we have one.
        if (!cached) router.replace('/pair');
        return;
      }
      if (cancelled) return;
      saveContext(userId, next);
      if (!next) {
        clearDataCache();
        return router.replace('/pair');
      }
      // Swap in the fresh copy only if something changed, so realtime isn't torn down for nothing.
      if (!cached || JSON.stringify(cached) !== JSON.stringify(next)) setCtx(next);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearDataCache();
        router.replace('/sign-in');
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!ctx || !access) {
    return (
      <View className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator color={tokens.colors.rose[400]} />
      </View>
    );
  }

  return (
    <AccessProvider
      sb={supabase}
      userId={ctx.me.id}
      initial={access}
      onBlocked={(a) => {
        saveAccess(ctx.me.id, a);
        router.replace('/waiting');
      }}
    >
    <CoupleProvider sb={supabase} context={ctx} platform={Platform.OS} onEnded={() => router.replace('/pair')}>
      <CallProvider rtc={nativeRtc} forceRelay={env.forceRelay}>
        <Bridge />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.paper } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="questions" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="draw/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="draw/gallery" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="draw/guess" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="draw/daily" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="draw/[id]" options={{ animation: 'fade_from_bottom' }} />
        </Stack>
        <TapHeart />
        <DrawBridge />
        <CallScreen />
      </CallProvider>
    </CoupleProvider>
    </AccessProvider>
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
        if (d?.url) router.push(drawRoute(d.url) as never);
      },
    });
  }, [me.id]);

  // Answer / Decline on the lock-screen ringing screen open us://talk?callId=…&callAction=…
  useEffect(() => {
    const take = (url: string | null) => {
      if (!url) return;
      const { queryParams } = Linking.parse(url);
      const callId = queryParams?.callId;
      const action = queryParams?.callAction;
      if (typeof callId === 'string' && (action === 'answer' || action === 'decline')) setCallAction({ callId, action });
    };
    void Linking.getInitialURL().then(take);
    const sub = Linking.addEventListener('url', (e) => take(e.url));
    return () => sub.remove();
  }, []);

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

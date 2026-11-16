import { clearMediaVault, getCall, getCoupleContext, getMyAccess, preloadChatKey, tokens, type CoupleContext, type MyAccess } from '@us/shared';
import { AccessProvider, CallProvider, clearDataCache, CoupleProvider, currentCallManager, hydrateDataCache, setDataCacheStore, useCallManager, useCallState, useCouple } from '@us/shared/react';
import * as Linking from 'expo-linking';
import { router, Stack, usePathname, type ErrorBoundaryProps } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Platform, ToastAndroid, View } from 'react-native';
import { AppLock } from '@/components/app-lock';
import { CallScreen } from '@/components/call/call-screen';
import { ChatKeyApproval } from '@/components/chat/chat-key';
import { DrawBridge, drawRoute } from '@/components/draw/draw-bridge';
import { TapHeart } from '@/components/tap-heart';
import { readAccess, readBoot, saveAccess, saveContext } from '@/lib/boot-cache';
import { dataCacheStore } from '@/lib/data-cache-store';
import { env } from '@/lib/env';
import { initPush, onPush } from '@/lib/push';
import { nativeRtc } from '@/lib/rtc';
import { playChime, startRing, stopRing } from '@/lib/sounds';
import { stopCallAudio } from '@/lib/audio-route';
import { onCallHandledElsewhere, onHangupRequested, stopCallService } from '@/modules/us-call';
import { supabase } from '@/lib/supabase';
import { usePalette } from '@/components/ui/palette';
import { Button } from '@/components/ui/button';
import { Display, Text } from '@/components/ui/text';

// Every screen's last-known data survives a cold start.
setDataCacheStore(dataCacheStore);

// The call notification's Hang up, which also works once the app is swiped away and the call carries on.
onHangupRequested(() => void currentCallManager()?.hangup());

/** A call that carried on with the app closed is over: let go of the mic and the notification. */
function releaseClosedCall() {
  stopCallAudio();
  stopCallService();
}

// Opened straight into chat from a notification, the tabs are still behind it for Back.
export const unstable_settings = { anchor: '(tabs)' };

/**
 * A screen that throws shows this instead of closing the app, with a way
 * back in. Expo Router uses it for every screen under (app).
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => console.error('[us] screen crashed', error), [error]);
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-paper px-8">
      <Display className="text-center text-heading">Something went wrong here</Display>
      <Text className="text-center text-small text-ink-soft">The rest of Us is fine. Try again, or go back home.</Text>
      <Button onPress={() => void retry()}>Try again</Button>
      <Button variant="quiet" onPress={() => router.replace('/home')}>
        Go home
      </Button>
    </View>
  );
}

/** A short note at the bottom of the screen. */
function notice(text: string) {
  if (Platform.OS === 'android') ToastAndroid.show(text, ToastAndroid.SHORT);
  else Alert.alert(text);
}

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
      // The chat key comes along with the cached couple, so the chat opens already readable.
      const withKey = readBoot(userId).then(async (ctx) => {
        if (ctx) await preloadChatKey(ctx.couple.id);
        return ctx;
      });
      const [cached, cachedAccess] = await Promise.all([withKey, readAccess(userId), hydrateDataCache()]);
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
        void clearMediaVault();
        return router.replace('/pair');
      }
      // Swap in the fresh copy only if something changed, so realtime isn't torn down for nothing.
      if (!cached || JSON.stringify(cached) !== JSON.stringify(next)) setCtx(next);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearDataCache();
        void clearMediaVault();
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
    <CoupleProvider sb={supabase} context={ctx} platform={Platform.OS} onEnded={() => router.replace('/pair')} sleepInBackground>
      <CallProvider rtc={nativeRtc} forceRelay={env.forceRelay} keepCallWhenClosed onClosedCallEnded={releaseClosedCall}>
        <Bridge />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.paper } }}>
          <Stack.Screen name="(tabs)" />
          {/* Singular: a notification tapped while already in chat stays in that chat. */}
          <Stack.Screen name="talk" dangerouslySingular options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="questions" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="draw/index" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="draw/gallery" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="draw/guess" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="draw/daily" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="draw/[id]" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="play/quiz/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="memory-story/[id]" options={{ animation: 'fade_from_bottom' }} />
        </Stack>
        <TapHeart />
        <ChatKeyApproval />
        <DrawBridge />
        <AppLock />
        <CallScreen />
      </CallProvider>
    </CoupleProvider>
    </AccessProvider>
  );
}

/** Push registration, ringing, the chime, and notification deep links. */
function Bridge() {
  const { sb, me, partner, channel } = useCouple();
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

  // Answer tapped on a call that's no longer ringing (taken on my other
  // device, or given up on): say so, rather than open on nothing.
  useEffect(() => {
    if (!callAction) return;
    const { callId, action } = callAction;
    const t = setTimeout(() => {
      setCallAction((a) => (a?.callId === callId ? null : a));
      if (action !== 'answer') return;
      void getCall(sb, callId)
        .then((row) => {
          if (!row || row.status === 'ringing') return;
          notice(row.status === 'active' ? 'Answered on your other device' : 'That call has ended');
        })
        .catch(() => {});
    }, 4000);
    return () => clearTimeout(t);
  }, [callAction, sb]);

  // Answered or declined on my other device, while this one rang.
  useEffect(
    () =>
      onCallHandledElsewhere((callId) => {
        stopRing();
        void getCall(sb, callId)
          .then((row) => row && calls.syncFromRow(row))
          .catch(() => {});
      }),
    [sb, calls],
  );

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

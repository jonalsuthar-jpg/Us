import { getCoupleContext, MODULES, type CoupleContext, type ModuleId } from '@us/shared';
import { CallProvider, CoupleProvider, useCallState, useCouple } from '@us/shared/react';
import { router, Tabs, usePathname } from 'expo-router';
import { HeartHandshake, MessageCircleHeart, NotebookPen, Sparkles, Sprout } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
import { CallScreen } from '@/components/call/call-screen';
import { env } from '@/lib/env';
import { initPush, onPush } from '@/lib/push';
import { nativeRtc } from '@/lib/rtc';
import { playChime, startRing, stopRing } from '@/lib/sounds';
import { supabase } from '@/lib/supabase';

const ICONS: Record<ModuleId, typeof MessageCircleHeart> = {
  talk: MessageCircleHeart,
  connect: HeartHandshake,
  plan: NotebookPen,
  memory: Sparkles,
  growth: Sprout,
};

/** Resolves the couple, then mounts realtime + calls for every tab. */
export default function AppLayout() {
  const [ctx, setCtx] = useState<CoupleContext | null>(null);

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
        <ActivityIndicator color="#C8686B" />
      </View>
    );
  }

  return (
    <CoupleProvider sb={supabase} context={ctx} platform={Platform.OS}>
      <CallProvider rtc={nativeRtc} forceRelay={env.forceRelay}>
        <Bridge />
        <AppTabs />
        <CallScreen />
      </CallProvider>
    </CoupleProvider>
  );
}

function AppTabs() {
  const { unread } = useCouple();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2A1F2D',
        tabBarInactiveTintColor: '#7F6683',
        tabBarStyle: { backgroundColor: '#FAF6F1', borderTopColor: '#E4D9CC' },
        tabBarLabelStyle: { fontFamily: 'WorkSans_500Medium', fontSize: 11 },
        sceneStyle: { backgroundColor: '#FAF6F1' },
      }}
    >
      {MODULES.map((m) => {
        const Icon = ICONS[m.id];
        return (
          <Tabs.Screen
            key={m.id}
            name={m.id}
            options={{
              title: m.title,
              tabBarIcon: ({ color, focused }) => <Icon size={22} color={color} strokeWidth={focused ? 2.25 : 1.75} />,
              tabBarBadge: m.id === 'talk' && unread > 0 ? unread : undefined,
              tabBarBadgeStyle: { backgroundColor: '#9E4247', fontSize: 11 },
            }}
          />
        );
      })}
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}

/** Push registration, ringing, the chime, and notification deep links. */
function Bridge() {
  const { me, partner, channel } = useCouple();
  const call = useCallState();
  const pathname = usePathname();
  const path = useRef(pathname);
  path.current = pathname;

  useEffect(() => {
    initPush(me.id);
    return onPush({ click: (d) => d?.url && router.push(d.url as never) });
  }, [me.id]);

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

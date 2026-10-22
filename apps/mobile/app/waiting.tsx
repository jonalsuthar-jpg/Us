import { getMyAccess, watchMyAccess, type MyAccess } from '@us/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Seal } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { usePalette } from '@/components/ui/palette';
import { Sheet } from '@/components/ui/sheet';
import { Display, Text } from '@/components/ui/text';
import { saveAccess } from '@/lib/boot-cache';
import { supabase } from '@/lib/supabase';

const COPY: Record<'pending' | 'rejected' | 'suspended', { title: string; body: string }> = {
  pending: {
    title: 'You’re on the list.',
    body: 'Us is opening up a few couples at a time. Your request is in, and we’ll let you in shortly.',
  },
  rejected: {
    title: 'We can’t let you in just now.',
    body: 'Your request to join Us wasn’t approved this time.',
  },
  suspended: {
    title: 'Your account is paused.',
    body: 'Access to Us has been paused for this account. If you think this is a mistake, get in touch.',
  },
};

/** Where someone waits until an admin lets them in. Moves on by itself once they're approved. */
export default function Waiting() {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const [access, setAccess] = useState<MyAccess | null>(null);

  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    let userId: string | null = null;
    const check = async () => {
      const a = await getMyAccess(supabase).catch(() => null);
      if (cancelled || !a) return;
      if (userId) saveAccess(userId, a);
      if (a.status === 'approved') router.replace('/pair');
      else setAccess(a);
    };
    void supabase.auth.getSession().then(({ data }) => {
      userId = data.session?.user.id ?? null;
      if (!userId) return router.replace('/sign-in');
      void check();
      stop = watchMyAccess(supabase, userId, () => void check());
    });
    // Realtime may have slept in the background: check again on the way back.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void check());
    return () => {
      cancelled = true;
      stop();
      sub.remove();
    };
  }, []);

  const copy = access && access.status !== 'approved' ? COPY[access.status] : null;

  return (
    <ScrollView
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
        {!copy ? (
          <ActivityIndicator color={c.rose} />
        ) : (
          <View>
            <Display className="text-title">{copy.title}</Display>
            <Text className="mt-3 text-ink-soft">{copy.body}</Text>
            {access?.reason ? (
              <Sheet tone="note" accent="gold" pad="md" className="mt-8">
                <Text className="text-small text-ink-soft">{access.reason}</Text>
              </Sheet>
            ) : null}
            {access?.status === 'pending' ? (
              <Text className="mt-8 text-small text-ink-muted">This screen will open Us for you as soon as you’re approved.</Text>
            ) : null}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

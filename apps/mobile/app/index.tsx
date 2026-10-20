import type { Session } from '@supabase/supabase-js';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { Seal } from '@/components/ui/avatar';
import { Sheet } from '@/components/ui/sheet';
import { Display, Text } from '@/components/ui/text';
import { isConfigured } from '@/lib/env';
import { supabase } from '@/lib/supabase';

/** Entry: route by session. Pairing is checked by the (app) layout. */
export default function Index() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!isConfigured) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  if (!isConfigured) {
    return (
      <ScrollView contentContainerClassName="flex-grow justify-center gap-6 px-6 py-16">
        <Seal size={56} />
        <Display className="text-title">Almost ready.</Display>
        <Sheet tone="note" accent="gold">
          <Text className="text-ink-soft">
            Copy apps/mobile/.env.example to apps/mobile/.env, add your Supabase URL and anon key, then restart Metro.
          </Text>
        </Sheet>
      </ScrollView>
    );
  }
  if (session === undefined) return null;
  return <Redirect href={session ? '/home' : '/sign-in'} />;
}

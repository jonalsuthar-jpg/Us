import { redirect } from 'next/navigation';
import { isConfigured } from '@/lib/env';
import { getServerSupabase } from '@/lib/supabase/server';
import { SetupNotice } from '@/components/app/setup-notice';

export default async function Home() {
  if (!isConfigured) return <SetupNotice />;
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? '/home' : '/sign-in');
}

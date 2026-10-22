import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin/admin-shell';
import { SetupNotice } from '@/components/app/setup-notice';
import { isConfigured } from '@/lib/env';
import { getServerSupabase } from '@/lib/supabase/server';

export const metadata = { title: 'Us · Admin' };

/** Web-only console. Anyone who isn't an approved admin gets a plain 404. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!isConfigured) return <SetupNotice />;
  const sb = await getServerSupabase();
  const { data } = await sb.rpc('is_admin');
  if (data !== true) notFound();
  return <AdminShell>{children}</AdminShell>;
}

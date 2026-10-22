/**
 * admin-notify — email the admin when someone new asks to join.
 *
 * Called by a trigger on public.user_access (20261028000000_admin.sql) through
 * pg_net, not by the apps. Only the new person's name and email go in the mail.
 *
 * Auth: the x-cron-secret header must match the CRON_SECRET function secret.
 * Env: RESEND_API_KEY, ADMIN_EMAIL (comma-separated for several),
 *      (optional) ADMIN_FROM e.g. "Us <hello@yourdomain.com>", APP_URL.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { json } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('ADMIN_EMAIL')?.split(',').map((s) => s.trim()).filter(Boolean);
  if (!apiKey || !to?.length) return json({ skipped: 'email_not_configured' });

  const { userId } = await req.json().catch(() => ({}));
  if (typeof userId !== 'string') return json({ error: 'bad_request' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: access } = await admin.from('user_access').select('status').eq('user_id', userId).maybeSingle();
  if (access?.status !== 'pending') return json({ skipped: 'not_pending' });
  const [{ data: profile }, { data: auth }, { count }] = await Promise.all([
    admin.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
    admin.from('user_access').select('user_id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  const name = profile?.display_name ?? 'Someone';
  const email = auth?.user?.email ?? '';
  const appUrl = Deno.env.get('APP_URL');
  const link = appUrl ? `${appUrl}/admin/requests` : null;
  const waiting = count && count > 1 ? `${count} people are waiting in total.` : 'They’re the only one waiting.';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: Deno.env.get('ADMIN_FROM') ?? 'Us <onboarding@resend.dev>',
      to,
      subject: `${name} would like to join Us`,
      text: [`${name}${email ? ` (${email})` : ''} just signed up and is waiting for your approval.`, waiting, link ?? '']
        .filter(Boolean)
        .join('\n\n'),
      html: `<p><strong>${escape(name)}</strong>${email ? ` (${escape(email)})` : ''} just signed up and is waiting for your approval.</p>
<p>${escape(waiting)}</p>${link ? `<p><a href="${link}">Review the request</a></p>` : ''}`,
    }),
  });
  if (!res.ok) {
    console.error('resend error', res.status, await res.text().catch(() => ''));
    return json({ error: 'email_failed' }, 502);
  }
  return json({ ok: true });
});

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

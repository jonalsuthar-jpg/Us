/**
 * birthday-unlock — "Something's waiting for you in Us…" at midnight.
 *
 * Called every 5 minutes by pg_cron (see 20261107000000_birthday.sql) while a
 * birthday room has opened without its push. Each room is pushed once, to the
 * birthday person only.
 *
 * Auth: the x-cron-secret header must match the CRON_SECRET function secret.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { json } from '../_shared/auth.ts';
import { sendPush } from '../_shared/onesignal.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const now = new Date().toISOString();
  const { data: rooms, error } = await admin
    .from('birthday_rooms')
    .select('id, for_id, ends_at')
    .is('notified_at', null)
    .lte('unlock_at', now);
  if (error) return json({ error: 'list_failed' }, 500);

  let sent = 0;
  for (const room of rooms ?? []) {
    // Claim it first, so an overlapping run can't push twice.
    const { data: claimed } = await admin
      .from('birthday_rooms')
      .update({ notified_at: now })
      .eq('id', room.id)
      .is('notified_at', null)
      .select('id');
    if (!claimed?.length) continue;
    // A day late is worse than no push at all.
    if (room.ends_at <= now) continue;
    const ok = await sendPush({
      to: room.for_id,
      heading: '🎂 Happy birthday!',
      content: 'Something’s waiting for you in Us…',
      url: '/birthday',
      category: 'birthday',
      threadId: 'birthday',
      collapseId: `birthday-${room.id}`,
    });
    if (ok) sent++;
  }
  return json({ rooms: rooms?.length ?? 0, sent });
});

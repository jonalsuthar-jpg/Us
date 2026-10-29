/**
 * plant-nudge — the evening "your plant is thirsty" push.
 *
 * Called daily by pg_cron (see 20261026000000_plant.sql). For every couple
 * where exactly one of us has watered the plant today, the other one hears
 * about it. Nobody is nudged when both have, or when neither has.
 *
 * Auth: the x-cron-secret header must match the CRON_SECRET function secret.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { json } from '../_shared/auth.ts';
import { sendPush } from '../_shared/onesignal.ts';

const DEFAULT_TZ = 'Asia/Kolkata';

function today(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: couples, error } = await admin.from('couples').select('id, user_a_id, user_b_id');
  if (error) return json({ error: 'list_failed' }, 500);
  const ids = [...new Set((couples ?? []).flatMap((c) => [c.user_a_id, c.user_b_id]))];
  const { data: people } = await admin.from('profiles').select('id, display_name, timezone').in('id', ids);
  const person = new Map((people ?? []).map((p) => [p.id, p]));

  let sent = 0;
  for (const c of couples ?? []) {
    const day = today(person.get(c.user_a_id)?.timezone ?? DEFAULT_TZ);
    const { data: row } = await admin.from('plant_days').select('a_at, b_at').eq('couple_id', c.id).eq('day', day).maybeSingle();
    if (!row || !!row.a_at === !!row.b_at) continue;
    const [waterer, thirsty] = row.a_at ? [c.user_a_id, c.user_b_id] : [c.user_b_id, c.user_a_id];
    const name = person.get(waterer)?.display_name ?? 'Your partner';
    const ok = await sendPush({
      to: thirsty,
      heading: 'Your plant is thirsty 🌱',
      content: `${name} watered it today. A message or a snap from you helps it grow.`,
      url: '/home',
      category: 'plant',
      threadId: 'plant',
      collapseId: `plant-${c.id}`,
    });
    if (ok) sent++;
  }
  return json({ couples: couples?.length ?? 0, sent });
});

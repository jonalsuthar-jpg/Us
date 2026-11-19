/**
 * reminders — what's due right now, every 5 minutes (pg_cron, see
 * 20261120000200_plan_reminders.sql):
 *
 *  - a plan's reminder (at the time, 15 minutes, an hour or a day before),
 *    to both of us, for one-off and repeating plans alike;
 *  - at about 9:00 in each person's own time zone, a memory from this day in
 *    an earlier year ("2 years ago today: Lisbon");
 *  - time capsules that are due open into the chat (deliver_due_capsules),
 *    and the one they were sealed for hears about it.
 *
 * Each goes once (push_sent), and through sendPush, so notification settings
 * and quiet hours apply. Auth: x-cron-secret must match CRON_SECRET.
 */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { json } from '../_shared/auth.ts';
import { sendPush } from '../_shared/onesignal.ts';
import { expandEvents, localDateKey, type Repeat } from '../_shared/recurrence.ts';
import { localMinutes } from '../_shared/notify-rules.ts';

const TICK_MS = 5 * 60_000;
const DEFAULT_TZ = 'Asia/Kolkata';
/** "On this day" goes in the first tick after 9:00 local. */
const MORNING = 9 * 60;

interface EventRow {
  id: string;
  couple_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  repeat: Repeat;
  repeat_tz: string | null;
  skip_dates: string[];
  remind_before: number;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const now = new Date();

  const { data: couples, error } = await admin.from('couples').select('id, user_a_id, user_b_id');
  if (error) return json({ error: 'list_failed' }, 500);
  const ids = [...new Set((couples ?? []).flatMap((c) => [c.user_a_id, c.user_b_id]))];
  const { data: people } = await admin.from('profiles').select('id, timezone').in('id', ids);
  const tzOf = new Map((people ?? []).map((p) => [p.id, (p.timezone as string | null) ?? DEFAULT_TZ]));
  const members = new Map((couples ?? []).map((c) => [c.id, [c.user_a_id, c.user_b_id] as string[]]));

  const capsules = await openCapsules(admin, members);
  const plans = await planReminders(admin, now, members, tzOf);
  const memories = await onThisDay(admin, now, couples ?? [], tzOf);
  return json({ capsules, plans, memories });
});

/** Each reminder whose moment came in the last tick. */
async function planReminders(admin: SupabaseClient, now: Date, members: Map<string, string[]>, tzOf: Map<string, string>): Promise<number> {
  const soon = new Date(now.getTime() + 1441 * 60_000 + TICK_MS).toISOString();
  const { data, error } = await admin
    .from('calendar_events')
    .select('id, couple_id, title, starts_at, ends_at, all_day, repeat, repeat_tz, skip_dates, remind_before')
    .not('remind_before', 'is', null)
    .or(`repeat.neq.none,and(starts_at.gte.${new Date(now.getTime() - TICK_MS).toISOString()},starts_at.lte.${soon})`);
  if (error) {
    console.error('reminders: events', error);
    return 0;
  }
  let sent = 0;
  for (const e of (data ?? []) as EventRow[]) {
    const lead = e.remind_before * 60_000;
    // Occurrences whose reminder time fell in (now - tick, now].
    const due = expandEvents([e], new Date(now.getTime() - TICK_MS + lead), new Date(now.getTime() + lead + 1));
    for (const o of due) {
      for (const to of members.get(e.couple_id) ?? []) {
        if (!(await firstTime(admin, `event:${e.id}:${o.occurrence}:${e.remind_before}:${to}`))) continue;
        const ok = await sendPush({
          to,
          heading: e.title,
          content: whenLine(o.starts_at, e.all_day, e.remind_before, tzOf.get(to) ?? DEFAULT_TZ),
          url: '/plan',
          category: 'plan',
          threadId: 'plan',
          collapseId: `plan-${e.id}-${o.occurrence}`,
        });
        if (ok) sent++;
      }
    }
  }
  return sent;
}

/** "Starting now", "In an hour · 19:30", "Tomorrow at 19:30". */
function whenLine(startsAt: string, allDay: boolean, before: number, tz: string): string {
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(startsAt));
  if (allDay) return before >= 1440 ? 'Tomorrow' : 'Today';
  if (before === 0) return `Starting now · ${time}`;
  if (before === 15) return `In 15 minutes · ${time}`;
  if (before === 60) return `In an hour · ${time}`;
  return `Tomorrow at ${time}`;
}

/** At about 9:00 their time: a memory from today's date in an earlier year, once a day. */
async function onThisDay(admin: SupabaseClient, now: Date, couples: { id: string; user_a_id: string; user_b_id: string }[], tzOf: Map<string, string>): Promise<number> {
  let sent = 0;
  for (const c of couples) {
    const due = [c.user_a_id, c.user_b_id].filter((u) => {
      const m = localMinutes(now, tzOf.get(u) ?? DEFAULT_TZ);
      return m >= MORNING && m < MORNING + TICK_MS / 60_000;
    });
    if (!due.length) continue;
    const { data: memories } = await admin.from('memories').select('title, happened_on').eq('couple_id', c.id);
    for (const u of due) {
      const today = localDateKey(now.toISOString(), tzOf.get(u) ?? DEFAULT_TZ);
      const year = Number(today.slice(0, 4));
      const hit = (memories ?? [])
        .filter((m) => m.happened_on.slice(5) === today.slice(5) && Number(m.happened_on.slice(0, 4)) < year)
        .sort((a, b) => b.happened_on.localeCompare(a.happened_on))[0];
      if (!hit || !(await firstTime(admin, `otd:${u}:${today}`))) continue;
      const years = year - Number(hit.happened_on.slice(0, 4));
      const ok = await sendPush({
        to: u,
        heading: years === 1 ? 'A year ago today' : `${years} years ago today`,
        content: hit.title,
        url: '/memory',
        category: 'memory_resurfaced',
        threadId: 'memories',
        collapseId: `otd-${u}-${today}`,
      });
      if (ok) sent++;
    }
  }
  return sent;
}

/** Due capsules become chat messages (once, in the database); the other one of us is told. */
async function openCapsules(admin: SupabaseClient, members: Map<string, string[]>): Promise<number> {
  const { data, error } = await admin.rpc('deliver_due_capsules');
  if (error) {
    console.error('reminders: capsules', error);
    return 0;
  }
  const opened = (data ?? []) as { id: string; couple_id: string; sender_id: string }[];
  if (!opened.length) return 0;
  const { data: people } = await admin.from('profiles').select('id, display_name').in('id', [...new Set(opened.map((c) => c.sender_id))]);
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.display_name as string]));
  for (const c of opened) {
    const to = (members.get(c.couple_id) ?? []).find((u) => u !== c.sender_id);
    if (!to) continue;
    await sendPush({
      to,
      heading: '💌 A time capsule just opened',
      content: `${nameOf.get(c.sender_id) ?? 'Your partner'} sealed this for you. Open it in your chat.`,
      url: '/talk',
      category: 'letter_unlocked',
      threadId: 'chat',
      collapseId: `capsule-${c.id}`,
    });
  }
  return opened.length;
}

/** Claim a push by its key; false if it has gone already. */
async function firstTime(admin: SupabaseClient, key: string): Promise<boolean> {
  const { error } = await admin.from('push_sent').insert({ key });
  if (!error) return true;
  if (error.code !== '23505') console.error('reminders: push_sent', error);
  return false;
}

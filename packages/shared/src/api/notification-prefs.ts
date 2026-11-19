/**
 * What I want to be told, and when (see public.notification_prefs). The push
 * functions read the same groups: supabase/functions/_shared/notify-rules.ts.
 */
import type { UsClient } from '../supabase';

export interface NotificationPrefs {
  /** Groups turned off (NOTIFY_GROUPS keys). */
  off: string[];
  /** Quiet hours, minutes after my midnight; both null for none. */
  quiet_start: number | null;
  quiet_end: number | null;
  hide_preview: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = { off: [], quiet_start: null, quiet_end: null, hide_preview: false };

/** The switches on the Notifications screen, in order. Calls and "got home" can't be turned off. */
export const NOTIFY_GROUPS: { key: string; label: string; detail?: string; feature?: string }[] = [
  { key: 'messages', label: 'Messages', detail: 'With the chime', feature: 'chat' },
  { key: 'taps', label: 'Thinking of you', feature: 'taps' },
  { key: 'question', label: 'Today’s question answered', feature: 'daily_question' },
  { key: 'snaps', label: 'Snaps and doodles' },
  { key: 'games', label: 'Games and drawing' },
  { key: 'plans', label: 'Plan reminders', detail: 'Before a plan starts', feature: 'calendar' },
  { key: 'memories', label: 'On this day', detail: 'A memory from an earlier year', feature: 'memories' },
  { key: 'location', label: 'Location shared', feature: 'location' },
  { key: 'plant', label: 'Our plant', feature: 'plant' },
];

export async function getNotificationPrefs(sb: UsClient, userId: string): Promise<NotificationPrefs> {
  const { data, error } = await sb.from('notification_prefs').select('off, quiet_start, quiet_end, hide_preview').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ?? DEFAULT_PREFS;
}

export async function saveNotificationPrefs(sb: UsClient, userId: string, prefs: NotificationPrefs): Promise<void> {
  const { error } = await sb.from('notification_prefs').upsert({ user_id: userId, ...prefs, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** "22:30" for 1350. */
export function formatMinutes(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** 1350 for "22:30" (or "2230", "9:05"); null if it isn't a time. */
export function parseMinutes(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

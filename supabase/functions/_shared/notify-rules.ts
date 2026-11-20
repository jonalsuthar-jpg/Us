/**
 * Whether, and how, a push reaches someone, given their notification
 * settings. Pure (no Deno APIs), so the apps' tests run it too. The settings
 * screen's groups (packages/shared/src/api/notification-prefs.ts) use the
 * same group keys.
 */

export interface NotifyPrefs {
  off: string[];
  quiet_start: number | null;
  quiet_end: number | null;
  hide_preview: boolean;
}

/** Calls (and their endings) ring and "got home safe" arrives, whatever is set. */
export const ALWAYS = new Set(['incoming_call', 'call_ended', 'call_handled', 'arrival']);

/** Each push category's settings group. */
export const GROUP_OF: Record<string, string> = {
  new_message: 'messages',
  thinking_of_you: 'taps',
  daily_question: 'question',
  new_snap: 'snaps',
  snap_reaction: 'snaps',
  doodle: 'snaps',
  draw_invite: 'games',
  guess_turn: 'games',
  quiz_ready: 'games',
  house: 'games',
  location_shared: 'location',
  memory_resurfaced: 'memories',
  letter_unlocked: 'memories',
  plan: 'plans',
  plant: 'plant',
};

/** Minutes after midnight at `now` in `tz` (or UTC if the zone is unknown). */
export function localMinutes(now: Date, tz: string | null | undefined): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return (h % 24) * 60 + m;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

/** Inside quiet hours that may run past midnight (22:00 → 07:00). Equal ends mean none. */
export function inQuietHours(minutes: number, start: number | null, end: number | null): boolean {
  if (start == null || end == null || start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export interface Delivery {
  /** Send it at all. */
  deliver: boolean;
  /** Send without sound or a buzz. */
  quiet: boolean;
  /** Lock screen shows "Us" and a plain line, not who or what. */
  hide: boolean;
}

export function decide(prefs: NotifyPrefs | null, category: string, now: Date, tz: string | null | undefined): Delivery {
  if (ALWAYS.has(category) || !prefs) return { deliver: true, quiet: false, hide: !!prefs?.hide_preview && category !== 'call_handled' };
  const group = GROUP_OF[category];
  if (group && prefs.off.includes(group)) return { deliver: false, quiet: false, hide: false };
  return { deliver: true, quiet: inQuietHours(localMinutes(now, tz), prefs.quiet_start, prefs.quiet_end), hide: prefs.hide_preview };
}

/** The plain line a hidden push shows instead of its content. */
export function hiddenContent(category: string): string {
  if (category === 'new_message') return 'New message';
  if (category === 'incoming_call') return 'Incoming call';
  if (category === 'call_ended') return 'Missed call';
  return 'Something new for you';
}

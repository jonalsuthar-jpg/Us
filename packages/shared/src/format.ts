import type { Call, Message } from './database.types';

export function formatClock(iso: string | number | Date): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "Today", "Yesterday", "Tuesday", "12 March", "12 March 2024". */
export function formatDay(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** What a call is, in words: "voice call", "video call", "listen together", "watch together". */
export function callKind(media: Call['media']): string {
  return { audio: 'voice call', video: 'video call', listen: 'listen together', watch: 'watch together' }[media] ?? 'call';
}

/** Copy for a call-log entry in the thread, from the reader's point of view. */
export function describeCall(call: Call, myId: string): { label: string; missed: boolean; detail?: string } {
  const outgoing = call.caller_id === myId;
  const kind = callKind(call.media);
  switch (call.status) {
    case 'ended': {
      const ms = call.answered_at && call.ended_at ? Date.parse(call.ended_at) - Date.parse(call.answered_at) : 0;
      return { label: cap(kind), missed: false, detail: formatDuration(ms) };
    }
    case 'missed':
      return outgoing ? { label: `${cap(kind)} · no answer`, missed: false } : { label: `Missed ${kind}`, missed: true };
    case 'declined':
      return outgoing ? { label: `${cap(kind)} · declined`, missed: false } : { label: `Declined ${kind}`, missed: true };
    default:
      return { label: cap(kind), missed: false };
  }
}

/** Group a thread into days for separators. */
export function groupByDay(messages: Message[]): { day: string; key: string; items: Message[] }[] {
  const groups: { day: string; key: string; items: Message[] }[] = [];
  for (const m of messages) {
    const key = new Date(m.created_at).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(m);
    else groups.push({ key, day: formatDay(m.created_at), items: [m] });
  }
  return groups;
}

/** Whether two adjacent messages should visually cluster (same sender, < 3 min apart). */
export function clusters(a: Message | undefined, b: Message | undefined): boolean {
  if (!a || !b || a.kind !== 'text' || b.kind !== 'text') return false;
  return a.sender_id === b.sender_id && Math.abs(Date.parse(b.created_at) - Date.parse(a.created_at)) < 180_000;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

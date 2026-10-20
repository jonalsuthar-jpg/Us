import type { UsClient } from '../supabase';

/**
 * Notification categories. Each maps to a distinct OneSignal channel / sound /
 * priority in supabase/functions/push. Typing deliberately has no category —
 * it is in-app only.
 */
export type PushCategory =
  | 'incoming_call'
  | 'call_ended' // replaces a ringing call notification with "missed call"
  | 'new_message'
  | 'wellbeing_nudge' // TODO(phase-6)
  | 'memory_resurfaced' // TODO(phase-3/5)
  | 'letter_unlocked' // TODO(phase-3)
  | 'daily_question'; // TODO(phase-3)

export type PushRequest =
  | { category: 'new_message'; messageId: string }
  | { category: 'incoming_call' | 'call_ended'; callId: string };

/** Payload attached to every notification (`data`) for deep-link routing. */
export interface PushData {
  category: PushCategory;
  url: string;
  messageId?: string;
  callId?: string;
}

/**
 * Ask the server to notify my partner. The Edge Function re-reads the record
 * with the service role and verifies I'm its sender, so this can't be abused
 * to push arbitrary content. Failures are non-fatal (the partner still gets
 * the message in-app via Realtime).
 */
export async function notifyPartner(sb: UsClient, req: PushRequest): Promise<void> {
  const { error } = await sb.functions.invoke('push', { body: req });
  if (error) console.warn('[us] push failed', error);
}

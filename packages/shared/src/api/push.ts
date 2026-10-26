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
  | 'wellbeing_nudge' // partner asked for a little care (never carries details)
  | 'memory_resurfaced' // TODO(phase-3/5)
  | 'letter_unlocked' // TODO(phase-3)
  | 'daily_question' // my partner answered today's question (never carries the answer)
  | 'thinking_of_you' // a one-tap "thinking of you"
  | 'location_shared' // my partner started sharing their location with me
  | 'arrival' // asked to say when home / got home safe
  | 'new_snap' // my partner posted a snap
  | 'snap_reaction' // my partner reacted to my snap
  | 'plant' // evening nudge: only my partner watered our plant today (sent by a schedule)
  | 'spark_rank' // the two of us just reached a new Spark Rank
  | 'draw_invite' // come and draw with me (or play Draw & Guess)
  | 'doodle' // my partner left me a doodle
  | 'guess_turn'; // my partner drew their Draw & Guess turn

export type PushRequest =
  | { category: 'new_message'; messageId: string }
  | { category: 'incoming_call' | 'call_ended'; callId: string }
  | { category: 'wellbeing_nudge'; checkinId: string }
  | { category: 'daily_question'; questionId: string }
  | { category: 'thinking_of_you'; tapId: string }
  | { category: 'location_shared' }
  | { category: 'arrival'; checkId: string }
  | { category: 'new_snap' | 'snap_reaction'; snapId: string }
  | { category: 'spark_rank' }
  | { category: 'draw_invite'; game?: boolean }
  | { category: 'doodle'; drawingId: string }
  | { category: 'guess_turn'; drawingId: string };

/** Payload attached to every notification (`data`) for deep-link routing. */
export interface PushData {
  category: PushCategory;
  url: string;
  messageId?: string;
  callId?: string;
  /** Incoming calls: who and what, for Android's lock-screen ringing. */
  callerName?: string;
  media?: 'audio' | 'video';
  checkinId?: string;
  checkId?: string;
  snapId?: string;
  drawingId?: string;
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

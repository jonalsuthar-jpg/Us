import type { Call, CallMedia, CallStatus } from '../database.types';
import type { UsClient } from '../supabase';
import { uuid } from '../uuid';

export async function createCall(
  sb: UsClient,
  args: { coupleId: string; callerId: string; calleeId: string; media: CallMedia },
): Promise<Call> {
  const { data, error } = await sb
    .from('calls')
    .insert({
      id: uuid(),
      couple_id: args.coupleId,
      caller_id: args.callerId,
      callee_id: args.calleeId,
      media: args.media,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function setCallStatus(sb: UsClient, callId: string, status: CallStatus): Promise<Call> {
  const { data, error } = await sb.rpc('set_call_status', { p_call_id: callId, p_status: status });
  if (error) throw error;
  return data;
}

/** This app, for as long as it runs: tells my phone's answer from my laptop's. */
const THIS_DEVICE = uuid();

/**
 * Answer a call ringing for me. First come: if my other device got there
 * first, this throws "call_already_answered".
 */
export async function answerCall(sb: UsClient, callId: string): Promise<Call> {
  const { data, error } = await sb.rpc('answer_call', { p_call_id: callId, p_device: THIS_DEVICE });
  if (error) throw error;
  return data;
}

/** A call still ringing for me — used when the app opens from a call push. */
export async function findRingingCallFor(sb: UsClient, userId: string): Promise<Call | null> {
  await sb.rpc('expire_stale_calls');
  const since = new Date(Date.now() - 60_000).toISOString();
  const { data, error } = await sb
    .from('calls')
    .select('*')
    .eq('callee_id', userId)
    .eq('status', 'ringing')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCall(sb: UsClient, id: string): Promise<Call | null> {
  const { data, error } = await sb.from('calls').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** ICE servers from the turn-credentials Edge Function (STUN-only fallback). */
export async function fetchIceServers(sb: UsClient): Promise<RTCIceServer[]> {
  try {
    const { data, error } = await sb.functions.invoke<{ iceServers: RTCIceServer[] }>('turn-credentials');
    if (error) throw error;
    if (data?.iceServers?.length) return data.iceServers;
  } catch (e) {
    console.warn('[us] TURN credentials unavailable, falling back to STUN only', e);
  }
  return [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.relay.metered.ca:80'] }];
}

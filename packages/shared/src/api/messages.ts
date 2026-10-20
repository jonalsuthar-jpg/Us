import type { Message, MessageRow, MessageStatus } from '../database.types';
import type { UsClient } from '../supabase';
import { uuid } from '../uuid';

const SELECT = '*, call:calls(*)';

export const PAGE_SIZE = 50;

/** Newest-first page of the thread; pass the oldest loaded created_at to page back. */
export async function fetchMessages(sb: UsClient, coupleId: string, before?: string): Promise<Message[]> {
  let q = sb
    .from('messages')
    .select(SELECT)
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function fetchMessage(sb: UsClient, id: string): Promise<Message | null> {
  const { data, error } = await sb.from('messages').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Message | null;
}

/** Build the optimistic row the UI shows immediately. */
export function draftMessage(coupleId: string, senderId: string, body: string): Message {
  return {
    id: uuid(),
    couple_id: coupleId,
    sender_id: senderId,
    kind: 'text',
    body,
    call_id: null,
    status: 'sent',
    delivered_at: null,
    read_at: null,
    created_at: new Date().toISOString(),
    call: null,
    pending: true,
  };
}

/** Insert a text message. The client-generated id makes retries idempotent. */
export async function sendMessage(sb: UsClient, draft: Message): Promise<MessageRow> {
  const { data, error } = await sb
    .from('messages')
    .insert({ id: draft.id, couple_id: draft.couple_id, sender_id: draft.sender_id, body: draft.body ?? '' })
    .select('*')
    .single();
  if (error) {
    // Unique violation on retry means the first attempt actually landed.
    if (error.code === '23505') {
      const existing = await fetchMessage(sb, draft.id);
      if (existing) return existing;
    }
    throw error;
  }
  return data;
}

/** Acknowledge my incoming messages (all of them when ids is omitted). */
export async function ackMessages(sb: UsClient, status: Exclude<MessageStatus, 'sent'>, ids?: string[]) {
  const { error } = await sb.rpc('ack_messages', { p_status: status, p_ids: ids ?? null });
  if (error) throw error;
}

const RANK: Record<MessageStatus, number> = { sent: 0, delivered: 1, read: 2 };

/** Merge an incoming row into local state without ever regressing its status. */
export function mergeMessage(existing: Message | undefined, incoming: Message): Message {
  if (!existing) return incoming;
  const status = RANK[incoming.status] >= RANK[existing.status] ? incoming.status : existing.status;
  return {
    ...existing,
    ...incoming,
    status,
    call: incoming.call ?? existing.call ?? null,
    pending: false,
    failed: false,
  };
}

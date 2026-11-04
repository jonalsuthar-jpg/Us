import { birthdayTotals } from '../api/birthday';
import { openMessage } from '../api/messages';
import type { ChatCipher } from '../crypto/chat-cipher';
import type { Message } from '../database.types';
import type { UsClient } from '../supabase';

/**
 * "Us, so far" for the birthday room. Chat is end-to-end encrypted, so the
 * server only counts; the first message and the favourite emoji are read
 * here, on the device, with the chat key.
 */
export interface UsSoFar {
  firstMessage: { text: string | null; at: string; fromMe: boolean } | null;
  messages: number;
  calls: number;
  callHours: number;
  topEmoji: { emoji: string; count: number } | null;
}

/** How many recent messages to read for the favourite emoji. */
const EMOJI_SAMPLE = 1000;

export async function usSoFar(sb: UsClient, coupleId: string, meId: string, cipher: ChatCipher | null): Promise<UsSoFar> {
  const [totals, first, recent] = await Promise.all([
    birthdayTotals(sb),
    sb.from('messages').select('*').eq('couple_id', coupleId).eq('kind', 'text').order('created_at').limit(1).maybeSingle(),
    sb.from('messages').select('*').eq('couple_id', coupleId).eq('kind', 'text').order('created_at', { ascending: false }).limit(EMOJI_SAMPLE),
  ]);
  const firstRow = first.data ? openMessage(first.data as Message, cipher) : null;
  const texts = ((recent.data ?? []) as Message[]).map((m) => openMessage(m, cipher).body).filter((b): b is string => !!b);
  return {
    firstMessage: firstRow
      ? { text: firstRow.e2ee && firstRow.e2ee !== 'ok' ? null : (firstRow.body ?? null), at: firstRow.created_at, fromMe: firstRow.sender_id === meId }
      : null,
    messages: totals?.messages ?? 0,
    calls: totals?.calls ?? 0,
    callHours: Math.round(((totals?.call_seconds ?? 0) / 3600) * 10) / 10,
    topEmoji: topEmoji(texts),
  };
}

let EMOJI: RegExp;
try {
  // One emoji, with its skin tone / variation selector / joined parts.
  EMOJI = new RegExp('\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|\\uFE0F|\\u200D\\p{Extended_Pictographic})*', 'gu');
} catch {
  // Engines without Unicode property escapes: astral symbols and the common hearts/stars.
  EMOJI = /(?:[\uD83C-\uDBFF][\uDC00-\uDFFF]|[☀-➿])️?/g;
}

/** The emoji used most across these texts (variation selectors ignored). */
export function topEmoji(texts: string[]): { emoji: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const t of texts) {
    for (const m of t.match(EMOJI) ?? []) {
      const e = m.replace(/️/g, '');
      counts.set(e, (counts.get(e) ?? 0) + 1);
    }
  }
  let best: { emoji: string; count: number } | null = null;
  for (const [emoji, count] of counts) if (!best || count > best.count) best = { emoji, count };
  return best;
}

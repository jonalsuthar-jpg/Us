import type { Couple, Invite, Profile } from '../database.types';
import type { UsClient } from '../supabase';
import type { PartnerSlot } from '../tokens';

export interface CoupleContext {
  couple: Couple;
  me: Profile;
  partner: Profile;
  /** Which colour slot each person owns (A = invite creator = rose). */
  mySlot: PartnerSlot;
  partnerSlot: PartnerSlot;
}

export async function getMyProfile(sb: UsClient, userId: string): Promise<Profile | null> {
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMyProfile(sb: UsClient, userId: string, patch: { display_name?: string }) {
  const { error } = await sb.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

/** Resolve the couple + both profiles, or null if the user isn't paired yet. */
export async function getCoupleContext(sb: UsClient, userId: string): Promise<CoupleContext | null> {
  const { data: couple, error } = await sb
    .from('couples')
    .select('*')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .maybeSingle();
  if (error) throw error;
  if (!couple) return null;

  const { data: profiles, error: pErr } = await sb
    .from('profiles')
    .select('*')
    .in('id', [couple.user_a_id, couple.user_b_id]);
  if (pErr) throw pErr;

  const me = profiles?.find((p) => p.id === userId);
  const partner = profiles?.find((p) => p.id !== userId);
  if (!me || !partner) return null;

  const mySlot: PartnerSlot = couple.user_a_id === userId ? 'a' : 'b';
  return { couple, me, partner, mySlot, partnerSlot: mySlot === 'a' ? 'b' : 'a' };
}

export async function createInvite(sb: UsClient): Promise<Invite> {
  const { data, error } = await sb.rpc('create_invite');
  if (error) throw error;
  return data;
}

export async function redeemInvite(sb: UsClient, code: string): Promise<Couple> {
  const { data, error } = await sb.rpc('redeem_invite', { invite_code: code });
  if (error) throw error;
  return data;
}

/**
 * Wait for the partner to redeem my invite. Polls rather than subscribing,
 * because the couple row isn't visible to me (RLS) until it exists, and
 * Postgres Changes can't deliver a row I couldn't see at subscribe time.
 */
export function watchForPairing(
  sb: UsClient,
  userId: string,
  onPaired: (ctx: CoupleContext) => void,
  intervalMs = 2500,
): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const ctx = await getCoupleContext(sb, userId);
      if (ctx && !stopped) {
        stopped = true;
        onPaired(ctx);
        return;
      }
    } catch {
      // transient network error — keep polling
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  let timer = setTimeout(tick, intervalMs);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** Pretty-print a code as typed: "abcd efgh" → "ABCD-EFGH". */
export function formatInviteCode(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

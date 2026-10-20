import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

export interface Caller {
  userId: string;
  coupleId: string;
  partnerId: string;
  /** Service-role client — bypasses RLS. Only use after authorising. */
  admin: SupabaseClient;
}

export interface User {
  userId: string;
  /** null when the caller isn't paired. */
  coupleId: string | null;
  partnerId: string | null;
  /** Service-role client — bypasses RLS. Only use after authorising. */
  admin: SupabaseClient;
}

/** Resolve the calling user from their JWT, and their couple if they have one. */
export async function requireUser(req: Request): Promise<User | Response> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await asUser.auth.getUser();
  if (error || !data.user) return json({ error: 'not_authenticated' }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: couple } = await admin
    .from('couples')
    .select('id, user_a_id, user_b_id')
    .or(`user_a_id.eq.${data.user.id},user_b_id.eq.${data.user.id}`)
    .maybeSingle();

  return {
    userId: data.user.id,
    coupleId: couple?.id ?? null,
    partnerId: couple ? (couple.user_a_id === data.user.id ? couple.user_b_id : couple.user_a_id) : null,
    admin,
  };
}

/**
 * Resolve the calling user from their JWT and their couple. Every function
 * that acts for a paired user starts here; anything unpaired is rejected.
 */
export async function requireCaller(req: Request): Promise<Caller | Response> {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  if (!user.coupleId || !user.partnerId) return json({ error: 'not_paired' }, 403);
  return { userId: user.userId, coupleId: user.coupleId, partnerId: user.partnerId, admin: user.admin };
}

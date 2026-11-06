/**
 * delete-account — permanently delete the caller's account.
 *
 * Body: {} — the caller is taken from the JWT.
 *     | { userId } — an admin removing someone who never paired (spam, a
 *       mistaken sign-up). Paired and protected accounts are refused, so an
 *       admin can never take a couple's shared space away.
 *
 * If the caller is paired, the couple's files in R2 (every "<bucket>/<couple_id>/"
 * folder, and the chat videos) are removed first, because SQL cascades can't reach them.
 * Deleting the auth user then cascades through profiles → couples → every
 * couple-scoped table, and every owner-only table.
 *
 * App stores require in-app account deletion; this is what Settings calls.
 */
import { cors, json, requireAdmin, requireUser } from '../_shared/auth.ts';
import { removeFolder } from '../_shared/r2.ts';

const BUCKETS = ['memories', 'chat', 'snaps', 'drawings', 'birthday'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  if (typeof body.userId === 'string') return deleteForAdmin(req, body.userId);

  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { admin, userId, coupleId } = user;

  if (coupleId) {
    try {
      for (const name of BUCKETS) await removeFolder(`${name}/${coupleId}/`);
      await removeFolder(`${coupleId}/`);
    } catch (e) {
      // Don't hold the account hostage to a storage hiccup.
      console.error('r2 cleanup failed', e);
    }
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return json({ error: 'delete_failed' }, 500);
  return json({ deleted: true });
});

async function deleteForAdmin(req: Request, target: string) {
  const caller = await requireAdmin(req);
  if (caller instanceof Response) return caller;
  const { admin } = caller;
  if (target === caller.userId) return json({ error: 'not_yourself' }, 400);

  const { data: access } = await admin.from('user_access').select('protected').eq('user_id', target).maybeSingle();
  if (!access) return json({ error: 'not_found' }, 404);
  if (access.protected) return json({ error: 'protected' }, 403);
  const { data: couple } = await admin
    .from('couples')
    .select('id')
    .or(`user_a_id.eq.${target},user_b_id.eq.${target}`)
    .maybeSingle();
  if (couple) return json({ error: 'paired' }, 409);

  const { data: profile } = await admin.from('profiles').select('display_name').eq('id', target).maybeSingle();
  const { error } = await admin.auth.admin.deleteUser(target);
  if (error) return json({ error: 'delete_failed' }, 500);
  await admin.from('admin_audit').insert({
    admin_id: caller.userId,
    action: 'delete_user',
    target_user: target,
    before: { display_name: profile?.display_name ?? null },
  });
  return json({ deleted: true });
}

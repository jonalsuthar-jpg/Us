/**
 * delete-account — permanently delete the caller's account.
 *
 * Body: {} (the caller is taken from the JWT; nobody can delete someone else).
 *
 * If the caller is paired, the couple's Storage folders ("<couple_id>/" in the
 * memories, chat and snaps buckets) are removed first, because SQL cascades can't reach Storage.
 * Deleting the auth user then cascades through profiles → couples → every
 * couple-scoped table, and every owner-only table.
 *
 * App stores require in-app account deletion; this is what Settings calls.
 */
import { cors, json, requireUser } from '../_shared/auth.ts';

const BUCKETS = ['memories', 'chat', 'snaps'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const { admin, userId, coupleId } = user;

  for (const name of coupleId ? BUCKETS : []) {
    const bucket = admin.storage.from(name);
    for (let pass = 0; pass < 100; pass++) {
      const { data, error } = await bucket.list(coupleId!, { limit: 500 });
      if (error) return json({ error: 'storage_list_failed' }, 500);
      const paths = (data ?? []).filter((f) => f.id).map((f) => `${coupleId}/${f.name}`);
      if (!paths.length) break;
      const { error: removeError } = await bucket.remove(paths);
      if (removeError) return json({ error: 'storage_remove_failed' }, 500);
    }
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return json({ error: 'delete_failed' }, 500);
  return json({ deleted: true });
});

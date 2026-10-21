/**
 * snaps-cleanup — delete snaps that have expired, and their photos.
 *
 * Called hourly by pg_cron (see 20261025000000_snaps.sql), not by the apps.
 * RLS already hides an expired snap the moment it expires; this frees the
 * storage. Kept snaps live on as memories with their own copy of the photo.
 *
 * Auth: the x-cron-secret header must match the CRON_SECRET function secret.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { json } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  let removed = 0;
  for (let pass = 0; pass < 20; pass++) {
    const { data, error } = await admin
      .from('snaps')
      .select('id, photo_path')
      .lt('expires_at', new Date().toISOString())
      .limit(500);
    if (error) return json({ error: 'list_failed', removed }, 500);
    if (!data?.length) break;
    const { error: storageError } = await admin.storage.from('snaps').remove(data.map((s) => s.photo_path));
    if (storageError) return json({ error: 'storage_remove_failed', removed }, 500);
    const { error: deleteError } = await admin.from('snaps').delete().in('id', data.map((s) => s.id));
    if (deleteError) return json({ error: 'delete_failed', removed }, 500);
    removed += data.length;
  }
  return json({ removed });
});

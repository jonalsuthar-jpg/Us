/**
 * media — signed links to our files in Cloudflare R2, which replaced
 * Supabase Storage (Storage downloads count against the free plan's egress;
 * R2's don't). Paths are the same as they were in Storage; in R2 each sits
 * under its old bucket's name.
 *
 *   { action: 'upload', bucket, path }      → { url }          (PUT, 15 minutes)
 *   { action: 'download', bucket, paths }   → { urls }         (GET, ≥ 6 hours, keyed by path)
 *   { action: 'remove', bucket, paths }     → { ok }
 *   { action: 'copy', from: {bucket, path}, to: {bucket, path} } → { ok }
 *   { action: 'clear' }                     → { ok }           (unpair: every file of ours)
 *
 * The rules are the old Storage policies: a path must be in our couple's
 * folder. Snaps can only be read while the snap is live. Birthday files are
 * readable with the room (the maker always, the birthday person from
 * midnight) and only the maker can add or remove them.
 */
import { cors, json, requireCaller, type Caller } from '../_shared/auth.ts';
import { copyFile, presign, removeFile, removeFolder, stableDownload } from '../_shared/r2.ts';

const UPLOAD_S = 15 * 60;
const DOWNLOAD_S = 6 * 3600;
const BUCKETS = ['memories', 'chat', 'snaps', 'drawings', 'birthday'] as const;
type Bucket = (typeof BUCKETS)[number];
const SAFE = /^[0-9a-f-]{36}\/[A-Za-z0-9._/-]+$/i;

const isBucket = (b: unknown): b is Bucket => BUCKETS.includes(b as Bucket);
const key = (bucket: Bucket, path: string) => `${bucket}/${path}`;

/** Paths of ours that this caller may read (or, with `write`, change). */
async function allowed(caller: Caller, bucket: Bucket, paths: string[], write: boolean): Promise<string[]> {
  const ours = paths.filter((p) => SAFE.test(p) && !p.includes('..') && !p.includes('//') && p.startsWith(`${caller.coupleId}/`));
  if (!ours.length) return [];
  if (bucket === 'snaps' && !write) {
    // RLS hides a snap the moment it expires.
    const { data } = await caller.asUser.from('snaps').select('photo_path').in('photo_path', ours);
    const live = new Set((data ?? []).map((s) => s.photo_path));
    return ours.filter((p) => live.has(p));
  }
  if (bucket === 'birthday') {
    const rooms = [...new Set(ours.map((p) => p.split('/')[1]!))];
    // RLS shows the room to the maker always, and to the birthday person from midnight.
    const { data } = await caller.asUser.from('birthday_rooms').select('id, from_id').in('id', rooms);
    const ok = new Set((data ?? []).filter((r) => !write || r.from_id === caller.userId).map((r) => r.id));
    return ours.filter((p) => ok.has(p.split('/')[1]!));
  }
  return ours;
}

const pathsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((p): p is string => typeof p === 'string') : []);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const body = await req.json().catch(() => ({}));

  try {
    if (body.action === 'clear') {
      for (const b of BUCKETS) await removeFolder(key(b, `${caller.coupleId}/`));
      return json({ ok: true });
    }

    if (body.action === 'copy') {
      const { from, to } = body;
      if (!isBucket(from?.bucket) || !isBucket(to?.bucket)) return json({ error: 'bad_request' }, 400);
      const [src] = await allowed(caller, from.bucket, [String(from.path)], false);
      const [dst] = await allowed(caller, to.bucket, [String(to.path)], true);
      if (!src || !dst) return json({ error: 'forbidden' }, 403);
      await copyFile(key(from.bucket, src), key(to.bucket, dst));
      return json({ ok: true });
    }

    const bucket = body.bucket;
    if (!isBucket(bucket)) return json({ error: 'bad_request' }, 400);

    if (body.action === 'upload') {
      const [path] = await allowed(caller, bucket, [String(body.path ?? '')], true);
      if (!path) return json({ error: 'forbidden' }, 403);
      return json({ url: await presign('PUT', key(bucket, path), UPLOAD_S) });
    }

    const paths = pathsOf(body.paths);
    if (!paths.length || paths.length > 200) return json({ error: 'bad_request' }, 400);

    if (body.action === 'download') {
      const seconds = Math.min(DOWNLOAD_S, Math.max(60, Number(body.expiresIn) || DOWNLOAD_S));
      const urls: Record<string, string> = {};
      for (const p of await allowed(caller, bucket, paths, false)) {
        // Snaps vanish when they expire, so their links don't outlive them.
        urls[p] = bucket === 'snaps' ? await presign('GET', key(bucket, p), seconds) : await stableDownload(key(bucket, p), seconds);
      }
      return json({ urls, expiresIn: seconds });
    }

    if (body.action === 'remove') {
      for (const p of await allowed(caller, bucket, paths, true)) await removeFile(key(bucket, p));
      return json({ ok: true });
    }
  } catch (e) {
    console.error('media', e);
    return json({ error: 'storage_failed' }, 500);
  }
  return json({ error: 'bad_request' }, 400);
});

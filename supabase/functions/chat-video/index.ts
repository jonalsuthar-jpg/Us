/**
 * chat-video — signed Cloudflare R2 links for chat videos, so the R2 keys
 * never ship in the apps. Files are encrypted on the device before upload;
 * R2 only ever holds ciphertext.
 *
 *   { action: 'upload', messageId }       → { path, url }   (PUT, 15 minutes)
 *   { action: 'download', paths }         → { urls }        (GET, 6 hours, keyed by path)
 *   { action: 'clear' }                   → { ok }          (unpair: delete our videos)
 *
 * Only paths in the caller's own couple folder are signed.
 */
import { cors, json, requireCaller } from '../_shared/auth.ts';
import { presign, removeFolder } from '../_shared/r2.ts';

const UPLOAD_S = 15 * 60;
const DOWNLOAD_S = 6 * 3600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const body = await req.json().catch(() => ({}));
  const folder = `${caller.coupleId}/video/`;

  try {
    if (body.action === 'upload') {
      if (!UUID.test(String(body.messageId ?? ''))) return json({ error: 'bad_request' }, 400);
      const path = `${folder}${body.messageId}.enc`;
      return json({ path, url: await presign('PUT', path, UPLOAD_S) });
    }

    if (body.action === 'download') {
      const paths = Array.isArray(body.paths) ? (body.paths as unknown[]).filter((p): p is string => typeof p === 'string') : [];
      if (!paths.length || paths.length > 100) return json({ error: 'bad_request' }, 400);
      const urls: Record<string, string> = {};
      for (const p of paths) {
        if (!p.startsWith(folder) || !p.endsWith('.enc') || !UUID.test(p.slice(folder.length, -'.enc'.length))) continue;
        urls[p] = await presign('GET', p, DOWNLOAD_S);
      }
      return json({ urls, expiresIn: DOWNLOAD_S });
    }

    if (body.action === 'clear') {
      await removeFolder(`${caller.coupleId}/`);
      return json({ ok: true });
    }
  } catch (e) {
    console.error('chat-video', e);
    return json({ error: 'storage_failed' }, 500);
  }
  return json({ error: 'bad_request' }, 400);
});

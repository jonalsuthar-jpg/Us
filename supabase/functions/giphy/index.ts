/**
 * giphy — GIF and sticker search, with our GIPHY key kept here rather than in
 * the apps (so every build and device has it, and it can be changed without a
 * release).
 *
 *   { kind: 'gif' | 'sticker', q?, offset? } → GIPHY's own { data } (parsed by searchGifs)
 *
 * Trending when `q` is empty. PG-13, no Clips. Paired, approved users only.
 */
import { cors, json, requireCaller } from '../_shared/auth.ts';

const LIMIT = 24;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const key = Deno.env.get('GIPHY_API_KEY');
  if (!key) return json({ error: 'not_configured' }, 503);

  const body = await req.json().catch(() => ({}));
  const type = body.kind === 'sticker' ? 'stickers' : 'gifs';
  const q = typeof body.q === 'string' ? body.q.trim().slice(0, 50) : '';
  const offset = Math.min(Math.max(Number(body.offset) || 0, 0), 4999);
  const params = new URLSearchParams({ api_key: key, limit: String(LIMIT), offset: String(offset), rating: 'pg-13', bundle: 'messaging_non_clips' });
  if (q) params.set('q', q);

  const res = await fetch(`https://api.giphy.com/v1/${type}/${q ? 'search' : 'trending'}?${params}`);
  if (!res.ok) return json({ error: 'giphy_unavailable' }, 502);
  const { data } = await res.json();
  return json({ data: Array.isArray(data) ? data : [] });
});

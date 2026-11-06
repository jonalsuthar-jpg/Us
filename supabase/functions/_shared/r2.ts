/**
 * Cloudflare R2: every photo, voice note, drawing and video lives here rather
 * than in Supabase Storage, because R2 doesn't charge for downloads.
 *
 *   chat videos:  "<couple_id>/video/<message id>.enc"
 *   other files:  "<bucket>/<path>", where path is what the database keeps
 *                 (memories, chat, snaps, drawings, birthday)
 *
 * The bucket sits behind the us-media Worker (workers/media), which only
 * honours links signed here with the shared key:
 *
 *   MEDIA_URL, MEDIA_SIGNING_KEY
 */
function media(): { base: string; key: string } {
  const base = Deno.env.get('MEDIA_URL');
  const key = Deno.env.get('MEDIA_SIGNING_KEY');
  if (!base || !key) throw new Error('r2_not_configured');
  return { base: base.replace(/\/$/, ''), key };
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

let hmacKey: { raw: string; key: CryptoKey } | null = null;

async function mac(message: string): Promise<string> {
  const { key } = media();
  if (hmacKey?.raw !== key) {
    hmacKey = { raw: key, key: await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']) };
  }
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey.key, new TextEncoder().encode(message)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sign(method: string, path: string, exp: number): Promise<string> {
  return `${media().base}/${encodePath(path)}?exp=${exp}&sig=${await mac(`${method}\n${path}\n${exp}`)}`;
}

const nowS = () => Math.floor(Date.now() / 1000);

/** A link that lets whoever holds it GET or PUT one file, for `seconds`. */
export function presign(method: 'GET' | 'PUT', path: string, seconds: number): Promise<string> {
  return sign(method, path, nowS() + seconds);
}

/**
 * A download link that stays the same for a whole day, so the browser and
 * the phone's image cache keep serving the file instead of fetching it again
 * whenever a new link is asked for. It lasts at least `seconds`.
 */
export function stableDownload(path: string, seconds: number): Promise<string> {
  const DAY = 24 * 3600;
  return sign('GET', path, Math.ceil((nowS() + seconds) / DAY) * DAY);
}

/** Delete one file. */
export async function removeFile(path: string): Promise<void> {
  const res = await fetch(await sign('DELETE', path, nowS() + 300), { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`r2_delete_failed ${res.status}`);
}

/** Delete everything under a folder ("<couple_id>/"). */
export function removeFolder(prefix: string): Promise<void> {
  return removeFile(prefix.endsWith('/') ? prefix : `${prefix}/`);
}

/** Copy a file inside the bucket (nothing passes through here). */
export async function copyFile(from: string, to: string): Promise<void> {
  const exp = nowS() + 300;
  const url = `${media().base}/${encodePath(to)}?exp=${exp}&from=${encodeURIComponent(from)}&sig=${await mac(`COPY\n${to}\n${exp}\n${from}`)}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`r2_copy_failed ${res.status}`);
}

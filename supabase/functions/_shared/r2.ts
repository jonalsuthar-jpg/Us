/**
 * Cloudflare R2: chat videos live here rather than in Supabase Storage,
 * because R2 doesn't charge for downloads. Every file sits under
 * "<couple_id>/video/", encrypted on the device like the rest of the chat.
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

async function sign(method: string, path: string, seconds: number): Promise<string> {
  const { base, key } = media();
  if (hmacKey?.raw !== key) {
    hmacKey = { raw: key, key: await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']) };
  }
  const exp = Math.floor(Date.now() / 1000) + seconds;
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey.key, new TextEncoder().encode(`${method}\n${path}\n${exp}`)));
  const sig = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${base}/${encodePath(path)}?exp=${exp}&sig=${sig}`;
}

/** A link that lets whoever holds it GET or PUT one file, for `seconds`. */
export function presign(method: 'GET' | 'PUT', path: string, seconds: number): Promise<string> {
  return sign(method, path, seconds);
}

/** Delete everything under a folder ("<couple_id>/"). */
export async function removeFolder(prefix: string): Promise<void> {
  const res = await fetch(await sign('DELETE', prefix.endsWith('/') ? prefix : `${prefix}/`, 300), { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`r2_delete_failed ${res.status}`);
}

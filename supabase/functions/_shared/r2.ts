/**
 * Cloudflare R2 (S3 API): chat videos live here rather than in Supabase
 * Storage, because R2 doesn't charge for downloads. Every file sits under
 * "<couple_id>/video/", encrypted on the device like the rest of the chat.
 *
 *   R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 */
import { AwsClient } from 'npm:aws4fetch@1.0.20';

let client: AwsClient | null = null;

function r2(): { client: AwsClient; base: string } {
  const account = Deno.env.get('R2_ACCOUNT_ID');
  const bucket = Deno.env.get('R2_BUCKET');
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
  if (!account || !bucket || !accessKeyId || !secretAccessKey) throw new Error('r2_not_configured');
  client ??= new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' });
  return { client, base: `https://${account}.r2.cloudflarestorage.com/${bucket}` };
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/** A link that lets whoever holds it GET or PUT one file, for `seconds`. */
export async function presign(method: 'GET' | 'PUT', path: string, seconds: number): Promise<string> {
  const { client, base } = r2();
  const url = new URL(`${base}/${encodePath(path)}`);
  url.searchParams.set('X-Amz-Expires', String(seconds));
  const signed = await client.sign(new Request(url, { method }), { aws: { signQuery: true } });
  return signed.url;
}

/** Delete everything under a folder ("<couple_id>/"). */
export async function removeFolder(prefix: string): Promise<void> {
  const { client, base } = r2();
  for (let pass = 0; pass < 100; pass++) {
    const list = new URL(base);
    list.searchParams.set('list-type', '2');
    list.searchParams.set('prefix', prefix);
    list.searchParams.set('max-keys', '500');
    const res = await client.fetch(list);
    if (!res.ok) throw new Error(`r2_list_failed ${res.status}`);
    const keys = [...(await res.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => decodeXml(m[1]!));
    if (!keys.length) return;
    for (const key of keys) {
      const del = await client.fetch(`${base}/${encodePath(key)}`, { method: 'DELETE' });
      if (!del.ok && del.status !== 404) throw new Error(`r2_delete_failed ${del.status}`);
    }
  }
}

const decodeXml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

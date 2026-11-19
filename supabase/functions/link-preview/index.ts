/**
 * link-preview — the title, description and picture of a web page, for the
 * card under a link in chat. The sender's app asks once, then the card
 * travels inside the encrypted message: this function sees the URL but never
 * which message it's for.
 *
 *   { url } → { url, title, description?, image?, host }   (or { error })
 *
 * Only public https pages: private, loopback and link-local addresses are
 * refused (checked again on every redirect), at most 3 redirects, 4 s and
 * 512 KB of HTML. Paired, approved users only.
 */
import { cors, json, requireCaller } from '../_shared/auth.ts';

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 4000;
const MAX_REDIRECTS = 3;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const caller = await requireCaller(req, 'chat');
  if (caller instanceof Response) return caller;
  const body = await req.json().catch(() => ({}));
  let url: URL;
  try {
    url = new URL(String(body.url ?? '').slice(0, 2048));
  } catch {
    return json({ error: 'bad_url' }, 400);
  }
  try {
    const page = await fetchPage(url);
    if (!page) return json({ error: 'no_preview' });
    const meta = readMeta(page.html);
    const title = clip(meta['og:title'] ?? meta['twitter:title'] ?? meta.title, 140);
    if (!title) return json({ error: 'no_preview' });
    const description = clip(meta['og:description'] ?? meta['twitter:description'] ?? meta.description, 240);
    const image = absoluteHttps(meta['og:image'] ?? meta['twitter:image'], page.url);
    return json({ url: url.toString(), title, description, image, host: page.url.hostname.replace(/^www\./, '') });
  } catch (e) {
    console.error('link-preview', e);
    return json({ error: 'no_preview' });
  }
});

async function fetchPage(start: URL): Promise<{ url: URL; html: string } | null> {
  let url = start;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isPublic(url))) return null;
    const res = await fetch(url, {
      redirect: 'manual',
      signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; UsLinkPreview/1.0)', accept: 'text/html,application/xhtml+xml' },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      await res.body?.cancel();
      if (!next) return null;
      url = new URL(next, url);
      continue;
    }
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html') || !res.body) {
      await res.body?.cancel();
      return null;
    }
    return { url, html: await readCapped(res.body) };
  }
  return null;
}

/** https on the default port, to a host that isn't (and doesn't resolve to) a private address. */
async function isPublic(url: URL): Promise<boolean> {
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return false;
  if (isIpLiteral(host)) return !isPrivateIp(host);
  try {
    const addrs = [
      ...(await Deno.resolveDns(host, 'A').catch(() => [] as string[])),
      ...(await Deno.resolveDns(host, 'AAAA').catch(() => [] as string[])),
    ];
    return addrs.every((a) => !isPrivateIp(a));
  } catch {
    // No DNS lookups in this runtime: the literal checks above still apply.
    return true;
  }
}

const isIpLiteral = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':');

function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
    return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
  }
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  );
}

async function readCapped(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { value, done } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
    // The tags we want live in <head>.
    if (new TextDecoder().decode(value).includes('</head>')) break;
  }
  await reader.cancel().catch(() => {});
  const all = new Uint8Array(Math.min(size, MAX_BYTES));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, all.length - at);
    all.set(part, at);
    at += part.length;
    if (at >= all.length) break;
  }
  return new TextDecoder().decode(all);
}

/** <meta property|name=… content=…> and <title>, lower-cased keys. */
function readMeta(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[m[1]!.toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
    const key = (attrs.property ?? attrs.name ?? '').toLowerCase();
    if (key && attrs.content && !(key in out)) out[key] = decodeEntities(attrs.content);
  }
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  if (title) out.title = decodeEntities(title);
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function clip(s: string | undefined, max: number): string | undefined {
  const t = s?.replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function absoluteHttps(src: string | undefined, base: URL): string | undefined {
  if (!src) return undefined;
  try {
    const u = new URL(src, base);
    return u.protocol === 'https:' && u.toString().length <= 1000 ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * us-media — the front door to the R2 bucket. Supabase Edge Functions hand
 * out short-lived links signed with MEDIA_SIGNING_KEY; this Worker checks
 * the signature and reads or writes the file through its bucket binding, so
 * no R2 access keys are needed anywhere.
 *
 *   GET    /<path>?exp=…&sig=…   → the file
 *   PUT    /<path>?exp=…&sig=…   → store the request body
 *   DELETE /<path>?exp=…&sig=…   → remove the file (a path ending in "/" removes everything under it)
 *   POST   /<path>?exp=…&from=<src>&sig=… → copy src to path
 *
 * sig = hex HMAC-SHA256(MEDIA_SIGNING_KEY, "<METHOD>\n<path>\n<exp>"),
 * or "COPY\n<path>\n<exp>\n<src>" for a copy.
 */
export interface Env {
  BUCKET: R2Bucket;
  MEDIA_SIGNING_KEY: string;
  ALLOWED_ORIGINS: string;
}

const MAX_PUT_BYTES = 100 * 1024 * 1024;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsFor(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(req.url);
    const path = url.pathname.slice(1).split('/').map(decodeURIComponent).join('/');
    const exp = Number(url.searchParams.get('exp'));
    const sig = url.searchParams.get('sig') ?? '';
    if (!path || !Number.isFinite(exp) || exp * 1000 < Date.now()) return text('expired', 403, cors);
    const from = url.searchParams.get('from');
    const signed = req.method === 'POST' && from ? `COPY\n${path}\n${exp}\n${from}` : `${req.method}\n${path}\n${exp}`;
    if (!(await verify(env.MEDIA_SIGNING_KEY, signed, sig))) return text('forbidden', 403, cors);

    if (req.method === 'POST' && from) {
      const src = await env.BUCKET.get(from);
      if (!src) return text('not found', 404, cors);
      await env.BUCKET.put(path, src.body, { httpMetadata: src.httpMetadata });
      return new Response(null, { status: 200, headers: cors });
    }

    if (req.method === 'GET') {
      const obj = await env.BUCKET.get(path);
      if (!obj) return text('not found', 404, cors);
      const headers = new Headers(cors);
      obj.writeHttpMetadata(headers);
      headers.set('etag', obj.httpEtag);
      // Paths are never reused, so a file can be kept for good.
      headers.set('cache-control', 'private, max-age=31536000, immutable');
      return new Response(obj.body, { headers });
    }

    if (req.method === 'PUT') {
      const size = Number(req.headers.get('content-length') ?? 0);
      if (size > MAX_PUT_BYTES) return text('too large', 413, cors);
      await env.BUCKET.put(path, req.body, { httpMetadata: { contentType: req.headers.get('content-type') ?? 'application/octet-stream' } });
      return new Response(null, { status: 200, headers: cors });
    }

    if (req.method === 'DELETE') {
      if (!path.endsWith('/')) {
        await env.BUCKET.delete(path);
        return new Response(null, { status: 204, headers: cors });
      }
      for (let pass = 0; pass < 100; pass++) {
        const list = await env.BUCKET.list({ prefix: path, limit: 1000 });
        if (!list.objects.length) break;
        await env.BUCKET.delete(list.objects.map((o) => o.key));
        if (!list.truncated) break;
      }
      return new Response(null, { status: 204, headers: cors });
    }

    return text('method not allowed', 405, cors);
  },
};

function corsFor(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

const text = (body: string, status: number, headers: Record<string, string>) => new Response(body, { status, headers });

async function verify(key: string, message: string, sig: string): Promise<boolean> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = sig.match(/^[0-9a-f]{64}$/) ? new Uint8Array(sig.match(/../g)!.map((h) => parseInt(h, 16))) : null;
  return !!bytes && crypto.subtle.verify('HMAC', k, bytes, new TextEncoder().encode(message));
}

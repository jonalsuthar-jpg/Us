/**
 * turn-credentials — ICE servers for WebRTC, so TURN secrets never ship in
 * the client bundle.
 *
 * Preferred: Metered.ca managed credentials
 *   METERED_DOMAIN   e.g. "yourapp.metered.live"
 *   METERED_API_KEY  secret key from the Metered dashboard
 * Fallback: static TURN (any provider / coturn)
 *   TURN_URLS        comma-separated, e.g. "turn:global.relay.metered.ca:80,turns:global.relay.metered.ca:443?transport=tcp"
 *   TURN_USERNAME, TURN_CREDENTIAL
 *
 * STUN is always included. Only paired users get credentials.
 */
import { cors, json, requireCaller } from '../_shared/auth.ts';

const STUN = { urls: ['stun:stun.relay.metered.ca:80', 'stun:stun.l.google.com:19302'] };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;

  const iceServers: RTCIceServer[] = [STUN];

  const domain = Deno.env.get('METERED_DOMAIN');
  const apiKey = Deno.env.get('METERED_API_KEY');
  if (domain && apiKey) {
    try {
      const res = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`);
      if (res.ok) {
        const servers = (await res.json()) as RTCIceServer[];
        iceServers.push(...servers.filter((s) => String(s.urls).includes('turn')));
        return json({ iceServers });
      }
      console.error('metered error', res.status);
    } catch (e) {
      console.error('metered fetch failed', e);
    }
  }

  const urls = Deno.env.get('TURN_URLS');
  if (urls) {
    iceServers.push({
      urls: urls.split(',').map((u) => u.trim()).filter(Boolean),
      username: Deno.env.get('TURN_USERNAME') ?? '',
      credential: Deno.env.get('TURN_CREDENTIAL') ?? '',
    });
  }
  return json({ iceServers });
});

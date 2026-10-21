/**
 * A plain OneSignal push to one person, for server-initiated notifications
 * (scheduled functions). Partner-to-partner pushes go through `push`, which
 * re-reads and authorises the record first.
 */
export interface Push {
  to: string;
  heading: string;
  content: string;
  /** Deep link inside the app, e.g. "/home". */
  url: string;
  category: string;
  threadId: string;
  collapseId?: string;
}

export async function sendPush(p: Push): Promise<boolean> {
  const appId = Deno.env.get('ONESIGNAL_APP_ID');
  const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
  if (!appId || !apiKey) return false;
  const channel = Deno.env.get('ONESIGNAL_ANDROID_CHANNEL_MESSAGES');
  const appUrl = Deno.env.get('APP_URL');
  const res = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${apiKey}` },
    body: JSON.stringify({
      app_id: appId,
      target_channel: 'push',
      include_aliases: { external_id: [p.to] },
      headings: { en: p.heading },
      contents: { en: p.content },
      data: { category: p.category, url: p.url },
      priority: 5,
      ios_interruption_level: 'passive',
      ios_sound: 'us_chime.wav',
      thread_id: p.threadId,
      android_group: p.threadId,
      ...(channel ? { android_channel_id: channel } : {}),
      ...(p.collapseId ? { collapse_id: p.collapseId } : {}),
      ...(appUrl ? { web_url: `${appUrl}${p.url}` } : {}),
      app_url: `us://${p.url.replace(/^\//, '')}`,
    }),
  });
  if (!res.ok) console.error('onesignal error', res.status, await res.text().catch(() => ''));
  return res.ok;
}

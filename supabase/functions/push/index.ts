/**
 * push — notify my partner via OneSignal.
 *
 * Body: { category: 'new_message', messageId } | { category: 'incoming_call' | 'call_ended', callId }
 *
 * The record is re-read with the service role and the caller must be its
 * sender/caller, so a client can't push arbitrary content. Each category maps
 * to its own channel, sound and priority (see CATEGORIES). Typing never pushes.
 *
 * Env: ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY,
 *      ONESIGNAL_ANDROID_CHANNEL_MESSAGES, ONESIGNAL_ANDROID_CHANNEL_CALLS, (optional)
 *      APP_URL (web origin for click-through, e.g. https://us.example.com)
 */
import { cors, json, requireCaller } from '../_shared/auth.ts';

type Category =
  | 'incoming_call'
  | 'call_ended'
  | 'new_message'
  | 'wellbeing_nudge'
  | 'memory_resurfaced'
  | 'letter_unlocked'
  | 'daily_question';

interface Style {
  iosSound?: string;
  androidChannelEnv?: string;
  priority: number;
  iosInterruption: 'passive' | 'active' | 'time-sensitive' | 'critical';
  ttl?: number;
  threadId: string;
}

/** Distinct treatment per category. Sounds are bundled by onesignal-expo-plugin. */
const CATEGORIES: Record<Category, Style> = {
  incoming_call: {
    iosSound: 'us_ring.wav',
    androidChannelEnv: 'ONESIGNAL_ANDROID_CHANNEL_CALLS',
    priority: 10,
    iosInterruption: 'time-sensitive',
    ttl: 45, // a ring that arrives late is worse than none
    threadId: 'calls',
  },
  call_ended: { priority: 5, iosInterruption: 'active', threadId: 'calls' },
  new_message: {
    iosSound: 'us_chime.wav',
    androidChannelEnv: 'ONESIGNAL_ANDROID_CHANNEL_MESSAGES',
    priority: 10,
    iosInterruption: 'active',
    threadId: 'chat',
  },
  // TODO(phase-3..6): triggered by scheduled functions / DB events, not clients.
  wellbeing_nudge: { iosSound: 'us_chime.wav', priority: 5, iosInterruption: 'passive', threadId: 'wellbeing' },
  memory_resurfaced: { iosSound: 'us_chime.wav', priority: 5, iosInterruption: 'passive', threadId: 'memories' },
  letter_unlocked: { iosSound: 'us_chime.wav', priority: 10, iosInterruption: 'active', threadId: 'letters' },
  daily_question: { iosSound: 'us_chime.wav', priority: 5, iosInterruption: 'passive', threadId: 'daily' },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;
  const { admin, userId, partnerId, coupleId } = caller;

  const appId = Deno.env.get('ONESIGNAL_APP_ID');
  const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
  if (!appId || !apiKey) return json({ skipped: 'onesignal_not_configured' });

  const body = await req.json().catch(() => ({}));
  const { data: me } = await admin.from('profiles').select('display_name, avatar_url').eq('id', userId).single();
  const name = me?.display_name ?? 'Your partner';

  let category: Category;
  let heading = name;
  let content: string;
  let data: Record<string, unknown>;
  let collapseId: string | undefined;
  let buttons: { id: string; text: string }[] | undefined;

  if (body.category === 'new_message') {
    const { data: msg } = await admin.from('messages').select('*').eq('id', body.messageId).maybeSingle();
    if (!msg || msg.sender_id !== userId || msg.couple_id !== coupleId) return json({ error: 'forbidden' }, 403);
    category = 'new_message';
    content = truncate(msg.body ?? '', 160);
    data = { category, url: '/talk', messageId: msg.id };
    // TODO: true inline reply needs a native notification category (iOS) /
    // RemoteInput (Android); for now "Reply" deep-links into the composer.
    buttons = [{ id: 'reply', text: 'Reply' }];
  } else if (body.category === 'incoming_call' || body.category === 'call_ended') {
    const { data: call } = await admin.from('calls').select('*').eq('id', body.callId).maybeSingle();
    if (!call || call.caller_id !== userId || call.couple_id !== coupleId) return json({ error: 'forbidden' }, 403);
    category = body.category;
    const kind = call.media === 'video' ? 'video call' : 'voice call';
    // Same collapse id: the "missed" push replaces the ringing one.
    collapseId = `call-${call.id}`;
    if (category === 'incoming_call') {
      if (call.status !== 'ringing') return json({ skipped: 'not_ringing' });
      content = `Incoming ${kind}`;
      buttons = [
        { id: 'decline', text: 'Decline' },
        { id: 'answer', text: 'Answer' },
      ];
    } else {
      content = `Missed ${kind}`;
    }
    data = { category, url: '/talk', callId: call.id };
  } else {
    return json({ error: 'unknown_category' }, 400);
  }

  const style = CATEGORIES[category];
  const androidChannel = style.androidChannelEnv ? Deno.env.get(style.androidChannelEnv) : undefined;
  const appUrl = Deno.env.get('APP_URL');

  const payload: Record<string, unknown> = {
    app_id: appId,
    target_channel: 'push',
    include_aliases: { external_id: [partnerId] },
    headings: { en: heading },
    contents: { en: content },
    data,
    priority: style.priority,
    ios_interruption_level: style.iosInterruption,
    thread_id: style.threadId,
    android_group: style.threadId,
    ...(style.iosSound ? { ios_sound: style.iosSound } : {}),
    ...(androidChannel ? { android_channel_id: androidChannel } : {}),
    ...(style.ttl ? { ttl: style.ttl } : {}),
    ...(collapseId ? { collapse_id: collapseId } : {}),
    ...(buttons ? { buttons, web_buttons: buttons.map((b) => ({ id: b.id, text: b.text })) } : {}),
    ...(me?.avatar_url ? { large_icon: me.avatar_url, chrome_web_icon: me.avatar_url, ios_attachments: { avatar: me.avatar_url } } : {}),
    ...(appUrl ? { web_url: `${appUrl}${data.url}` } : {}),
    app_url: `us://${String(data.url).replace(/^\//, '')}`,
  };

  const res = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${apiKey}` },
    body: JSON.stringify(payload),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('onesignal error', res.status, result);
    return json({ error: 'push_failed' }, 502);
  }
  return json({ ok: true, id: result.id });
});

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

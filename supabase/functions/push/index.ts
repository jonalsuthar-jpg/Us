/**
 * push — notify my partner via OneSignal.
 *
 * Body: { category: 'new_message', messageId } | { category: 'incoming_call' | 'call_ended', callId }
 *     | { category: 'daily_question', questionId }
 *     | { category: 'thinking_of_you', tapId } | { category: 'location_shared' } | { category: 'arrival', checkId }
 *     | { category: 'new_snap' | 'snap_reaction', snapId }
 *     | { category: 'draw_invite', game? } | { category: 'doodle' | 'guess_turn', drawingId }
 *
 * The record is re-read with the service role and the caller must be its
 * sender/caller, so a client can't push arbitrary content. Each category maps
 * to its own channel, sound and priority (see CATEGORIES). Typing never pushes.
 *
 * Env: ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY,
 *      ONESIGNAL_ANDROID_CHANNEL_MESSAGES, ONESIGNAL_ANDROID_CHANNEL_CALLS, (optional)
 *      APP_URL (web origin for click-through, e.g. https://us.example.com)
 */
import { cors, json, hasFeature, requireCaller } from '../_shared/auth.ts';

type Category =
  | 'incoming_call'
  | 'call_ended'
  | 'new_message'
  | 'memory_resurfaced'
  | 'letter_unlocked'
  | 'daily_question'
  | 'thinking_of_you'
  | 'location_shared'
  | 'arrival'
  | 'new_snap'
  | 'snap_reaction'
  | 'draw_invite'
  | 'doodle'
  | 'guess_turn';

/** The feature our couple needs for each push (see public.features). */
const FEATURE: Record<Category, string> = {
  incoming_call: 'calls',
  call_ended: 'calls',
  new_message: 'chat',
  memory_resurfaced: 'memories',
  letter_unlocked: 'letters',
  daily_question: 'daily_question',
  thinking_of_you: 'taps',
  location_shared: 'location',
  arrival: 'arrival',
  new_snap: 'snaps',
  snap_reaction: 'snaps',
  draw_invite: 'draw',
  doodle: 'draw',
  guess_turn: 'draw',
};

interface Style {
  iosSound?: string;
  androidChannelEnv?: string;
  priority: number;
  iosInterruption: 'passive' | 'active' | 'time_sensitive' | 'critical';
  ttl?: number;
  threadId: string;
}

/** Distinct treatment per category. Sounds are bundled by onesignal-expo-plugin. */
const CATEGORIES: Record<Category, Style> = {
  incoming_call: {
    iosSound: 'us_ring.wav',
    androidChannelEnv: 'ONESIGNAL_ANDROID_CHANNEL_CALLS',
    priority: 10,
    iosInterruption: 'time_sensitive',
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
  // TODO(phase-3/5): triggered by scheduled functions, not clients.
  memory_resurfaced: { iosSound: 'us_chime.wav', priority: 5, iosInterruption: 'passive', threadId: 'memories' },
  letter_unlocked: { iosSound: 'us_chime.wav', priority: 10, iosInterruption: 'active', threadId: 'letters' },
  daily_question: { iosSound: 'us_chime.wav', priority: 5, iosInterruption: 'passive', threadId: 'daily' },
  thinking_of_you: { iosSound: 'us_chime.wav', priority: 10, iosInterruption: 'active', threadId: 'taps' },
  location_shared: { priority: 5, iosInterruption: 'passive', threadId: 'location' },
  // "Got home safe" should reach someone waiting up, even in a focus mode.
  arrival: { iosSound: 'us_chime.wav', priority: 10, iosInterruption: 'time_sensitive', threadId: 'arrival' },
  new_snap: { iosSound: 'us_chime.wav', priority: 10, iosInterruption: 'active', threadId: 'snaps' },
  snap_reaction: { iosSound: 'us_chime.wav', priority: 5, iosInterruption: 'passive', threadId: 'snaps' },
  // "Come draw with me" is only useful right now.
  draw_invite: { iosSound: 'us_chime.wav', priority: 10, iosInterruption: 'active', ttl: 300, threadId: 'draw' },
  doodle: { iosSound: 'us_chime.wav', priority: 10, iosInterruption: 'active', threadId: 'draw' },
  guess_turn: { iosSound: 'us_chime.wav', priority: 5, iosInterruption: 'active', threadId: 'draw' },
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
  const needs = FEATURE[body.category as Category];
  if (needs && !(await hasFeature(caller, needs))) return json({ skipped: 'feature_off' });
  const { data: me } = await admin.from('profiles').select('display_name, avatar_url').eq('id', userId).single();
  const name = me?.display_name ?? 'Your partner';
  // The photo sits in our private bucket, so the phone gets a signed link it
  // can fetch for the notification (a week covers a push delivered late).
  const avatar = me?.avatar_url
    ? /^https?:/.test(me.avatar_url)
      ? me.avatar_url
      : (await admin.storage.from('memories').createSignedUrl(me.avatar_url, 7 * 24 * 3600)).data?.signedUrl ?? null
    : null;

  let category: Category;
  let heading = name;
  let content: string;
  let data: Record<string, unknown>;
  let collapseId: string | undefined;
  let buttons: { id: string; text: string }[] | undefined;

  if (body.category === 'new_message') {
    const { data: msg } = await admin.from('messages').select('*').eq('id', body.messageId).maybeSingle();
    if (!msg || msg.sender_id !== userId || msg.couple_id !== coupleId) return json({ error: 'forbidden' }, 403);
    // Give an open chat a moment to read it: if it's read already, there's
    // nothing to notify (and no late notification after closing the app).
    await new Promise((r) => setTimeout(r, 2500));
    const { data: now } = await admin.from('messages').select('status').eq('id', msg.id).maybeSingle();
    if (now?.status === 'read') return json({ skipped: 'already_read' });
    category = 'new_message';
    content = truncate(
      msg.body?.trim() ||
        ({ image: '📷 Photo', audio: '🎤 Voice note', gif: 'GIF', sticker: 'Sticker' } as Record<string, string>)[msg.media_kind ?? ''] ||
        '',
      160,
    );
    data = { category, url: '/talk', messageId: msg.id, ...(avatar ? { avatar } : {}) };
    // TODO: true inline reply needs a native notification category (iOS) /
    // RemoteInput (Android); for now "Reply" deep-links into the composer.
    buttons = [{ id: 'reply', text: 'Reply' }];
  } else if (body.category === 'incoming_call' || body.category === 'call_ended') {
    const { data: call } = await admin.from('calls').select('*').eq('id', body.callId).maybeSingle();
    if (!call || call.caller_id !== userId || call.couple_id !== coupleId) {
      return json({ error: 'forbidden' }, 403);
    }
    category = body.category;
    const kind = ({ audio: 'voice call', video: 'video call', listen: 'listen together', watch: 'watch together' } as Record<string, string>)[call.media] ?? 'call';
    // Same collapse id: the "missed" push replaces the ringing one.
    collapseId = `call-${call.id}`;
    if (category === 'incoming_call') {
      if (call.status !== 'ringing') {
        return json({ skipped: 'not_ringing' });
      }
      content =
        call.media === 'listen'
          ? 'Wants to listen to music with you'
          : call.media === 'watch'
            ? 'Wants to watch something with you'
            : `Incoming ${kind}`;
      buttons = [
        { id: 'decline', text: 'Decline' },
        { id: 'answer', text: 'Answer' },
      ];
    } else {
      content = `Missed ${kind}`;
    }
    // callerName / media let Android ring with a full-screen call even when Us is closed.
    data = { category, url: '/talk', callId: call.id, callerName: name, media: call.media };
  } else if (body.category === 'daily_question') {
    // I just answered today's question. The push never carries the answer.
    const { data: q } = await admin.from('daily_questions').select('id, couple_id').eq('id', body.questionId).maybeSingle();
    if (!q || q.couple_id !== coupleId) return json({ error: 'forbidden' }, 403);
    const { data: mine } = await admin
      .from('daily_answers')
      .select('created_at')
      .eq('question_id', q.id)
      .eq('owner_id', userId)
      .maybeSingle();
    if (!mine) return json({ error: 'forbidden' }, 403);
    if (Date.now() - Date.parse(mine.created_at) > 10 * 60_000) return json({ skipped: 'stale' });
    const { data: theirs } = await admin
      .from('daily_answers')
      .select('owner_id')
      .eq('question_id', q.id)
      .eq('owner_id', partnerId)
      .maybeSingle();
    category = 'daily_question';
    content = theirs
      ? `${name} answered today’s question. Both answers are open now.`
      : `${name} answered today’s question. Answer yours to see theirs.`;
    collapseId = `daily-${q.id}`;
    data = { category, url: '/connect' };
  } else if (body.category === 'thinking_of_you') {
    const { data: tap } = await admin.from('taps').select('id, couple_id, from_id, created_at').eq('id', body.tapId).maybeSingle();
    if (!tap || tap.from_id !== userId || tap.couple_id !== coupleId) return json({ error: 'forbidden' }, 403);
    if (Date.now() - Date.parse(tap.created_at) > 2 * 60_000) return json({ skipped: 'stale' });
    category = 'thinking_of_you';
    heading = `${name} 💗`;
    content = 'is thinking of you.';
    collapseId = `tap-${userId}`;
    data = { category, url: '/home' };
  } else if (body.category === 'location_shared') {
    const { data: share } = await admin.from('location_shares').select('couple_id, sharing_until').eq('owner_id', userId).maybeSingle();
    if (!share || share.couple_id !== coupleId || !share.sharing_until || Date.parse(share.sharing_until) <= Date.now()) {
      return json({ error: 'forbidden' }, 403);
    }
    const hours = Math.max(1, Math.round((Date.parse(share.sharing_until) - Date.now()) / 3_600_000));
    category = 'location_shared';
    content = `${name} is sharing their location with you for ${hours === 1 ? 'the next hour' : `${hours} hours`}.`;
    collapseId = `location-${userId}`;
    data = { category, url: '/home' };
  } else if (body.category === 'arrival') {
    const { data: check } = await admin.from('arrival_checks').select('*').eq('id', body.checkId).maybeSingle();
    if (!check || check.couple_id !== coupleId) return json({ error: 'forbidden' }, 403);
    category = 'arrival';
    collapseId = `arrival-${check.id}`;
    data = { category, url: '/home', checkId: check.id };
    if (check.arrived_at && check.traveller_id === userId) {
      if (Date.now() - Date.parse(check.arrived_at) > 10 * 60_000) return json({ skipped: 'stale' });
      content = `Got to ${check.label} safe. 🏡`;
    } else if (!check.arrived_at && !check.cancelled_at && check.requested_by === userId && check.traveller_id === partnerId) {
      content = `Asked you to let them know when you get ${check.label === 'home' ? 'home' : `to ${check.label}`}.`;
    } else if (!check.arrived_at && !check.cancelled_at && check.requested_by === userId && check.traveller_id === userId) {
      content = `Will let you know when they get ${check.label === 'home' ? 'home' : `to ${check.label}`}.`;
    } else {
      return json({ skipped: 'nothing_to_say' });
    }
  } else if (body.category === 'new_snap' || body.category === 'snap_reaction') {
    const { data: snap } = await admin
      .from('snaps')
      .select('id, couple_id, author_id, caption, created_at, expires_at, reaction, reacted_at')
      .eq('id', body.snapId)
      .maybeSingle();
    if (!snap || snap.couple_id !== coupleId || Date.parse(snap.expires_at) <= Date.now()) return json({ error: 'forbidden' }, 403);
    category = body.category;
    data = { category, url: '/home', snapId: snap.id };
    if (category === 'new_snap') {
      if (snap.author_id !== userId) return json({ error: 'forbidden' }, 403);
      if (Date.now() - Date.parse(snap.created_at) > 10 * 60_000) return json({ skipped: 'stale' });
      content = snap.caption ? `📸 ${truncate(snap.caption, 120)}` : '📸 Shared a snap. It’s here for 24 hours.';
      // A few snaps in a row show as one notification.
      collapseId = `snap-${userId}`;
    } else {
      // My partner's snap, which I just reacted to.
      if (snap.author_id !== partnerId || !snap.reaction || !snap.reacted_at) return json({ error: 'forbidden' }, 403);
      if (Date.now() - Date.parse(snap.reacted_at) > 2 * 60_000) return json({ skipped: 'stale' });
      content = `Reacted ${snap.reaction} to your snap.`;
      collapseId = `snap-reaction-${snap.id}`;
    }
  } else if (body.category === 'draw_invite') {
    category = 'draw_invite';
    content = body.game ? 'wants to play Draw & Guess with you ✏️' : 'is drawing. Come and draw together ✏️';
    collapseId = `draw-${userId}`;
    data = { category, url: body.game ? '/connect/draw/guess' : '/connect/draw' };
  } else if (body.category === 'doodle' || body.category === 'guess_turn') {
    const { data: d } = await admin
      .from('drawings')
      .select('id, couple_id, created_by, kind, for_user, note, created_at')
      .eq('id', body.drawingId)
      .maybeSingle();
    if (!d || d.couple_id !== coupleId || d.created_by !== userId) return json({ error: 'forbidden' }, 403);
    if (Date.now() - Date.parse(d.created_at) > 10 * 60_000) return json({ skipped: 'stale' });
    category = body.category;
    if (category === 'doodle') {
      if (d.kind !== 'doodle' || d.for_user !== partnerId) return json({ error: 'forbidden' }, 403);
      content = d.note ? `left you a doodle: “${truncate(d.note, 100)}”` : 'left you a doodle ✏️';
      collapseId = `doodle-${d.id}`;
      data = { category, url: '/home', drawingId: d.id };
    } else {
      if (d.kind !== 'guess') return json({ error: 'forbidden' }, 403);
      content = 'drew your Draw & Guess turn. Can you guess it?';
      collapseId = `guess-${d.id}`;
      data = { category, url: '/connect/draw/guess', drawingId: d.id };
    }
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
    ...(avatar ? { large_icon: avatar, chrome_web_icon: avatar, ios_attachments: { avatar } } : {}),
    ...(appUrl ? { web_url: `${appUrl}${data.url}` } : {}),
    // The app's screens for Draw together live at /draw… (the web's at /connect/draw…).
    app_url: `us://${String(data.url).replace(/^\/connect\/draw/, '/draw').replace(/^\//, '')}`,
  };

  const res = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${apiKey}` },
    body: JSON.stringify(payload),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('onesignal error', res.status, result);
    // Failures only: the admin overview counts them (push_failures_7d).
    await admin.from('push_log').insert({ category: String(body.category), outcome: 'onesignal_error', detail: { status: res.status, result } }).then(() => {}, () => {});
    return json({ error: 'push_failed' }, 502);
  }
  return json({ ok: true, id: result.id });
});

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

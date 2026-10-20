#!/usr/bin/env node
/**
 * Live end-to-end check against a real Supabase project (the one linked via
 * the CLI and configured in apps/web/.env.local).
 *
 *   node scripts/e2e-live.mjs
 *
 * Creates (or reuses) three confirmed test users — alice, bob and an outsider
 * carol — with random passwords stored in the git-ignored .test-accounts.json,
 * then exercises pairing, private realtime channels, live messages, receipts
 * and the Edge Functions. Needs the project's secret key, read from the CLI.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(root, 'apps/web/.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ref = new globalThis.URL(URL).hostname.split('.')[0];
const SECRET = JSON.parse(
  execSync(`npx supabase projects api-keys --project-ref ${ref} --reveal -o json`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString(),
).find((k) => k.type === 'secret').api_key;

const credsFile = join(root, '.test-accounts.json');
const creds = existsSync(credsFile) ? JSON.parse(readFileSync(credsFile, 'utf8')) : {};
const admin = createClient(URL, SECRET, { auth: { persistSession: false } });

async function user(handle, name) {
  const email = `${handle}.us-test@example.com`;
  if (!creds[handle]) {
    creds[handle] = { email, password: randomBytes(12).toString('base64url') };
    const { error } = await admin.auth.admin.createUser({
      email,
      password: creds[handle].password,
      email_confirm: true,
      user_metadata: { display_name: name },
    });
    if (error && !/already/i.test(error.message)) throw error;
    writeFileSync(credsFile, JSON.stringify(creds, null, 2));
  }
  const sb = createClient(URL, PUBLISHABLE, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword(creds[handle]);
  if (error) throw new Error(`${handle} sign-in: ${error.message}`);
  return { sb, id: data.user.id };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function waitFor(label, fn, ms = 10000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${label}`)), ms);
    fn((v) => {
      clearTimeout(t);
      resolve(v);
    });
  });
}
let failed = 0;
async function step(name, fn) {
  try {
    const note = await fn();
    console.log(`  ✓ ${name}${note ? ` — ${note}` : ''}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

console.log(`Live E2E against ${URL}\n`);
const alice = await user('alice', 'Alice');
const bob = await user('bob', 'Bob');
const carol = await user('carol', 'Carol');
let coupleId;

await step('pairing via invite code', async () => {
  const { data: existing } = await alice.sb.from('couples').select('*').maybeSingle();
  if (existing) {
    coupleId = existing.id;
    return 'already paired (reused)';
  }
  const { data: inv, error } = await alice.sb.rpc('create_invite');
  if (error) throw error;
  const { data: couple, error: e2 } = await bob.sb.rpc('redeem_invite', { invite_code: inv.code });
  if (e2) throw e2;
  coupleId = couple.id;
  return `code ${inv.code.slice(0, 2)}**-****`;
});

await step('outsider sees nothing', async () => {
  const [{ data: c }, { data: p }, { data: m }] = await Promise.all([
    carol.sb.from('couples').select('*'),
    carol.sb.from('profiles').select('*'),
    carol.sb.from('messages').select('*'),
  ]);
  if (c.length || m.length || p.length !== 1) throw new Error('leak');
});

const joinChannel = (who, topic) =>
  new Promise((resolve) => {
    who.sb.realtime.setAuth().then(() => {
      const ch = who.sb.channel(topic, { config: { private: true, broadcast: { self: false } } });
      ch.subscribe((status, err) => resolve({ ch, status, err }));
    });
  });

let aliceCh, bobCh;
await step('both partners join the private couple channel', async () => {
  [aliceCh, bobCh] = await Promise.all([joinChannel(alice, `couple:${coupleId}`), joinChannel(bob, `couple:${coupleId}`)]);
  if (aliceCh.status !== 'SUBSCRIBED' || bobCh.status !== 'SUBSCRIBED') {
    throw new Error(`alice ${aliceCh.status}, bob ${bobCh.status} ${aliceCh.err ?? ''}`);
  }
});

await step('typing broadcast reaches partner', async () => {
  const got = waitFor('typing', (done) =>
    bobCh.ch.on('broadcast', { event: 'typing' }, ({ payload }) => done(payload)),
  );
  await wait(300);
  await aliceCh.ch.send({ type: 'broadcast', event: 'typing', payload: { from: alice.id, typing: true } });
  const p = await got;
  if (!p.typing) throw new Error('bad payload');
});

await step('outsider cannot join the couple channel', async () => {
  const res = await Promise.race([joinChannel(carol, `couple:${coupleId}`), wait(8000).then(() => ({ status: 'TIMEOUT' }))]);
  if (res.status === 'SUBSCRIBED') {
    throw new Error('carol SUBSCRIBED — turn off "Allow public access" in Realtime settings');
  }
  return `refused (${res.status})`;
});

await step('message delivered live, then delivered → read receipts', async () => {
  const bobDb = bob.sb.channel(`db:${coupleId}`);
  const aliceDb = alice.sb.channel(`db:${coupleId}`);
  const statuses = [];
  const inserted = waitFor('insert', (done) =>
    bobDb
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `couple_id=eq.${coupleId}` }, (p) => done(p.new))
      .subscribe(),
  );
  const readSeen = waitFor('read update', (done) =>
    aliceDb
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `couple_id=eq.${coupleId}` }, (p) => {
        statuses.push(p.new.status);
        if (p.new.status === 'read') done();
      })
      .subscribe(),
  );
  await wait(2500); // let postgres_changes subscriptions settle
  const { data: msg, error } = await alice.sb
    .from('messages')
    .insert({ couple_id: coupleId, sender_id: alice.id, body: `e2e ping ${new Date().toISOString()}` })
    .select()
    .single();
  if (error) throw error;
  const row = await inserted;
  if (row.id !== msg.id) throw new Error('wrong row');
  await bob.sb.rpc('ack_messages', { p_status: 'delivered', p_ids: [msg.id] });
  await wait(400);
  await bob.sb.rpc('ack_messages', { p_status: 'read' });
  await readSeen;
  return `alice saw: ${statuses.join(' → ')}`;
});

await step('turn-credentials function', async () => {
  const { data, error } = await alice.sb.functions.invoke('turn-credentials');
  if (error) throw error;
  const turn = data.iceServers.some((s) => String(s.urls).includes('turn:'));
  return `${data.iceServers.length} ice server entries, TURN ${turn ? 'configured' : 'not configured yet (STUN only)'}`;
});

await step('push function', async () => {
  const { data: m } = await alice.sb.from('messages').select('id').eq('sender_id', alice.id).limit(1).single();
  const { data, error } = await alice.sb.functions.invoke('push', { body: { category: 'new_message', messageId: m.id } });
  if (error) throw error;
  return JSON.stringify(data);
});

await step('push function rejects spoofed sender', async () => {
  const { data: m } = await alice.sb.from('messages').select('id').eq('sender_id', alice.id).limit(1).single();
  const { error, data } = await bob.sb.functions.invoke('push', { body: { category: 'new_message', messageId: m.id } });
  if (!error && !data?.skipped) throw new Error('bob could push as alice');
  return error ? 'forbidden' : 'skipped (OneSignal not configured, check runs after config)';
});

// ---------------------------------------------------------------- Phase 4–6
// Rows created here are tagged "e2e" and removed at the end.
const cleanup = [];

await step('plan: calendar event shared, outsider blind', async () => {
  const { data: ev, error } = await alice.sb
    .from('calendar_events')
    .insert({ couple_id: coupleId, created_by: alice.id, title: 'e2e dinner', starts_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  cleanup.push(() => alice.sb.from('calendar_events').delete().eq('id', ev.id));
  const { data: seen } = await bob.sb.from('calendar_events').select('id').eq('id', ev.id);
  const { data: leak } = await carol.sb.from('calendar_events').select('id');
  if (seen.length !== 1 || leak.length) throw new Error('visibility wrong');
});

await step('plan: pick_decision RPC', async () => {
  const { data: opts, error } = await alice.sb
    .from('decision_options')
    .insert([
      { couple_id: coupleId, category: 'e2e', label: 'Ramen' },
      { couple_id: coupleId, category: 'e2e', label: 'Tacos' },
    ])
    .select();
  if (error) throw error;
  cleanup.push(() => alice.sb.from('decision_options').delete().eq('category', 'e2e'));
  const { data: pick, error: e2 } = await bob.sb.rpc('pick_decision', { p_category: 'e2e' });
  if (e2) throw e2;
  if (!opts.some((o) => o.id === pick.id) || pick.times_picked !== 1) throw new Error('bad pick');
  return `picked ${pick.label}`;
});

await step('memory: private photo bucket scoped to the couple', async () => {
  const path = `${coupleId}/e2e-${Date.now()}.png`;
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (ch) => ch.charCodeAt(0));
  const { error } = await alice.sb.storage.from('memories').upload(path, png, { contentType: 'image/png' });
  if (error) throw error;
  cleanup.push(() => alice.sb.storage.from('memories').remove([path]));
  const { data: signed, error: e2 } = await bob.sb.storage.from('memories').createSignedUrl(path, 60);
  if (e2) throw e2;
  const res = await fetch(signed.signedUrl);
  if (!res.ok) throw new Error(`partner fetch ${res.status}`);
  const { error: e3 } = await carol.sb.storage.from('memories').createSignedUrl(path, 60);
  if (!e3) throw new Error('outsider could read the photo');
  const { error: e4 } = await carol.sb.storage.from('memories').upload(`${coupleId}/intruder.png`, png, { contentType: 'image/png' });
  if (!e4) throw new Error('outsider could upload into the couple folder');
  return 'partner reads, outsider blocked';
});

await step('growth: nudge exposes only a timestamp; push verifies ownership', async () => {
  const { data: mood, error } = await bob.sb
    .from('mood_checkins')
    .insert({ owner_id: bob.id, score: 2, note: 'e2e private note', nudge_partner: true })
    .select()
    .single();
  if (error) throw error;
  cleanup.push(() => bob.sb.from('mood_checkins').delete().eq('id', mood.id));
  const { data: nudges, error: e2 } = await alice.sb.rpc('partner_nudges', { p_hours: 1 });
  if (e2) throw e2;
  if (!nudges.length || Object.keys(nudges[0]).join() !== 'nudged_at') throw new Error('nudge shape leaked fields');
  const { data: rows } = await alice.sb.from('mood_checkins').select('*');
  if (rows.length) throw new Error('alice can read check-ins');
  const { data: ok, error: e3 } = await bob.sb.functions.invoke('push', { body: { category: 'wellbeing_nudge', checkinId: mood.id } });
  if (e3) throw e3;
  const { error: spoof, data: spoofData } = await alice.sb.functions.invoke('push', { body: { category: 'wellbeing_nudge', checkinId: mood.id } });
  if (!spoof && !spoofData?.skipped) throw new Error('alice could nudge as bob');
  return `owner: ${JSON.stringify(ok)}, spoof: ${spoof ? 'forbidden' : 'skipped'}`;
});

for (const undo of cleanup.reverse()) await undo();

for (const c of [aliceCh, bobCh]) await c?.ch.unsubscribe();
await Promise.all([alice, bob, carol].map((u) => u.sb.removeAllChannels()));
console.log(`\n${failed ? `${failed} FAILED` : 'all passed'} · test logins in .test-accounts.json`);
process.exit(failed ? 1 : 0);

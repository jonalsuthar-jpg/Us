#!/usr/bin/env node
/**
 * Applies supabase/migrations to an in-process Postgres (PGlite) with a
 * minimal Supabase shim (auth schema, roles, auth.uid()) and asserts the
 * security model: pairing rules, RLS isolation, private tables, receipt and
 * call state machines.
 *
 *   npm run test:db
 */
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();

const SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create schema extensions;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

await db.exec(SHIM);

const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
for (const file of migrations) {
  let sql = readFileSync(join(root, 'supabase/migrations', file), 'utf8');
  // PGlite ships gen_random_uuid() in core; pgcrypto isn't needed here.
  sql = sql.replace(/create extension if not exists pgcrypto[^;]*;/i, '');
  try {
    await db.exec(sql);
  } catch (e) {
    console.error(`✗ migration ${file} failed:\n  ${e.message}`);
    process.exit(1);
  }
  console.log(`✓ applied ${file}`);
}

// -- helpers ---------------------------------------------------------------

async function as(userId, fn) {
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${userId ?? ''}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
async function rejects(promise, pattern, label) {
  try {
    await promise;
  } catch (e) {
    if (pattern && !pattern.test(e.message)) throw new Error(`${label}: wrong error "${e.message}"`);
    return;
  }
  throw new Error(`${label}: expected an error`);
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

// -- fixtures -----------------------------------------------------------------

const [alice, bob, carol, dave] = (
  await q(`insert into auth.users (email, raw_user_meta_data) values
    ('alice@example.com', '{"display_name":"Alice"}'),
    ('bob@example.com', '{}'),
    ('carol@example.com', '{"display_name":"Carol"}'),
    ('dave@example.com', '{"display_name":"Dave"}')
    returning id`)
).map((r) => r.id);

console.log('\nSecurity model');

let couple;

await test('profiles are created on signup (display name falls back to email)', async () => {
  const rows = await q(`select display_name from public.profiles`);
  assert.deepEqual(rows.map((r) => r.display_name).sort(), ['Alice', 'Carol', 'Dave', 'bob']);
});

await test('invite: create, idempotent while open, format', async () => {
  const a = await as(alice, () => one(`select * from public.create_invite()`));
  const b = await as(alice, () => one(`select * from public.create_invite()`));
  assert.match(a.code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(a.code, b.code);
});

await test('invite: cannot redeem your own; garbage codes rejected', async () => {
  const { code } = await as(alice, () => one(`select code from public.invites`));
  await rejects(as(alice, () => q(`select public.redeem_invite($1)`, [code])), /invite_own/, 'own');
  await rejects(as(bob, () => q(`select public.redeem_invite('NOPE')`)), /invite_invalid/, 'short');
  await rejects(as(bob, () => q(`select public.redeem_invite('AAAA-AAAA')`)), /invite_invalid/, 'unknown');
});

await test('invite: other users cannot see or enumerate invites', async () => {
  const rows = await as(bob, () => q(`select * from public.invites`));
  assert.equal(rows.length, 0);
});

await test('pairing: partner redeems (lower-case, no dash) → couple with A = creator', async () => {
  const { code } = await as(alice, () => one(`select code from public.invites`));
  couple = await as(bob, () => one(`select * from public.redeem_invite($1)`, [code.replace('-', '').toLowerCase()]));
  assert.equal(couple.user_a_id, alice);
  assert.equal(couple.user_b_id, bob);
});

await test('pairing: an invite cannot be reused, paired users cannot pair again', async () => {
  const { code } = await one(`select code from public.invites where redeemed_by is not null`);
  await rejects(as(carol, () => q(`select public.redeem_invite($1)`, [code])), /invite_used/, 'reuse');
  await rejects(as(alice, () => q(`select public.create_invite()`)), /already_paired/, 'paired create');
  const { code: carolCode } = await as(carol, () => one(`select code from public.create_invite()`));
  await rejects(as(bob, () => q(`select public.redeem_invite($1)`, [carolCode])), /already_paired/, 'paired redeem');
});

await test('pairing: couples are immutable to clients', async () => {
  await rejects(as(alice, () => q(`delete from public.couples`)), /permission denied/, 'delete');
  await rejects(as(alice, () => q(`update public.couples set user_b_id = $1`, [carol])), /permission denied/, 'update');
  await rejects(
    as(carol, () => q(`insert into public.couples (user_a_id, user_b_id) values ($1, $2)`, [carol, dave])),
    /permission denied/,
    'insert',
  );
});

await test('profiles: visible to self + partner only; editable by self only', async () => {
  const seen = await as(alice, () => q(`select id from public.profiles`));
  assert.deepEqual(new Set(seen.map((r) => r.id)), new Set([alice, bob]));
  const outsider = await as(carol, () => q(`select id from public.profiles`));
  assert.deepEqual(outsider.map((r) => r.id), [carol]);

  const touched = await as(alice, () => q(`update public.profiles set display_name = 'Hacked' where id = $1 returning id`, [bob]));
  assert.equal(touched.length, 0);
  await as(alice, () => q(`update public.profiles set display_name = 'Al' where id = $1`, [alice]));
  await rejects(as(alice, () => q(`update public.profiles set id = gen_random_uuid() where id = $1`, [alice])), /permission denied/, 'id');
});

let msgId;
await test('messages: send as self, readable by the couple only', async () => {
  msgId = (await as(alice, () => one(
    `insert into public.messages (couple_id, sender_id, body) values ($1, $2, 'hi bob') returning id`,
    [couple.id, alice],
  ))).id;
  assert.equal((await as(bob, () => q(`select * from public.messages`))).length, 1);
  assert.equal((await as(carol, () => q(`select * from public.messages`))).length, 0);
  assert.equal((await as(null, () => q(`select * from public.messages`))).length, 0);
});

await test('messages: cannot spoof sender, couple, status or call log entries', async () => {
  await rejects(as(alice, () => q(`insert into public.messages (couple_id, sender_id, body) values ($1, $2, 'x')`, [couple.id, bob])), /row-level security/, 'spoof sender');
  await rejects(as(carol, () => q(`insert into public.messages (couple_id, sender_id, body) values ($1, $2, 'x')`, [couple.id, carol])), /row-level security/, 'foreign couple');
  await rejects(as(alice, () => q(`insert into public.messages (couple_id, sender_id, body, status) values ($1, $2, 'x', 'read')`, [couple.id, alice])), /row-level security/, 'pre-read');
  await rejects(as(alice, () => q(`update public.messages set body = 'edited'`)), /permission denied/, 'edit');
  await rejects(as(alice, () => q(`delete from public.messages`)), /permission denied/, 'delete');
});

await test('receipts: only the recipient advances status, forward only', async () => {
  assert.equal((await as(alice, () => one(`select public.ack_messages('read') as n`))).n, 0, 'sender cannot ack own');
  await rejects(as(carol, () => q(`select public.ack_messages('read')`)), /not_paired/, 'unpaired');
  assert.equal((await as(bob, () => one(`select public.ack_messages('delivered', array[$1]::uuid[]) as n`, [msgId]))).n, 1);
  let m = await one(`select status, delivered_at, read_at from public.messages where id = $1`, [msgId]);
  assert.equal(m.status, 'delivered');
  assert.ok(m.delivered_at && !m.read_at);
  assert.equal((await as(bob, () => one(`select public.ack_messages('read') as n`))).n, 1);
  assert.equal((await as(bob, () => one(`select public.ack_messages('delivered') as n`))).n, 0, 'no regression');
  m = await one(`select status, read_at from public.messages where id = $1`, [msgId]);
  assert.equal(m.status, 'read');
  assert.ok(m.read_at);
});

let callId;
await test('calls: caller can only ring their partner', async () => {
  await rejects(as(alice, () => q(`insert into public.calls (couple_id, caller_id, callee_id) values ($1, $2, $3)`, [couple.id, alice, carol])), /row-level security/, 'ring stranger');
  await rejects(as(alice, () => q(`insert into public.calls (couple_id, caller_id, callee_id, status) values ($1, $2, $3, 'active')`, [couple.id, alice, bob])), /row-level security/, 'pre-active');
  callId = (await as(alice, () => one(`insert into public.calls (couple_id, caller_id, callee_id, media) values ($1, $2, $3, 'video') returning id`, [couple.id, alice, bob]))).id;
  assert.equal((await as(carol, () => q(`select * from public.calls`))).length, 0);
});

await test('calls: only callee answers; outsiders cannot touch; end logs to thread', async () => {
  await rejects(as(carol, () => q(`select public.set_call_status($1, 'ended')`, [callId])), /call_not_found/, 'outsider');
  assert.equal((await as(alice, () => one(`select (public.set_call_status($1, 'active')).status`, [callId]))).status, 'ringing');
  assert.equal((await as(bob, () => one(`select (public.set_call_status($1, 'active')).status`, [callId]))).status, 'active');
  assert.equal((await as(alice, () => one(`select (public.set_call_status($1, 'ended')).status`, [callId]))).status, 'ended');
  assert.equal((await as(bob, () => one(`select (public.set_call_status($1, 'active')).status`, [callId]))).status, 'ended', 'terminal');
  const log = await as(bob, () => q(`select kind, sender_id from public.messages where call_id = $1`, [callId]));
  assert.deepEqual(log, [{ kind: 'call', sender_id: alice }]);
});

await test('calls: cancelled/unanswered → missed, logged once', async () => {
  const id = (await as(bob, () => one(`insert into public.calls (couple_id, caller_id, callee_id, media) values ($1, $2, $3, 'audio') returning id`, [couple.id, bob, alice]))).id;
  assert.equal((await as(bob, () => one(`select (public.set_call_status($1, 'ended')).status`, [id]))).status, 'missed');
  assert.equal((await as(alice, () => one(`select (public.set_call_status($1, 'missed')).status`, [id]))).status, 'missed');
  const log = await q(`select count(*)::int as n from public.messages where call_id = $1`, [id]);
  assert.equal(log[0].n, 1);
});

await test('private tables: partner can never read or write my rows', async () => {
  await as(alice, () => q(`insert into public.mood_checkins (owner_id, score, note) values ($1, 2, 'rough day')`, [alice]));
  assert.equal((await as(bob, () => q(`select * from public.mood_checkins`))).length, 0);
  await rejects(as(bob, () => q(`insert into public.mood_checkins (owner_id, score) values ($1, 5)`, [alice])), /row-level security/, 'write as partner');
  const touched = await as(bob, () => q(`update public.mood_checkins set note = 'x' returning 1`));
  assert.equal(touched.length, 0);
  assert.equal((await as(alice, () => q(`select * from public.mood_checkins`))).length, 1);
});

await test('private tables: insecurity check-ins visible to partner only once shared', async () => {
  await as(alice, () => q(`insert into public.insecurity_checkins (owner_id, body) values ($1, 'private worry')`, [alice]));
  assert.equal((await as(bob, () => q(`select * from public.insecurity_checkins`))).length, 0);
  await as(alice, () => q(`update public.insecurity_checkins set shared_at = now()`));
  assert.equal((await as(bob, () => q(`select * from public.insecurity_checkins`))).length, 1);
  assert.equal((await as(carol, () => q(`select * from public.insecurity_checkins`))).length, 0);
});

await test('shared phase tables: couple-scoped', async () => {
  await as(bob, () => q(`insert into public.calendar_events (couple_id, created_by, title, starts_at) values ($1, $2, 'Dinner', now())`, [couple.id, bob]));
  assert.equal((await as(alice, () => q(`select * from public.calendar_events`))).length, 1);
  assert.equal((await as(carol, () => q(`select * from public.calendar_events`))).length, 0);
  await rejects(as(carol, () => q(`insert into public.calendar_events (couple_id, created_by, title, starts_at) values ($1, $2, 'x', now())`, [couple.id, carol])), /row-level security/, 'foreign');
});

console.log('\nPhase 4 · Plan');

await test('calendar: create only as yourself; end cannot precede start', async () => {
  await rejects(
    as(alice, () => q(`insert into public.calendar_events (couple_id, created_by, title, starts_at) values ($1, $2, 'x', now())`, [couple.id, bob])),
    /row-level security/,
    'spoof creator',
  );
  await rejects(
    as(alice, () => q(`insert into public.calendar_events (couple_id, created_by, title, starts_at, ends_at) values ($1, $2, 'x', now(), now() - interval '1 hour')`, [couple.id, alice])),
    /ends_after_start/,
    'ends before start',
  );
  // Partner can edit a shared event.
  const edited = await as(alice, () => q(`update public.calendar_events set title = 'Dinner at 8' returning id`));
  assert.equal(edited.length, 1);
});

await test('decisions: weighted pick within a category, recorded, couple-scoped', async () => {
  await as(alice, () => q(
    `insert into public.decision_options (couple_id, category, label, weight) values
       ($1, 'dinner', 'Ramen', 9), ($1, 'dinner', 'Tacos', 1), ($1, 'film', 'Paddington', 1)`,
    [couple.id],
  ));
  const counts = { Ramen: 0, Tacos: 0 };
  for (let i = 0; i < 300; i++) {
    await q(`update public.decision_options set last_picked_at = null`);
    const p = await as(bob, () => one(`select * from public.pick_decision('dinner')`));
    counts[p.label]++;
  }
  assert.equal(counts.Ramen + counts.Tacos, 300, 'only the requested category');
  assert.ok(counts.Ramen > 220, `weight 9:1 should dominate (got ${counts.Ramen}:${counts.Tacos})`);
  const ramen = await one(`select times_picked from public.decision_options where label = 'Ramen'`);
  assert.equal(ramen.times_picked, counts.Ramen);
  // Whichever option won the final pick carries its timestamp.
  assert.equal((await one(`select count(*)::int as n from public.decision_options where category = 'dinner' and last_picked_at is not null`)).n, 1);
  await rejects(as(alice, () => q(`select public.pick_decision('nothing here')`)), /no_options/, 'empty');
  await rejects(as(carol, () => q(`select public.pick_decision('dinner')`)), /not_paired/, 'outsider');
});

await test('decisions: a recent pick is deprioritised', async () => {
  // Equal weights; Ramen was just picked, Tacos never → Tacos should win ~5:1.
  await q(`update public.decision_options set weight = 1`);
  const counts = { Ramen: 0, Tacos: 0 };
  for (let i = 0; i < 300; i++) {
    await q(`update public.decision_options set last_picked_at = case when label = 'Ramen' then now() else null end`);
    counts[(await as(alice, () => one(`select (public.pick_decision('dinner')).label`))).label]++;
  }
  assert.ok(counts.Tacos > 200, `recent pick should be rarer (got Ramen ${counts.Ramen} : Tacos ${counts.Tacos})`);
});

await test('labour: log for either of you, never for an outsider', async () => {
  await as(bob, () => q(`insert into public.labor_entries (couple_id, done_by, task, effort) values ($1, $2, 'Laundry', 2)`, [couple.id, alice]));
  await rejects(
    as(bob, () => q(`insert into public.labor_entries (couple_id, done_by, task) values ($1, $2, 'x')`, [couple.id, carol])),
    /row-level security/,
    'outsider',
  );
  await rejects(
    as(bob, () => q(`update public.labor_entries set done_by = $1`, [carol])),
    /row-level security/,
    'reassign to outsider',
  );
});

await test('costs: paid by a member, valid currency, settlements recorded', async () => {
  await as(alice, () => q(`insert into public.expenses (couple_id, paid_by, description, amount_cents, currency) values ($1, $2, 'Groceries', 4200, 'EUR')`, [couple.id, alice]));
  await as(bob, () => q(`insert into public.expenses (couple_id, paid_by, description, amount_cents, currency, split_a_pct, is_settlement) values ($1, $2, 'Settle up', 2100, 'EUR', 100, true)`, [couple.id, bob]));
  await rejects(
    as(alice, () => q(`insert into public.expenses (couple_id, paid_by, description, amount_cents) values ($1, $2, 'x', 100)`, [couple.id, carol])),
    /row-level security/,
    'outsider payer',
  );
  await rejects(
    as(alice, () => q(`insert into public.expenses (couple_id, paid_by, description, amount_cents, currency) values ($1, $2, 'x', 100, 'eur')`, [couple.id, alice])),
    /currency_format/,
    'currency',
  );
  assert.equal((await as(carol, () => q(`select * from public.expenses`))).length, 0);
});

console.log('\nPhase 5 · Memory');

// A second couple, so cross-couple isolation is tested against real rows.
const otherCouple = await (async () => {
  const { code } = await as(carol, () => one(`select code from public.create_invite()`));
  return as(dave, () => one(`select * from public.redeem_invite($1)`, [code]));
})();

let memoryId;
await test('memories: shared with the couple, created as yourself, photos in the couple folder', async () => {
  memoryId = (await as(alice, () => one(
    `insert into public.memories (couple_id, created_by, title, happened_on, kind, photo_path)
     values ($1::uuid, $2, 'Lisbon', '2025-06-01', 'trip', $1::text || '/lisbon.jpg') returning id`,
    [couple.id, alice],
  ))).id;
  assert.equal((await as(bob, () => q(`select * from public.memories`))).length, 1);
  assert.equal((await as(carol, () => q(`select * from public.memories`))).length, 0);
  await rejects(
    as(bob, () => q(`insert into public.memories (couple_id, created_by, title, happened_on) values ($1, $2, 'x', current_date)`, [couple.id, alice])),
    /row-level security/,
    'spoof creator',
  );
  await rejects(
    as(alice, () => q(`insert into public.memories (couple_id, created_by, title, happened_on, photo_path) values ($1, $2, 'x', current_date, $3)`, [couple.id, alice, `${otherCouple.id}/steal.jpg`])),
    /photo_in_couple_folder/,
    'foreign folder',
  );
});

await test('memory ratings: private to each of us, only on our own memories', async () => {
  await as(alice, () => q(`insert into public.memory_ratings (memory_id, owner_id, rating, note) values ($1, $2, 5, 'best week')`, [memoryId, alice]));
  await as(bob, () => q(`insert into public.memory_ratings (memory_id, owner_id, rating, note) values ($1, $2, 3, 'too hot')`, [memoryId, bob]));
  const aliceSees = await as(alice, () => q(`select owner_id, note from public.memory_ratings`));
  assert.deepEqual(aliceSees, [{ owner_id: alice, note: 'best week' }]);
  const carolMemory = (await as(carol, () => one(
    `insert into public.memories (couple_id, created_by, title, happened_on) values ($1, $2, 'Theirs', current_date) returning id`,
    [otherCouple.id, carol],
  ))).id;
  await rejects(
    as(alice, () => q(`insert into public.memory_ratings (memory_id, owner_id, rating) values ($1, $2, 1)`, [carolMemory, alice])),
    /row-level security/,
    'rate another couple’s memory',
  );
});

console.log('\nPhase 6 · Growth');

await test('goals: shared board; my goals are mine to edit, ours are for both', async () => {
  const mine = (await as(alice, () => one(`insert into public.goals (couple_id, owner_id, title) values ($1, $2, 'Run 10k') returning id`, [couple.id, alice]))).id;
  await as(bob, () => q(`insert into public.goals (couple_id, owner_id, title) values ($1, null, 'Save for Japan')`, [couple.id]));
  assert.equal((await as(bob, () => q(`select * from public.goals`))).length, 2, 'board is shared');
  assert.equal((await as(bob, () => q(`update public.goals set progress = 90 where id = $1 returning 1`, [mine]))).length, 0, 'partner cannot edit mine');
  assert.equal((await as(alice, () => q(`update public.goals set progress = 40 where owner_id is null returning 1`))).length, 1, 'either edits ours');
  await rejects(as(bob, () => q(`insert into public.goals (couple_id, owner_id, title) values ($1, $2, 'x')`, [couple.id, alice])), /row-level security/, 'goal for partner');
  assert.equal((await as(carol, () => q(`select * from public.goals`))).length, 0);
});

await test('mood: partner gets nudge timestamps only — never score or note', async () => {
  await as(bob, () => q(`insert into public.mood_checkins (owner_id, score, note, nudge_partner) values ($1, 1, 'awful meeting', true), ($1, 4, 'fine', false)`, [bob]));
  const nudges = await as(alice, () => q(`select * from public.partner_nudges()`));
  assert.equal(nudges.length, 1);
  assert.deepEqual(Object.keys(nudges[0]), ['nudged_at']);
  assert.equal((await as(bob, () => q(`select * from public.partner_nudges()`))).length, 0, 'alice never asked');
  assert.equal((await as(carol, () => q(`select * from public.partner_nudges()`))).length, 0, 'outsider');
  assert.equal((await as(alice, () => q(`select * from public.mood_checkins where owner_id = $1`, [bob]))).length, 0, 'rows stay private');
});

await test('love languages: private until the owner shares', async () => {
  await as(alice, () => q(`insert into public.love_language_results (owner_id, scores, primary_language) values ($1, '{"time":5}', 'time')`, [alice]));
  assert.equal((await as(bob, () => q(`select * from public.love_language_results`))).length, 0);
  await as(alice, () => q(`update public.love_language_results set shared = true`));
  assert.equal((await as(bob, () => q(`select primary_language from public.love_language_results`)))[0].primary_language, 'time');
  assert.equal((await as(carol, () => q(`select * from public.love_language_results`))).length, 0);
  assert.equal((await as(bob, () => q(`update public.love_language_results set primary_language = 'gifts' returning 1`))).length, 0, 'read-only for partner');
  await rejects(as(bob, () => q(`insert into public.love_language_results (owner_id, scores, primary_language) values ($1, '{}', 'hugs')`, [bob])), /primary_valid/, 'unknown language');
});

console.log('\nHome');

await test('home: status is shared with my partner only, and only I can set mine', async () => {
  await as(alice, () => q(`update public.profiles set status_emoji = '😴', status_text = 'sleepy', status_at = now() where id = $1`, [alice]));
  assert.equal((await as(bob, () => q(`select status_text from public.profiles where id = $1`, [alice])))[0].status_text, 'sleepy');
  assert.equal((await as(carol, () => q(`select * from public.profiles where id = $1`, [alice]))).length, 0, 'outsider');
  assert.equal((await as(bob, () => q(`update public.profiles set status_text = 'x' where id = $1 returning 1`, [alice]))).length, 0, 'partner cannot set mine');
  await rejects(as(alice, () => q(`update public.profiles set status_text = repeat('a', 61) where id = $1`, [alice])), /status_text_len/, 'too long');
});

await test('home: couple photo is set by either partner, only inside our folder', async () => {
  const path = `${couple.id}/us.jpg`;
  assert.equal((await as(bob, () => one(`select photo_path from public.set_couple_photo($1)`, [path]))).photo_path, path);
  assert.equal((await as(alice, () => one(`select photo_path from public.couples`))).photo_path, path);
  await rejects(as(alice, () => q(`select public.set_couple_photo('someone-else/x.jpg')`)), /couple's folder/, 'foreign folder');
  await rejects(as(alice, () => q(`select public.set_couple_photo($1)`, [`${couple.id}/../x.jpg`])), /couple's folder/, 'traversal');
  await rejects(as(dave, () => q(`select public.set_couple_photo($1)`, [path])), /couple's folder/, 'another couple');
  assert.equal((await as(alice, () => one(`select photo_path from public.set_couple_photo(null)`))).photo_path, null, 'clear');
  await rejects(as(alice, () => q(`update public.couples set photo_path = 'x'`)), /permission denied/, 'no direct writes');
});

console.log('\nPhase 3 · Connect');

await test('future letters: written as yourself; only the author edits a sealed letter; nobody unlocks it directly', async () => {
  await rejects(
    as(bob, () => q(`insert into public.future_letters (couple_id, author_id, title, unlock_at) values ($1, $2, 'x', now())`, [couple.id, alice])),
    /row-level security/,
    'spoof author',
  );
  await rejects(
    as(alice, () => q(`insert into public.future_letters (couple_id, author_id, title, unlock_at, unlocked_at) values ($1, $2, 'x', now(), now())`, [couple.id, alice])),
    /row-level security/,
    'pre-unlocked',
  );
  const letter = (await as(alice, () => one(
    `insert into public.future_letters (couple_id, author_id, title, unlock_at) values ($1, $2, 'For our 5th', now() + interval '5 years') returning id`,
    [couple.id, alice],
  ))).id;
  assert.equal((await as(bob, () => q(`select title from public.future_letters`)))[0].title, 'For our 5th', 'partner sees the envelope');
  assert.equal((await as(carol, () => q(`select * from public.future_letters`))).length, 0, 'outsider');
  await rejects(as(bob, () => q(`update public.future_letters set unlocked_at = now()`)), /permission denied/, 'partner unlocks');
  await rejects(as(alice, () => q(`update public.future_letters set unlocked_at = now()`)), /permission denied/, 'author unlocks');
  assert.equal((await as(bob, () => q(`update public.future_letters set title = 'x' returning 1`))).length, 0, 'partner edits title');
  assert.equal((await as(alice, () => q(`update public.future_letters set title = 'For our fifth' returning 1`))).length, 1, 'author edits title');

  await as(alice, () => q(`insert into public.future_letter_bodies (letter_id, owner_id, ciphertext) values ($1, $2, 'sealed')`, [letter, alice]));
  assert.equal((await as(bob, () => q(`select * from public.future_letter_bodies`))).length, 0, 'body hidden from partner');
  const bobLetter = (await as(bob, () => one(
    `insert into public.future_letters (couple_id, author_id, title, unlock_milestone) values ($1, $2, 'Bob''s', 'wedding') returning id`,
    [couple.id, bob],
  ))).id;
  await rejects(
    as(alice, () => q(`insert into public.future_letter_bodies (letter_id, owner_id, ciphertext) values ($1, $2, 'x')`, [bobLetter, alice])),
    /row-level security/,
    'body for partner’s letter',
  );
});

await test('fight translator: start as yourself; entries go into our unrevealed sessions; reveal is server-only', async () => {
  await rejects(
    as(alice, () => q(`insert into public.fight_sessions (couple_id, started_by) values ($1, $2)`, [couple.id, bob])),
    /row-level security/,
    'spoof starter',
  );
  await rejects(
    as(alice, () => q(`insert into public.fight_sessions (couple_id, started_by, revealed_at) values ($1, $2, now())`, [couple.id, alice])),
    /row-level security/,
    'pre-revealed',
  );
  const session = (await as(alice, () => one(`insert into public.fight_sessions (couple_id, started_by) values ($1, $2) returning id`, [couple.id, alice]))).id;
  await rejects(as(bob, () => q(`update public.fight_sessions set revealed_at = now()`)), /permission denied/, 'client reveal');

  await as(alice, () => q(`insert into public.fight_entries (session_id, owner_id, raw_text) values ($1, $2, 'I felt ignored')`, [session, alice]));
  assert.equal((await as(bob, () => q(`select * from public.fight_entries`))).length, 0, 'raw text stays private');
  await rejects(
    as(bob, () => q(`insert into public.fight_entries (session_id, owner_id, raw_text, reframed_need) values ($1, $2, 'x', 'fake')`, [session, bob])),
    /row-level security/,
    'client writes the reframe',
  );
  await rejects(
    as(carol, () => q(`insert into public.fight_entries (session_id, owner_id, raw_text) values ($1, $2, 'x')`, [session, carol])),
    /row-level security/,
    'another couple’s session',
  );
  await rejects(as(alice, () => q(`update public.fight_entries set raw_text = 'edited'`)), /permission denied/, 'edit after submit');
});

await test('inside jokes: added as yourself, edited by either of us', async () => {
  await rejects(
    as(alice, () => q(`insert into public.inside_jokes (couple_id, created_by, phrase) values ($1, $2, 'x')`, [couple.id, bob])),
    /row-level security/,
    'spoof creator',
  );
  await as(alice, () => q(`insert into public.inside_jokes (couple_id, created_by, phrase) values ($1, $2, 'the duck')`, [couple.id, alice]));
  assert.equal((await as(bob, () => q(`update public.inside_jokes set story = 'Lisbon, 2025' returning 1`))).length, 1);
  await rejects(as(bob, () => q(`update public.inside_jokes set created_by = $1`, [bob])), /permission denied/, 'reassign creator');
  assert.equal((await as(carol, () => q(`select * from public.inside_jokes`))).length, 0);
});

await test('daily question: one shared prompt per day, created on demand, no repeats', async () => {
  const a = await as(alice, () => one(`select * from public.todays_question(current_date)`));
  const b = await as(bob, () => one(`select * from public.todays_question(current_date)`));
  assert.equal(a.id, b.id, 'same question for both of us');
  assert.ok(a.prompt.length > 5);
  const tomorrow = await as(bob, () => one(`select * from public.todays_question(current_date + 1)`));
  const yesterday = await as(bob, () => one(`select * from public.todays_question(current_date - 1)`));
  assert.equal(new Set([a.prompt, tomorrow.prompt, yesterday.prompt]).size, 3, 'prompts do not repeat');
  await rejects(as(alice, () => q(`select public.todays_question(current_date + 5)`)), /date_out_of_range/, 'far future');
  const theirs = await as(carol, () => one(`select * from public.todays_question(current_date)`));
  assert.notEqual(theirs.id, a.id, 'each couple has their own');
  assert.equal((await as(carol, () => q(`select * from public.daily_questions where id = $1`, [a.id]))).length, 0, 'outsider');
  await rejects(
    as(alice, () => q(`insert into public.daily_questions (couple_id, prompt) values ($1, 'x')`, [couple.id])),
    /permission denied/,
    'client creates questions',
  );
  const [erin] = (await q(`insert into auth.users (email) values ('erin@example.com') returning id`)).map((r) => r.id);
  await rejects(as(erin, () => q(`select public.todays_question()`)), /not_paired/, 'unpaired');
});

await test('daily question: answers stay hidden until both of us have answered, then are sealed', async () => {
  const { id } = await as(alice, () => one(`select id from public.todays_question(current_date)`));
  await as(alice, () => q(`insert into public.daily_answers (question_id, owner_id, answer) values ($1, $2, 'Coffee in bed')`, [id, alice]));

  let bobView = (await as(bob, () => q(`select * from public.daily_history()`))).find((r) => r.question_id === id);
  assert.equal(bobView.partner_answered, true, 'bob knows alice answered');
  assert.equal(bobView.partner_answer, null, 'but not what she said');
  assert.equal((await as(bob, () => q(`select * from public.daily_answers`))).length, 0, 'table stays private');

  let aliceView = (await as(alice, () => q(`select * from public.daily_history()`))).find((r) => r.question_id === id);
  assert.equal(aliceView.my_answer, 'Coffee in bed');
  assert.equal(aliceView.partner_answered, false);

  await as(bob, () => q(`insert into public.daily_answers (question_id, owner_id, answer) values ($1, $2, 'Dancing in the kitchen')`, [id, bob]));
  bobView = (await as(bob, () => q(`select * from public.daily_history()`))).find((r) => r.question_id === id);
  aliceView = (await as(alice, () => q(`select * from public.daily_history()`))).find((r) => r.question_id === id);
  assert.equal(bobView.partner_answer, 'Coffee in bed', 'revealed to bob');
  assert.equal(aliceView.partner_answer, 'Dancing in the kitchen', 'revealed to alice');
  assert.equal((await as(carol, () => q(`select * from public.daily_history()`))).some((r) => r.question_id === id), false, 'outsider');

  await rejects(as(alice, () => q(`update public.daily_answers set answer = 'changed'`)), /permission denied/, 'sealed');
  await rejects(
    as(alice, () => q(`insert into public.daily_answers (question_id, owner_id, answer) values ($1, $2, 'x')`, [id, alice])),
    /duplicate key/,
    'answer twice',
  );
  const carolQ = await as(carol, () => one(`select id from public.todays_question(current_date)`));
  await rejects(
    as(alice, () => q(`insert into public.daily_answers (question_id, owner_id, answer) values ($1, $2, 'x')`, [carolQ.id, alice])),
    /row-level security/,
    'answer another couple’s question',
  );
  await rejects(
    as(alice, () => q(`insert into public.daily_answers (question_id, owner_id, answer) values ($1, $2, '')`, [carolQ.id, alice])),
    /row-level security|daily_answers_answer_len/,
    'empty answer',
  );
});

console.log('\nTogether');

await test('countdowns: shared, added as yourself, editable by either of us', async () => {
  await rejects(
    as(alice, () => q(`insert into public.countdowns (couple_id, created_by, title, on_date) values ($1, $2, 'x', current_date)`, [couple.id, bob])),
    /row-level security/,
    'spoof creator',
  );
  await as(alice, () => q(`insert into public.countdowns (couple_id, created_by, title, emoji, on_date, yearly) values ($1, $2, 'Bob''s birthday', '🎂', '1995-03-14', true)`, [couple.id, alice]));
  assert.equal((await as(bob, () => q(`update public.countdowns set title = 'My birthday' returning 1`))).length, 1);
  await rejects(as(bob, () => q(`update public.countdowns set created_by = $1`, [bob])), /permission denied/, 'reassign creator');
  assert.equal((await as(carol, () => q(`select * from public.countdowns`))).length, 0, 'outsider');
});

await test('lists: shared; ticked off by one of us, never by an outsider', async () => {
  await rejects(
    as(alice, () => q(`insert into public.list_items (couple_id, list, text, added_by) values ($1, 'shopping', 'x', $2)`, [couple.id, alice])),
    /list_items_list_check/,
    'unknown list',
  );
  await rejects(
    as(alice, () => q(`insert into public.list_items (couple_id, list, text, added_by, done_at, done_by) values ($1, 'groceries', 'x', $2, now(), $2)`, [couple.id, alice])),
    /row-level security/,
    'pre-ticked',
  );
  const item = (await as(alice, () => one(`insert into public.list_items (couple_id, list, text, added_by) values ($1, 'groceries', 'Oat milk', $2) returning id`, [couple.id, alice]))).id;
  assert.equal((await as(bob, () => q(`update public.list_items set done_at = now(), done_by = $1 where id = $2 returning 1`, [bob, item]))).length, 1);
  await rejects(as(bob, () => q(`update public.list_items set done_by = $1 where id = $2`, [carol, item])), /row-level security/, 'outsider ticks');
  await rejects(as(bob, () => q(`update public.list_items set done_at = null where id = $1`, [item])), /list_items_done_shape/, 'half-ticked');
  assert.equal((await as(carol, () => q(`select * from public.list_items`))).length, 0, 'outsider');
});

await test('taps: sent as yourself, at most one every 10 seconds', async () => {
  await rejects(as(alice, () => q(`insert into public.taps (couple_id, from_id) values ($1, $2)`, [couple.id, bob])), /row-level security/, 'spoof sender');
  await as(alice, () => q(`insert into public.taps (couple_id, from_id) values ($1, $2)`, [couple.id, alice]));
  await rejects(as(alice, () => q(`insert into public.taps (couple_id, from_id) values ($1, $2)`, [couple.id, alice])), /too_soon/, 'flood');
  await as(bob, () => q(`insert into public.taps (couple_id, from_id) values ($1, $2)`, [couple.id, bob]));
  assert.equal((await as(alice, () => q(`select * from public.taps`))).length, 2);
  assert.equal((await as(carol, () => q(`select * from public.taps`))).length, 0, 'outsider');
});

await test('location: partner sees it only while I share; stopping clears it', async () => {
  await as(alice, () => q(
    `insert into public.location_shares (owner_id, couple_id, lat, lng, accuracy_m, sharing_until) values ($1, $2, 38.72, -9.14, 12, now() + interval '1 hour')`,
    [alice, couple.id],
  ));
  const seen = await as(bob, () => q(`select lat, lng from public.location_shares`));
  assert.deepEqual(seen, [{ lat: 38.72, lng: -9.14 }]);
  assert.equal((await as(carol, () => q(`select * from public.location_shares`))).length, 0, 'outsider');
  await rejects(as(bob, () => q(`insert into public.location_shares (owner_id, couple_id, sharing_until) values ($1, $2, now())`, [alice, couple.id])), /row-level security/, 'write theirs');
  assert.equal((await as(bob, () => q(`update public.location_shares set lat = 0 returning 1`))).length, 0, 'edit theirs');
  await rejects(
    as(alice, () => q(`update public.location_shares set sharing_until = now() + interval '30 days'`)),
    /location_shares_max_window/,
    'open-ended sharing',
  );
  await as(alice, () => q(`update public.location_shares set sharing_until = null`));
  assert.equal((await as(bob, () => q(`select * from public.location_shares`))).length, 0, 'hidden once stopped');
  const mine = await as(alice, () => one(`select lat, lng from public.location_shares`));
  assert.deepEqual(mine, { lat: null, lng: null }, 'coordinates scrubbed');
});

await test('arrival: either of us asks; only the traveller arrives; one open check each', async () => {
  await rejects(
    as(alice, () => q(`insert into public.arrival_checks (couple_id, requested_by, traveller_id) values ($1, $2, $3)`, [couple.id, alice, carol])),
    /row-level security/,
    'outsider traveller',
  );
  const check = (await as(alice, () => one(`insert into public.arrival_checks (couple_id, requested_by, traveller_id) values ($1, $2, $3) returning id`, [couple.id, alice, bob]))).id;
  await rejects(
    as(alice, () => q(`insert into public.arrival_checks (couple_id, requested_by, traveller_id) values ($1, $2, $3)`, [couple.id, alice, bob])),
    /duplicate key/,
    'second open check',
  );
  await rejects(as(alice, () => q(`select public.mark_arrived($1)`, [check])), /only the traveller/, 'requester arrives');
  await rejects(as(carol, () => q(`select public.mark_arrived($1)`, [check])), /check_not_found/, 'outsider');
  await rejects(as(bob, () => q(`update public.arrival_checks set arrived_at = now()`)), /permission denied/, 'direct update');
  assert.ok((await as(bob, () => one(`select arrived_at from public.mark_arrived($1)`, [check]))).arrived_at);
  const offer = (await as(bob, () => one(`insert into public.arrival_checks (couple_id, requested_by, traveller_id, label) values ($1, $2, $2, 'the office') returning id`, [couple.id, bob]))).id;
  assert.ok((await as(alice, () => one(`select cancelled_at from public.cancel_arrival($1)`, [offer]))).cancelled_at, 'either can cancel');
});

console.log('\nChat');

await test('chat: replies stay in our thread; media lives in our folder', async () => {
  const reply = (await as(bob, () => one(
    `insert into public.messages (couple_id, sender_id, body, reply_to) values ($1, $2, 'replying', $3) returning id`,
    [couple.id, bob, msgId],
  ))).id;
  assert.ok(reply);
  const carolMsg = (await as(carol, () => one(`insert into public.messages (couple_id, sender_id, body) values ($1, $2, 'theirs') returning id`, [otherCouple.id, carol]))).id;
  await rejects(
    as(alice, () => q(`insert into public.messages (couple_id, sender_id, body, reply_to) values ($1, $2, 'x', $3)`, [couple.id, alice, carolMsg])),
    /row-level security/,
    'reply across couples',
  );
  await as(alice, () => q(
    `insert into public.messages (couple_id, sender_id, media_path, media_kind, media_meta) values ($1::uuid, $2, $1::text || '/v.m4a', 'audio', '{"duration_ms": 4200}')`,
    [couple.id, alice],
  ));
  await rejects(
    as(alice, () => q(`insert into public.messages (couple_id, sender_id, media_path, media_kind) values ($1, $2, $3, 'image')`, [couple.id, alice, `${otherCouple.id}/x.jpg`])),
    /messages_media_in_couple_folder/,
    'foreign folder',
  );
  await rejects(
    as(alice, () => q(`insert into public.messages (couple_id, sender_id, media_path) values ($1::uuid, $2, $1::text || '/x.jpg')`, [couple.id, alice])),
    /messages_media_shape/,
    'media without kind',
  );
  await rejects(as(alice, () => q(`insert into public.messages (couple_id, sender_id) values ($1, $2)`, [couple.id, alice])), /messages_shape/, 'empty');
  await rejects(
    as(alice, () => q(`insert into public.messages (couple_id, sender_id, body, reactions) values ($1, $2, 'x', '{"a":"❤️"}')`, [couple.id, alice])),
    /row-level security/,
    'pre-reacted',
  );
});

await test('chat: one reaction each, pins by either of us, nothing for outsiders', async () => {
  await as(alice, () => q(`select public.react_to_message($1, '❤️')`, [msgId]));
  await as(bob, () => q(`select public.react_to_message($1, '😂')`, [msgId]));
  let row = await as(alice, () => one(`select (public.react_to_message($1, '🔥')).reactions`, [msgId]));
  assert.deepEqual(row.reactions, { [alice]: '🔥', [bob]: '😂' }, 'replaced, not added');
  row = await as(bob, () => one(`select (public.react_to_message($1, null)).reactions`, [msgId]));
  assert.deepEqual(row.reactions, { [alice]: '🔥' }, 'removed');
  await rejects(as(carol, () => q(`select public.react_to_message($1, '👀')`, [msgId])), /message_not_found/, 'outsider reacts');
  await rejects(as(alice, () => q(`update public.messages set reactions = '{}'`)), /permission denied/, 'direct edit');

  const pinned = await as(bob, () => one(`select pinned_at, pinned_by from public.pin_message($1, true)`, [msgId]));
  assert.ok(pinned.pinned_at);
  assert.equal(pinned.pinned_by, bob);
  assert.equal((await as(alice, () => one(`select pinned_at from public.pin_message($1, false)`, [msgId]))).pinned_at, null, 'unpinned');
  await rejects(as(carol, () => q(`select public.pin_message($1, true)`, [msgId])), /message_not_found/, 'outsider pins');
});

console.log('\nLeaving');

await test('unpair: removes everything we shared, keeps private data, frees both of us', async () => {
  await rejects(as(null, () => q(`select public.unpair()`)), /not_paired/, 'signed out');
  await as(alice, () => q(`select public.unpair()`));
  assert.equal((await q(`select count(*)::int as n from public.couples where id = $1`, [couple.id]))[0].n, 0, 'couple gone');
  for (const table of ['messages', 'calls', 'calendar_events', 'memories', 'goals', 'future_letters', 'daily_questions', 'inside_jokes']) {
    const n = (await q(`select count(*)::int as n from public.${table} where couple_id = $1`, [couple.id]))[0].n;
    assert.equal(n, 0, `${table} cleared`);
  }
  assert.ok((await as(alice, () => q(`select * from public.mood_checkins`))).length > 0, 'private check-ins kept');
  assert.deepEqual((await as(bob, () => q(`select id from public.profiles`))).map((r) => r.id), [bob], 'no longer see each other');
  assert.equal((await as(carol, () => q(`select * from public.couples`))).length, 1, 'other couples untouched');
  await rejects(as(bob, () => q(`select public.unpair()`)), /not_paired/, 'already unpaired');
  assert.match((await as(alice, () => one(`select code from public.create_invite()`))).code, /-/, 'can pair again');
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
await db.close();

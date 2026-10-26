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
    raw_user_meta_data jsonb default '{}'::jsonb,
    created_at timestamptz default now(),
    last_sign_in_at timestamptz
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

async function seedFounders() {
  const { rows } = await db.query(`insert into auth.users (email, raw_user_meta_data) values
    ('jonalsuthar@gmail.com', '{"display_name":"Jonal"}'), ('parulsutradhar11@gmail.com', '{"display_name":"Parul"}')
    returning id`);
  await db.query(`insert into public.couples (user_a_id, user_b_id) values ($1, $2)`, [rows[0].id, rows[1].id]);
  await db.query(`insert into public.messages (couple_id, sender_id, body) select id, user_a_id, 'before admin' from public.couples`);
}

const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
for (const file of migrations) {
  let sql = readFileSync(join(root, 'supabase/migrations', file), 'utf8');
  // PGlite ships gen_random_uuid() in core; pgcrypto isn't needed here.
  sql = sql.replace(/create extension if not exists pgcrypto[^;]*;/i, '');
  // The founding couple already exists when the admin migration arrives.
  if (file === '20261028000000_admin.sql') await seedFounders();
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

// Sign-ups now wait for approval; the fixtures are approved with everything.
await q(`update public.user_access set status = 'approved', features = (select array_agg(key) from public.features)
         where user_id = any ($1)`, [[alice, bob, carol, dave]]);

console.log('\nSecurity model');

let couple;

await test('profiles are created on signup (display name falls back to email)', async () => {
  const rows = await q(`select display_name from public.profiles where id = any ($1)`, [[alice, bob, carol, dave]]);
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

await test('calls: listen and watch together ring and log like any call', async () => {
  for (const media of ['listen', 'watch']) {
    const id = (await as(alice, () => one(`insert into public.calls (couple_id, caller_id, callee_id, media) values ($1, $2, $3, $4) returning id`, [couple.id, alice, bob, media]))).id;
    assert.equal((await as(bob, () => one(`select (public.set_call_status($1, 'active')).status`, [id]))).status, 'active');
    assert.equal((await as(bob, () => one(`select (public.set_call_status($1, 'ended')).status`, [id]))).status, 'ended');
    assert.equal((await as(bob, () => one(`select c.media from public.calls c where c.id = $1`, [id]))).media, media);
    assert.equal((await q(`select count(*)::int as n from public.messages where call_id = $1`, [id]))[0].n, 1);
  }
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
  // GIFs and stickers are GIPHY links: accepted from GIPHY's media hosts only.
  await as(alice, () =>
    q(`insert into public.messages (couple_id, sender_id, media_kind, media_meta) values ($1, $2, 'gif', '{"url":"https://media2.giphy.com/media/abc/giphy.gif"}')`, [couple.id, alice]),
  );
  await rejects(
    as(alice, () =>
      q(`insert into public.messages (couple_id, sender_id, media_kind, media_meta) values ($1, $2, 'sticker', '{"url":"https://tracker.example/x.gif"}')`, [couple.id, alice]),
    ),
    /messages_media_shape/,
    'sticker from elsewhere',
  );
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

console.log('\nSnaps');

await test('snaps: shared with my partner for 24 hours, posted as yourself, in our folder', async () => {
  const post = (who, path) =>
    as(who, () => one(`insert into public.snaps (couple_id, author_id, photo_path, caption) values ($1::uuid, $2, $1::text || $3, 'hi') returning *`, [couple.id, who, path]));
  const snap = await post(alice, '/s1.jpg');
  assert.ok(new Date(snap.expires_at) - new Date(snap.created_at) <= 24 * 3600_000 + 1000, '24h window');
  assert.equal((await as(bob, () => q(`select id from public.snaps`))).length, 1, 'partner sees it');
  assert.equal((await as(carol, () => q(`select id from public.snaps`))).length, 0, 'outsider');
  await rejects(
    as(bob, () => q(`insert into public.snaps (couple_id, author_id, photo_path) values ($1::uuid, $2, $1::text || '/x.jpg')`, [couple.id, alice])),
    /row-level security/,
    'spoof author',
  );
  await rejects(
    as(alice, () => q(`insert into public.snaps (couple_id, author_id, photo_path) values ($1, $2, $3)`, [couple.id, alice, `${otherCouple.id}/x.jpg`])),
    /snaps_photo_in_couple_folder/,
    'foreign folder',
  );
  await rejects(
    as(alice, () => q(`insert into public.snaps (couple_id, author_id, photo_path, seen_at) values ($1::uuid, $2, $1::text || '/x.jpg', now())`, [couple.id, alice])),
    /row-level security/,
    'pre-seen',
  );
  await rejects(as(alice, () => q(`update public.snaps set caption = 'edited'`)), /permission denied/, 'direct edit');
  assert.equal((await as(bob, () => q(`delete from public.snaps returning id`))).length, 0, "partner can't delete mine");
  await rejects(
    q(`update public.snaps set expires_at = created_at + interval '30 days' where id = $1`, [snap.id]),
    /snaps_max_window/,
    'longer than a day',
  );
});

await test('snaps: only my partner marks seen and reacts; replies and keeps stay in our couple', async () => {
  const snap = (await as(alice, () => one(`select id from public.snaps`))).id;
  await rejects(as(alice, () => q(`select public.mark_snap_seen($1)`, [snap])), /only your partner/, 'own seen');
  await rejects(as(alice, () => q(`select public.react_to_snap($1, '❤️')`, [snap])), /only your partner/, 'own reaction');
  await rejects(as(carol, () => q(`select public.mark_snap_seen($1)`, [snap])), /snap_not_found/, 'outsider seen');
  const seen = (await as(bob, () => one(`select seen_at from public.mark_snap_seen($1)`, [snap]))).seen_at;
  assert.ok(seen);
  assert.equal((await as(bob, () => one(`select seen_at from public.mark_snap_seen($1)`, [snap]))).seen_at.getTime(), seen.getTime(), 'first time counts');
  assert.equal((await as(bob, () => one(`select reaction from public.react_to_snap($1, '😍')`, [snap]))).reaction, '😍');
  assert.equal((await as(bob, () => one(`select reaction from public.react_to_snap($1, null)`, [snap]))).reaction, null, 'taken back');

  await as(bob, () => q(`insert into public.messages (couple_id, sender_id, body, snap_id) values ($1, $2, 'love it', $3)`, [couple.id, bob, snap]));
  const theirs = (await as(carol, () => one(`insert into public.snaps (couple_id, author_id, photo_path) values ($1::uuid, $2, $1::text || '/c.jpg') returning id`, [otherCouple.id, carol]))).id;
  await rejects(
    as(alice, () => q(`insert into public.messages (couple_id, sender_id, body, snap_id) values ($1, $2, 'x', $3)`, [couple.id, alice, theirs])),
    /row-level security/,
    'reply to another couple',
  );
  const keep = `insert into public.memories (couple_id, created_by, title, happened_on, from_snap) values ($1, $2, 'kept', current_date, $3)`;
  await as(bob, () => q(keep, [couple.id, bob, snap]));
  await rejects(as(alice, () => q(keep, [couple.id, alice, snap])), /duplicate key/, 'kept twice');
  await rejects(as(alice, () => q(keep, [couple.id, alice, theirs])), /row-level security/, 'keep theirs');
});

await test('snaps: gone for both of us once expired; at most 10 live each', async () => {
  const snap = (await as(alice, () => one(`select id from public.snaps`))).id;
  await q(`update public.snaps set created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' where id = $1`, [snap]);
  assert.equal((await as(alice, () => q(`select id from public.snaps`))).length, 0, 'author');
  assert.equal((await as(bob, () => q(`select id from public.snaps`))).length, 0, 'partner');
  await rejects(as(bob, () => q(`select public.react_to_snap($1, '❤️')`, [snap])), /snap_not_found/, 'react to expired');
  for (let i = 0; i < 10; i++) {
    await as(bob, () => q(`insert into public.snaps (couple_id, author_id, photo_path) values ($1::uuid, $2, $1::text || '/b' || $3 || '.jpg')`, [couple.id, bob, String(i)]));
  }
  await rejects(
    as(bob, () => q(`insert into public.snaps (couple_id, author_id, photo_path) values ($1::uuid, $2, $1::text || '/b10.jpg')`, [couple.id, bob])),
    /too_many_snaps/,
    'eleventh',
  );
});

console.log('\nPlant');

await test('plant: a day counts for each of us when we do something; outsiders see nothing; only triggers write', async () => {
  // Everything above happened "today": messages, taps, snaps, answers and calls from both of us.
  const rows = await as(bob, () => q(`select a_at, b_at from public.plant_days`));
  assert.equal(rows.length, 1);
  assert.ok(rows[0].a_at && rows[0].b_at, 'both watered');
  assert.equal((await as(carol, () => q(`select * from public.plant_days where couple_id = $1`, [couple.id]))).length, 0, 'outsider');
  await rejects(as(alice, () => q(`insert into public.plant_days (couple_id, day) values ($1, current_date + 1)`, [couple.id])), /permission denied/, 'insert');
  await rejects(as(alice, () => q(`update public.plant_days set b_at = now()`)), /permission denied/, 'update');
  await rejects(as(alice, () => q(`select public.plant_water($1, $2, now())`, [couple.id, alice])), /permission denied/, 'call plant_water');
});

await test('plant: a call waters both of us once it is answered; the call log itself does not', async () => {
  await q(`delete from public.plant_days`);
  const call = (await as(alice, () => one(`insert into public.calls (couple_id, caller_id, callee_id) values ($1, $2, $3) returning id`, [couple.id, alice, bob]))).id;
  assert.equal((await q(`select * from public.plant_days`)).length, 0, 'ringing waters nothing');
  await as(bob, () => q(`select public.set_call_status($1, 'active')`, [call]));
  const row = await one(`select a_at, b_at from public.plant_days where couple_id = $1`, [couple.id]);
  assert.ok(row.a_at && row.b_at, 'both, once answered');
  await q(`delete from public.plant_days`);
  await as(alice, () => q(`select public.set_call_status($1, 'ended')`, [call]));
  assert.equal((await q(`select * from public.plant_days`)).length, 0, 'call log entry waters nothing');
});

await test("plant: my timezone must be real, and the couple's day follows partner A's clock", async () => {
  await rejects(as(alice, () => q(`update public.profiles set timezone = 'Mars/Olympus' where id = $1`, [alice])), /profiles_timezone_valid/, 'made-up zone');
  await as(alice, () => q(`update public.profiles set timezone = 'Pacific/Kiritimati' where id = $1`, [alice]));
  await as(bob, () => q(`insert into public.messages (couple_id, sender_id, body) values ($1, $2, 'still waters')`, [couple.id, bob]));
  const day = (await one(`select day::text from public.plant_days where couple_id = $1 and b_at is not null`, [couple.id])).day;
  assert.equal(day, (await one(`select (now() at time zone 'Pacific/Kiritimati')::date::text as d`)).d, "A's clock");
});

console.log('\nSpark Rank');

const sparkDay = async () => (await one(`select public.couple_day($1, now())::text as d`, [couple.id])).d;
const sparksOf = async (who, kind) =>
  (await one(`select coalesce(sum(sparks), 0)::int as n from public.spark_events where couple_id = $1 and user_id = $2 and kind = $3`, [couple.id, who, kind])).n;
const resetSparks = () => db.exec(`delete from public.spark_events; delete from public.spark_seasons;`);
const say = (who, body = 'hi') => as(who, () => q(`insert into public.messages (couple_id, sender_id, body) values ($1, $2, $3)`, [couple.id, who, body]));

await test('spark: I see only my own Sparks, we both see the season; only triggers write', async () => {
  // Everything above earned Sparks for both of us.
  const mine = await as(alice, () => q(`select user_id from public.spark_events`));
  assert.ok(mine.length > 0, 'some');
  assert.ok(mine.every((r) => r.user_id === alice), 'only mine');
  const seasons = await as(bob, () => q(`select sparks from public.spark_seasons where couple_id = $1`, [couple.id]));
  assert.equal(seasons.length, 1);
  assert.ok(seasons[0].sparks > 0, 'a season total');
  assert.equal((await as(carol, () => q(`select * from public.spark_seasons where couple_id = $1`, [couple.id]))).length, 0, 'outsider');
  await rejects(as(alice, () => q(`update public.spark_seasons set sparks = 99999`)), /permission denied/, 'update season');
  await rejects(
    as(alice, () => q(`insert into public.spark_events (couple_id, user_id, day, kind, sparks, source) values ($1, $2, current_date, 'message', 500, 'x')`, [couple.id, alice])),
    /permission denied/,
    'insert event',
  );
  await rejects(as(alice, () => q(`select public.spark_award($1, $2, 'message', now(), 'x')`, [couple.id, alice])), /permission denied/, 'call spark_award');
  await rejects(as(alice, () => q(`select public.spark_claim_rank_up($1)`, [couple.id])), /permission denied/, 'claim rank-up');
});

await test('spark: messages pay up to a daily cap; the first one after quiet hours is a first move', async () => {
  await resetSparks();
  for (let i = 0; i < 12; i++) await say(alice, `m${i}`);
  assert.equal(await sparksOf(alice, 'message'), 20, 'capped at 20');
  assert.equal(await sparksOf(alice, 'first_move'), 15, 'one first move');
  // Bob answers within the hour: a reply, not a first move.
  await say(bob);
  assert.equal(await sparksOf(bob, 'first_move'), 0, 'reply');
  // Four quiet hours later, whoever reaches out first gets it.
  await q(`update public.spark_events set created_at = created_at - interval '5 hours'`);
  await say(bob, 'miss you');
  assert.equal(await sparksOf(bob, 'first_move'), 15, 'after quiet hours');
  await say(alice, 'me too');
  assert.equal(await sparksOf(alice, 'first_move'), 15, 'answering is not');
});

await test('spark: the day we both show up pays a together bonus once, more on a streak', async () => {
  const today = await sparkDay();
  const bonus = await q(`select user_id, sparks from public.spark_events where kind = 'together'`);
  assert.equal(bonus.length, 1, 'once');
  assert.equal(bonus[0].user_id, null, 'ours, not either of ours');
  assert.equal((await as(alice, () => q(`select * from public.spark_events where kind = 'together'`))).length, 0, 'not in my effort');
  await resetSparks();
  await q(`insert into public.plant_days (couple_id, day, a_at, b_at) values ($1, $2::date - 1, now(), now()), ($1, $2::date - 2, now(), now()) on conflict do nothing`, [couple.id, today]);
  await say(alice);
  assert.equal((await one(`select sparks from public.spark_events where kind = 'together'`)).sparks, 25, 'three days running');
  const season = await one(`select sparks, today_sparks from public.spark_seasons where couple_id = $1`, [couple.id]);
  assert.equal(season.sparks, season.today_sparks, 'today counted');
  assert.equal(season.sparks, (await one(`select sum(sparks)::int as n from public.spark_events`)).n, 'season adds up');
});

await test('spark: a status, a call we both pick up and the time we talk all count', async () => {
  await resetSparks();
  await as(alice, () => q(`update public.profiles set status_emoji = '☕', status_text = 'coffee', status_at = now() where id = $1`, [alice]));
  assert.equal(await sparksOf(alice, 'status'), 3, 'status');
  await as(alice, () => q(`update public.profiles set status_emoji = null, status_text = null, status_at = now() where id = $1`, [alice]));
  assert.equal(await sparksOf(alice, 'status'), 3, 'clearing it earns nothing');

  const call = (await as(alice, () => one(`insert into public.calls (couple_id, caller_id, callee_id) values ($1, $2, $3) returning id`, [couple.id, alice, bob]))).id;
  assert.equal(await sparksOf(alice, 'call_start'), 0, 'ringing earns nothing');
  await as(bob, () => q(`select public.set_call_status($1, 'active')`, [call]));
  assert.equal(await sparksOf(alice, 'call_start'), 10, 'the caller reached out');
  assert.equal(await sparksOf(alice, 'call_pickup'), 5, 'caller picked up');
  assert.equal(await sparksOf(bob, 'call_pickup'), 5, 'callee picked up');
  await q(`update public.calls set answered_at = now() - interval '10 minutes' where id = $1`, [call]);
  assert.equal(await sparksOf(alice, 'call_start'), 10, 'once per call');
  await as(alice, () => q(`select public.set_call_status($1, 'ended')`, [call]));
  assert.equal(await sparksOf(alice, 'call_minutes'), 5, 'ten minutes, one per two');
  assert.equal(await sparksOf(bob, 'call_minutes'), 5, 'for both of us');
});

await test('spark: a new month opens at 40% of the last; a rank-up is announced once', async () => {
  await q(`update public.spark_seasons set season = (season - interval '1 month')::date, sparks = 1000`);
  await say(bob, 'new month');
  const s = await one(
    `select carry_in, sparks, notified_rank from public.spark_seasons where couple_id = $1 and season = date_trunc('month', public.couple_day($1, now()))::date`,
    [couple.id],
  );
  assert.equal(s.carry_in, 400, 'carry-in');
  assert.ok(s.sparks > 400, 'plus what we just earned');
  assert.equal(s.notified_rank, (await one(`select public.spark_division(400) as n`)).n, 'starting rank is not news');
  assert.equal((await one(`select public.spark_claim_rank_up($1) as r`, [couple.id])).r, null, 'nothing new yet');

  await q(`update public.spark_seasons set sparks = 500 where couple_id = $1 and carry_in = 400`, [couple.id]);
  assert.equal((await one(`select public.spark_claim_rank_up($1) as r`, [couple.id])).r, 'Spark II');
  assert.equal((await one(`select public.spark_claim_rank_up($1) as r`, [couple.id])).r, null, 'once');
});

await test('spark: the ladder matches the app', async () => {
  const src = readFileSync(join(root, 'packages/shared/src/api/spark.ts'), 'utf8');
  const steps = JSON.parse(src.match(/SPARK_STEPS = (\[[^\]]*\])/)[1]);
  const expected = [];
  let at = 0;
  for (const step of steps) {
    for (let i = 0; i < 3; i++) {
      expected.push(at);
      at += step;
    }
  }
  expected.push(at);
  assert.deepEqual((await q(`select at from public.spark_ladder() order by idx`)).map((r) => r.at), expected);
  assert.equal((await one(`select name from public.spark_ladder() where idx = 21`)).name, 'Eternal');
});

console.log('\nDraw together');

await test('draw: feature granted to the full plan and to people already on it', async () => {
  const plan = await one(`select features from public.plans where id = 'full'`);
  assert.ok(plan.features.includes('draw'));
  const founders = await q(`select features from public.user_access where plan_id = 'full'`);
  assert.ok(founders.length > 0 && founders.every((r) => r.features.includes('draw')));
  assert.equal((await one(`select module from public.features where key = 'draw'`)).module, 'connect');
});

const drawRow = (kind, by, extra = {}) => {
  const cols = {
    couple_id: couple.id,
    created_by: by,
    kind,
    strokes_path: `${couple.id}/${kind}-${Math.random()}.json`,
    png_path: `${couple.id}/${kind}-${Math.random()}.png`,
    ...extra,
  };
  const keys = Object.keys(cols);
  return [`insert into public.drawings (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning *`, Object.values(cols)];
};

await test('drawings: couple-only, inserted as yourself, files in our folder, creator deletes', async () => {
  const d = await as(alice, () => one(...drawRow('canvas', alice, { artists: [alice, bob] })));
  assert.equal((await as(bob, () => q(`select id from public.drawings`))).length, 1);
  assert.equal((await as(carol, () => q(`select id from public.drawings`))).length, 0, 'outsider');
  await rejects(as(bob, () => q(...drawRow('canvas', alice))), /row-level security/, 'spoof creator');
  await rejects(as(alice, () => q(...drawRow('canvas', alice, { png_path: `${otherCouple.id}/x.png` }))), /files_in_couple_folder/, 'foreign folder');
  await as(bob, () => q(`delete from public.drawings where id = $1`, [d.id]));
  assert.equal((await as(alice, () => q(`select id from public.drawings where id = $1`, [d.id]))).length, 1, 'partner cannot delete');
  await as(bob, () => q(`update public.drawings set title = 'mine now' where id = $1`, [d.id]));
  assert.equal((await one(`select title from public.drawings where id = $1`, [d.id])).title, null, 'partner cannot rename');
  await as(alice, () => q(`update public.drawings set title = 'Under the sun' where id = $1`, [d.id]));
  await rejects(as(alice, () => q(`update public.drawings set seen_at = now() where id = $1`, [d.id])), /permission denied/, 'seen via update');
  await as(alice, () => q(`delete from public.drawings where id = $1`, [d.id]));
  assert.equal((await q(`select id from public.drawings where id = $1`, [d.id])).length, 0);
});

await test('doodles: for my partner only; only they mark it seen', async () => {
  await rejects(as(alice, () => q(...drawRow('doodle', alice, { for_user: carol }))), /row-level security/, 'outsider recipient');
  await rejects(as(alice, () => q(...drawRow('doodle', alice))), /doodle_has_recipient/, 'no recipient');
  const d = await as(alice, () => one(...drawRow('doodle', alice, { for_user: bob, note: 'chai date tonight?' })));
  await rejects(as(alice, () => q(`select public.mark_doodle_seen($1)`, [d.id])), /only the person/, 'sender');
  await rejects(as(carol, () => q(`select public.mark_doodle_seen($1)`, [d.id])), /drawing_not_found/, 'outsider');
  const seen = await as(bob, () => one(`select (public.mark_doodle_seen($1)).seen_at`, [d.id]));
  assert.ok(seen.seen_at);
});

await test('daily doodle: hidden until I draw mine that day', async () => {
  await as(alice, () => q(...drawRow('daily', alice, { day: '2026-10-26', prompt: 'Our first trip' })));
  let status = await as(bob, () => one(`select * from public.daily_doodle_status('2026-10-26')`));
  assert.deepEqual([status.mine, status.partner], [false, true]);
  assert.equal((await as(bob, () => q(`select id from public.drawings where kind = 'daily'`))).length, 0, 'hidden');
  await as(bob, () => q(...drawRow('daily', bob, { day: '2026-10-26', prompt: 'Our first trip' })));
  assert.equal((await as(bob, () => q(`select id from public.drawings where kind = 'daily'`))).length, 2, 'both now');
  await rejects(as(bob, () => q(...drawRow('daily', bob, { day: '2026-10-26' }))), /duplicate key/, 'one a day');
  status = await as(alice, () => one(`select * from public.daily_doodle_status('2026-10-26')`));
  assert.deepEqual([status.mine, status.partner], [true, true]);
});

await test('words and games: couple-scoped; scores only through functions', async () => {
  await as(alice, () => q(`insert into public.draw_words (couple_id, word, added_by) values ($1, 'Our Goa trip', $2)`, [couple.id, alice]));
  await rejects(as(bob, () => q(`insert into public.draw_words (couple_id, word, added_by) values ($1, ' our goa trip ', $2)`, [couple.id, bob])), /duplicate key/, 'dupe');
  assert.equal((await as(bob, () => q(`select word from public.draw_words`))).length, 1);
  assert.equal((await as(carol, () => q(`select word from public.draw_words`))).length, 0);
  const g = await as(alice, () => one(`insert into public.draw_games (couple_id, started_by, mode) values ($1, $2, 'live') returning *`, [couple.id, alice]));
  await rejects(as(alice, () => q(`insert into public.draw_games (couple_id, started_by, score) values ($1, $2, 900)`, [couple.id, alice])), /row-level security/, 'preset score');
  await rejects(as(alice, () => q(`update public.draw_games set score = 9999 where id = $1`, [g.id])), /permission denied/, 'direct score');
  await rejects(as(bob, () => q(`select public.finish_draw_game($1, 6, 5000, 6, 'x', 1)`, [g.id])), /bad_result/, 'impossible score');
  await rejects(as(carol, () => q(`select public.finish_draw_game($1, 6, 400, 5, 'x', 1)`, [g.id])), /game_not_found/, 'outsider');
  const done = await as(bob, () => one(`select * from public.finish_draw_game($1, 6, 412, 5, 'Haathi', 3000)`, [g.id]));
  assert.equal(done.score, 412);
  const again = await as(alice, () => one(`select * from public.finish_draw_game($1, 6, 10, 1, 'x', 1)`, [g.id]));
  assert.equal(again.score, 412, 'written once');
});

await test('turns: the word stays hidden from the guesser until they answer', async () => {
  const g = await as(alice, () => one(`insert into public.draw_games (couple_id, started_by, mode, rounds) values ($1, $2, 'turns', 2) returning *`, [couple.id, alice]));
  const d = await as(alice, () => one(...drawRow('guess', alice, { game_id: g.id, round: 0, meta: JSON.stringify({ level: 'medium' }) })));
  await as(alice, () => q(`insert into public.draw_secrets (drawing_id, couple_id, word) values ($1, $2, 'Golgappa')`, [d.id, couple.id]));
  await rejects(as(bob, () => q(`insert into public.draw_secrets (drawing_id, couple_id, word) values ($1, $2, 'x')`, [d.id, couple.id])), /row-level security|duplicate key/, 'guesser writes word');
  assert.equal((await as(bob, () => q(`select word from public.draw_secrets`))).length, 0, 'hidden before answering');
  assert.equal((await as(alice, () => q(`select word from public.draw_secrets`))).length, 1, 'drawer sees it');
  await rejects(as(alice, () => q(`select public.answer_guess($1, true, 1000, 100)`, [d.id])), /drawer cannot answer/, 'drawer');
  await rejects(as(bob, () => q(`select public.answer_guess($1, true, 1000, 999)`, [d.id])), /bad_answer/, 'too many points');
  const game = await as(bob, () => one(`select * from public.answer_guess($1, true, 12000, 120)`, [d.id]));
  assert.deepEqual([game.played, game.score, game.solved, game.best_word], [1, 120, 1, 'Golgappa']);
  assert.equal((await as(bob, () => one(`select word from public.draw_secrets`))).word, 'Golgappa', 'open after answering');
  await rejects(as(bob, () => q(`select public.answer_guess($1, true, 1000, 100)`, [d.id])), /already_answered/, 'twice');
});

console.log('\nLeaving');

await test('unpair: removes everything we shared, keeps private data, frees both of us', async () => {
  await rejects(as(null, () => q(`select public.unpair()`)), /not_paired/, 'signed out');
  await as(alice, () => q(`select public.unpair()`));
  assert.equal((await q(`select count(*)::int as n from public.couples where id = $1`, [couple.id]))[0].n, 0, 'couple gone');
  for (const table of ['messages', 'calls', 'calendar_events', 'memories', 'goals', 'future_letters', 'daily_questions', 'inside_jokes', 'snaps', 'plant_days', 'spark_events', 'spark_seasons']) {
    const n = (await q(`select count(*)::int as n from public.${table} where couple_id = $1`, [couple.id]))[0].n;
    assert.equal(n, 0, `${table} cleared`);
  }
  assert.ok((await as(alice, () => q(`select * from public.mood_checkins`))).length > 0, 'private check-ins kept');
  assert.deepEqual((await as(bob, () => q(`select id from public.profiles`))).map((r) => r.id), [bob], 'no longer see each other');
  assert.equal((await as(carol, () => q(`select * from public.couples`))).length, 1, 'other couples untouched');
  await rejects(as(bob, () => q(`select public.unpair()`)), /not_paired/, 'already unpaired');
  assert.match((await as(alice, () => one(`select code from public.create_invite()`))).code, /-/, 'can pair again');
});

console.log('\nAdmin');

const [jonal, parul] = (
  await q(`select id from auth.users where email in ('jonalsuthar@gmail.com', 'parulsutradhar11@gmail.com') order by email`)
).map((r) => r.id);
const ALL = (await q(`select key from public.features order by sort`)).map((r) => r.key);
const [erin, frank] = (
  await q(`insert into auth.users (email, raw_user_meta_data) values
    ('erin.admin@example.com', '{"display_name":"Erin"}'), ('frank@example.com', '{"display_name":"Frank"}') returning id`)
).map((r) => r.id);
let newCouple;

await test('founders: approved, protected, admin, everything, and their messages still there', async () => {
  const rows = await q(`select user_id, status, protected, is_admin from public.user_access where user_id = any ($1) order by user_id = $2 desc`, [[jonal, parul], jonal]);
  assert.deepEqual(rows.map((r) => [r.status, r.protected, r.is_admin]), [['approved', true, true], ['approved', true, false]]);
  for (const who of [jonal, parul]) {
    const access = (await as(who, () => one(`select public.my_access() as a`))).a;
    assert.equal(access.status, 'approved');
    assert.deepEqual(access.features, ALL);
    assert.equal((await as(who, () => q(`select body from public.messages where body = 'before admin'`))).length, 1);
  }
});

await test('sign-up: waits for approval, sees nothing, cannot invite', async () => {
  const access = (await as(erin, () => one(`select public.my_access() as a`))).a;
  assert.equal(access.status, 'pending');
  assert.deepEqual(access.features, []);
  await rejects(as(erin, () => q(`select public.create_invite()`)), /not_approved/, 'invite');
  assert.equal(await as(erin, () => one(`select public.current_couple_id() as c`)).then((r) => r.c), null);
});

await test('admin tools: only for admins', async () => {
  for (const fn of [`public.admin_stats()`, `public.admin_list_people()`, `public.admin_decide('${erin}', 'approved')`]) {
    await rejects(as(alice, () => q(`select ${fn}`)), /not_admin/, fn);
  }
  await rejects(as(alice, () => q(`update public.user_access set status = 'approved' where user_id = $1`, [erin])), null, 'direct write');
  assert.equal((await as(alice, () => q(`select * from public.user_access`))).length, 1, 'only my own row');
});

await test('approve: a plan gives its features; the couple shares the overlap', async () => {
  await as(jonal, () => q(`select public.admin_decide($1, 'approved', 'starter')`, [erin]));
  await as(jonal, () => q(`select public.admin_decide($1, 'approved', null, $2)`, [frank, ['chat', 'countdowns', 'memories']]));
  const { code } = await as(erin, () => one(`select code from public.create_invite()`));
  newCouple = await as(frank, () => one(`select * from public.redeem_invite($1)`, [code]));
  const features = (await as(erin, () => one(`select public.my_access() as a`))).a.features;
  assert.deepEqual(features, ['chat', 'countdowns']);
  await as(erin, () => q(`insert into public.messages (couple_id, sender_id, body) values ($1, $2, 'hi')`, [newCouple.id, erin]));
  await rejects(
    as(frank, () => q(`insert into public.memories (couple_id, created_by, title, happened_on) values ($1, $2, 'x', current_date)`, [newCouple.id, frank])),
    /row-level security/,
    'memories not granted',
  );
});

await test('couple features: one edit, both partners', async () => {
  await as(jonal, () => q(`select public.admin_set_couple_features($1, null, $2)`, [newCouple.id, ['chat', 'calls', 'memories']]));
  for (const who of [erin, frank]) {
    assert.deepEqual((await as(who, () => one(`select public.my_access() as a`))).a.features, ['chat', 'calls', 'memories']);
  }
  await rejects(
    as(erin, () => q(`insert into public.countdowns (couple_id, created_by, title, on_date) values ($1, $2, 'x', current_date)`, [newCouple.id, erin])),
    /row-level security/,
    'countdowns taken away',
  );
});

await test('kill switch: pauses a feature for everyone but the founders', async () => {
  await as(jonal, () => q(`select public.admin_set_feature('chat', false, 'Back soon')`));
  await rejects(
    as(erin, () => q(`insert into public.messages (couple_id, sender_id, body) values ($1, $2, 'hi')`, [newCouple.id, erin])),
    /row-level security/,
    'chat paused',
  );
  assert.equal((await as(erin, () => one(`select public.my_access() as a`))).a.paused.chat, 'Back soon');
  assert.ok((await as(jonal, () => one(`select public.my_access() as a`))).a.features.includes('chat'), 'founders keep chat');
  await as(jonal, () => q(`select public.admin_set_feature('chat', true)`));
});

await test('protected: no admin action can touch the founders', async () => {
  await rejects(as(jonal, () => q(`select public.admin_decide($1, 'suspended')`, [parul])), /protected/, 'suspend');
  const founders = await one(`select id from public.couples where user_a_id = $1`, [jonal]);
  await rejects(as(jonal, () => q(`select public.admin_set_couple_features($1, 'starter')`, [founders.id])), /protected/, 'features');
});

await test('suspend: the couple closes for them; reinstating opens it again', async () => {
  await as(jonal, () => q(`select public.admin_decide($1, 'suspended', null, null, 'Spam')`, [frank]));
  assert.equal((await as(frank, () => q(`select * from public.messages`))).length, 0);
  assert.equal((await as(frank, () => one(`select public.my_access() as a`))).a.reason, 'Spam');
  assert.deepEqual((await as(erin, () => one(`select public.my_access() as a`))).a.features, [], 'partner suspended → nothing shared works');
  await as(jonal, () => q(`select public.admin_decide($1, 'approved')`, [frank]));
  assert.equal((await as(frank, () => q(`select * from public.messages`))).length, 1);
});

await test('stats, people and audit', async () => {
  const stats = (await as(jonal, () => one(`select public.admin_stats() as s`))).s;
  assert.equal(stats.people, (await one(`select count(*)::int as n from public.profiles`)).n);
  assert.equal(stats.couples, (await one(`select count(*)::int as n from public.couples`)).n);
  assert.equal(stats.by_status.approved + (stats.by_status.pending ?? 0), stats.people);
  const people = await as(jonal, () => q(`select * from public.admin_list_people(null, 'erin.admin')`));
  assert.equal(people.length, 1);
  assert.equal(people[0].partner_name, 'Frank');
  const log = await as(jonal, () => q(`select action from public.admin_audit_log(50)`));
  assert.ok(log.some((r) => r.action === 'decide:suspended'));
  assert.ok(log.some((r) => r.action === 'feature_switch'));
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
await db.close();

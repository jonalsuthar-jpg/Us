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

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
await db.close();

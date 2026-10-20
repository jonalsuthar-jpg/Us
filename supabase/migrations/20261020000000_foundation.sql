-- ============================================================================
-- Us — Phase 1 + 2 foundation
--   profiles, invites, couples (pairing), messages (chat + receipts), calls
--
-- Security model
--   * Every couple-scoped row carries couple_id and is guarded by RLS using
--     public.current_couple_id(), which resolves the caller's pairing.
--   * State transitions that must be validated (pairing, receipts, call status)
--     go through SECURITY DEFINER functions; direct UPDATEs are not granted.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 60),
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. Visible to self and to the paired partner only.';

-- Create a profile automatically when an auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(coalesce(new.email, 'you'), '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Couples (the pairing). Permanent: no UPDATE / DELETE is granted to clients.
-- ---------------------------------------------------------------------------
create table public.couples (
  id          uuid primary key default gen_random_uuid(),
  user_a_id   uuid not null unique references public.profiles (id) on delete cascade,
  user_b_id   uuid not null unique references public.profiles (id) on delete cascade,
  paired_at   timestamptz not null default now(),
  constraint couples_distinct_members check (user_a_id <> user_b_id)
);

comment on table public.couples is 'Exactly two people. user_a = invite creator ("partner A", rose), user_b = joiner ("partner B", teal).';

-- A user may never appear in two couples, in either column.
create or replace function public.ensure_single_couple()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.couples c
    where c.id <> new.id
      and (c.user_a_id in (new.user_a_id, new.user_b_id)
        or c.user_b_id in (new.user_a_id, new.user_b_id))
  ) then
    raise exception 'already_paired' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger couples_single_membership
  before insert or update on public.couples
  for each row execute function public.ensure_single_couple();

-- The caller's couple id (null if unpaired). Used by every couple-scoped policy.
create or replace function public.current_couple_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.couples c
  where c.user_a_id = (select auth.uid()) or c.user_b_id = (select auth.uid())
  limit 1;
$$;

-- The caller's partner id (null if unpaired).
create or replace function public.current_partner_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.user_a_id = (select auth.uid()) then c.user_b_id else c.user_a_id end
  from public.couples c
  where c.user_a_id = (select auth.uid()) or c.user_b_id = (select auth.uid())
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------
create table public.invites (
  code         text primary key check (code ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$'),
  created_by   uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  redeemed_by  uuid references public.profiles (id) on delete set null,
  redeemed_at  timestamptz
);

create index invites_created_by_idx on public.invites (created_by);

-- Generate (or return the still-valid) invite code for the caller.
create or replace function public.create_invite()
returns public.invites
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  candidate text;
  result public.invites;
begin
  if me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if public.current_couple_id() is not null then
    raise exception 'already_paired' using errcode = 'P0001';
  end if;

  select * into result
  from public.invites i
  where i.created_by = me and i.redeemed_at is null and i.expires_at > now()
  order by i.created_at desc
  limit 1;
  if found then
    return result;
  end if;

  loop
    candidate := '';
    for n in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      if n = 4 then candidate := candidate || '-'; end if;
    end loop;
    begin
      insert into public.invites (code, created_by) values (candidate, me)
      returning * into result;
      return result;
    exception when unique_violation then
      -- astronomically unlikely; try another code
    end;
  end loop;
end;
$$;

-- Redeem a partner's invite code and create the couple.
create or replace function public.redeem_invite(invite_code text)
returns public.couples
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  inv public.invites;
  result public.couples;
  normalized text := upper(regexp_replace(coalesce(invite_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if char_length(normalized) <> 8 then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;
  normalized := substr(normalized, 1, 4) || '-' || substr(normalized, 5, 4);

  select * into inv from public.invites where code = normalized for update;
  if not found or inv.expires_at <= now() then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;
  if inv.redeemed_at is not null then
    raise exception 'invite_used' using errcode = 'P0001';
  end if;
  if inv.created_by = me then
    raise exception 'invite_own' using errcode = 'P0001';
  end if;

  -- Serialise concurrent pairing attempts involving either person.
  perform 1 from public.profiles where id in (me, inv.created_by) for update;
  if exists (
    select 1 from public.couples
    where user_a_id in (me, inv.created_by) or user_b_id in (me, inv.created_by)
  ) then
    raise exception 'already_paired' using errcode = 'P0001';
  end if;

  insert into public.couples (user_a_id, user_b_id)
  values (inv.created_by, me)
  returning * into result;

  update public.invites
  set redeemed_by = me, redeemed_at = now()
  where code = inv.code;

  -- Any other open invites from either person are now meaningless.
  delete from public.invites
  where created_by in (me, inv.created_by) and redeemed_at is null;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Calls
-- ---------------------------------------------------------------------------
create type public.call_media as enum ('audio', 'video');
create type public.call_status as enum ('ringing', 'active', 'ended', 'missed', 'declined');

create table public.calls (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  caller_id    uuid not null references public.profiles (id) on delete cascade,
  callee_id    uuid not null references public.profiles (id) on delete cascade,
  media        public.call_media not null default 'video',
  status       public.call_status not null default 'ringing',
  created_at   timestamptz not null default now(),
  answered_at  timestamptz,
  ended_at     timestamptz,
  constraint calls_distinct_parties check (caller_id <> callee_id)
);

create index calls_couple_created_idx on public.calls (couple_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create type public.message_kind as enum ('text', 'call');
create type public.message_status as enum ('sent', 'delivered', 'read'); -- order matters

create table public.messages (
  id            uuid primary key default gen_random_uuid(), -- clients may supply it (optimistic UI)
  couple_id     uuid not null references public.couples (id) on delete cascade,
  sender_id     uuid not null references public.profiles (id) on delete cascade,
  kind          public.message_kind not null default 'text',
  body          text check (body is null or char_length(body) between 1 and 4000),
  call_id       uuid references public.calls (id) on delete set null,
  status        public.message_status not null default 'sent',
  delivered_at  timestamptz,
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  constraint messages_shape check (
    (kind = 'text' and body is not null and call_id is null)
    or (kind = 'call' and call_id is not null)
  )
);

create index messages_couple_created_idx on public.messages (couple_id, created_at desc);
create index messages_unacked_idx on public.messages (couple_id, status) where status <> 'read';
create unique index messages_one_per_call_idx on public.messages (call_id) where call_id is not null;

-- Mark the caller's incoming messages as delivered or read.
-- Status only ever moves forward; 'read' implies 'delivered'.
-- p_ids = null means "every incoming message not yet at this status".
create or replace function public.ack_messages(p_status public.message_status, p_ids uuid[] default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  cid uuid := public.current_couple_id();
  touched integer;
begin
  if me is null or cid is null then
    raise exception 'not_paired' using errcode = 'P0001';
  end if;
  if p_status = 'sent' then
    return 0;
  end if;

  update public.messages m
  set status       = p_status,
      delivered_at = coalesce(m.delivered_at, now()),
      read_at      = case when p_status = 'read' then coalesce(m.read_at, now()) else m.read_at end
  where m.couple_id = cid
    and m.sender_id <> me
    and m.status < p_status
    and (p_ids is null or m.id = any (p_ids));

  get diagnostics touched = row_count;
  return touched;
end;
$$;

-- Validated call state machine.
create or replace function public.set_call_status(p_call_id uuid, p_status public.call_status)
returns public.calls
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  c public.calls;
begin
  select * into c from public.calls where id = p_call_id for update;
  if not found or me not in (c.caller_id, c.callee_id) then
    raise exception 'call_not_found' using errcode = 'P0002';
  end if;

  -- Idempotent: repeating the current status is a no-op.
  if c.status = p_status then
    return c;
  end if;

  if c.status = 'ringing' and p_status = 'active' and me = c.callee_id then
    update public.calls set status = 'active', answered_at = now() where id = c.id returning * into c;
  elsif c.status = 'ringing' and p_status = 'declined' and me = c.callee_id then
    update public.calls set status = 'declined', ended_at = now() where id = c.id returning * into c;
  elsif c.status = 'ringing' and p_status in ('missed', 'ended') then
    -- Caller cancelled / nobody answered. Record as missed either way.
    update public.calls set status = 'missed', ended_at = now() where id = c.id returning * into c;
  elsif c.status = 'active' and p_status = 'ended' then
    update public.calls set status = 'ended', ended_at = now() where id = c.id returning * into c;
  else
    -- Terminal states are final; ignore late or conflicting transitions.
    return c;
  end if;

  return c;
end;
$$;

-- Every finished call leaves an entry in the chat thread (missed calls are
-- rendered as tappable "call back" system messages).
create or replace function public.log_call_in_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('ended', 'missed', 'declined') and old.status is distinct from new.status then
    insert into public.messages (couple_id, sender_id, kind, call_id, created_at)
    values (new.couple_id, new.caller_id, 'call', new.id, new.created_at)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger calls_log_in_thread
  after update of status on public.calls
  for each row execute function public.log_call_in_thread();

-- Calls left ringing (e.g. both apps were killed) are swept to "missed".
create or replace function public.expire_stale_calls()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with expired as (
    update public.calls
    set status = 'missed', ended_at = now()
    where status = 'ringing'
      and created_at < now() - interval '60 seconds'
      and couple_id = public.current_couple_id()
    returning 1
  )
  select count(*)::int from expired;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.couples  enable row level security;
alter table public.invites  enable row level security;
alter table public.calls    enable row level security;
alter table public.messages enable row level security;

-- profiles: me + my partner; I can only edit myself.
create policy "profiles: read self and partner"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or id = (select public.current_partner_id()));

create policy "profiles: update self"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- couples: members can read; writes only via redeem_invite().
create policy "couples: members read"
  on public.couples for select to authenticated
  using (user_a_id = (select auth.uid()) or user_b_id = (select auth.uid()));

-- invites: creators can see their own (to display + poll); writes via RPC.
create policy "invites: creator reads"
  on public.invites for select to authenticated
  using (created_by = (select auth.uid()));

-- calls: couple members read; the caller creates a ringing call to their partner.
create policy "calls: couple reads"
  on public.calls for select to authenticated
  using (couple_id = (select public.current_couple_id()));

create policy "calls: caller creates"
  on public.calls for insert to authenticated
  with check (
    couple_id = (select public.current_couple_id())
    and caller_id = (select auth.uid())
    and callee_id = (select public.current_partner_id())
    and status = 'ringing'
    and answered_at is null and ended_at is null
  );

-- messages: couple members read; I can only send text as myself, fresh.
create policy "messages: couple reads"
  on public.messages for select to authenticated
  using (couple_id = (select public.current_couple_id()));

create policy "messages: send as self"
  on public.messages for insert to authenticated
  with check (
    couple_id = (select public.current_couple_id())
    and sender_id = (select auth.uid())
    and kind = 'text'
    and status = 'sent'
    and delivered_at is null and read_at is null
  );

-- Column-level privileges: only display_name / avatar_url are editable.
revoke all on public.profiles, public.couples, public.invites, public.calls, public.messages from anon;
revoke insert, update, delete on public.profiles, public.couples, public.invites, public.calls, public.messages from authenticated;
grant select on public.profiles, public.couples, public.invites, public.calls, public.messages to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant insert on public.messages, public.calls to authenticated;

revoke execute on function public.create_invite(), public.redeem_invite(text),
  public.ack_messages(public.message_status, uuid[]), public.set_call_status(uuid, public.call_status),
  public.expire_stale_calls(), public.current_couple_id(), public.current_partner_id()
  from public, anon;
grant execute on function public.create_invite(), public.redeem_invite(text),
  public.ack_messages(public.message_status, uuid[]), public.set_call_status(uuid, public.call_status),
  public.expire_stale_calls(), public.current_couple_id(), public.current_partner_id()
  to authenticated;

-- updated_at bookkeeping
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

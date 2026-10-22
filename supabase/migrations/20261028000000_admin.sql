-- ============================================================================
-- Admin: approvals, per-couple features, kill switches, audit
--
-- Access model
--   * Every person has a user_access row. New sign-ups start 'pending' and
--     can't reach any couple data, invite or pair until an admin approves them.
--   * current_couple_id() / current_partner_id() return null unless the caller
--     is approved, so every existing couple-scoped policy (tables, storage,
--     realtime) is closed to pending, rejected and suspended people at once.
--   * Features are per couple: an admin edit writes the same set to both
--     partners, and has_feature() requires it on both (so a couple formed from
--     two different grants gets the overlap). One RESTRICTIVE policy per
--     feature table enforces it, ANDed with the policies already there.
--   * features.enabled is a global kill switch per feature.
--   * Protected people (the founding couple) are always approved with every
--     feature, including ones added later, and no admin action can change that.
--   * Admins only ever see counts and metadata, never what a couple wrote.
-- ============================================================================

-- ---------------------------------------------------------------- catalog ---
create table public.features (
  key               text primary key check (key ~ '^[a-z_]+$'),
  label             text not null,
  module            text not null,
  sort              int not null default 0,
  enabled           boolean not null default true,
  -- Shown to people in place of the feature while it is switched off.
  disabled_message  text,
  updated_at        timestamptz not null default now()
);

comment on table public.features is 'Every feature an admin can grant. Mirrors packages/shared/src/features.ts.';

insert into public.features (key, label, module, sort) values
  ('chat',             'Chat',              'talk',    10),
  ('calls',            'Calls',             'talk',    20),
  ('snaps',            'Snaps',             'home',    30),
  ('taps',             'Thinking of you',   'home',    40),
  ('countdowns',       'Countdowns',        'home',    50),
  ('location',         'Location sharing',  'home',    60),
  ('arrival',          'Got home safe',     'home',    70),
  ('plant',            'Our plant',         'home',    80),
  ('spark',            'Spark Rank',        'home',    90),
  ('daily_question',   'Daily question',    'connect', 100),
  ('fight_translator', 'Fight translator',  'connect', 110),
  ('letters',          'Future letters',    'connect', 120),
  ('jokes',            'Inside jokes',      'connect', 130),
  ('calendar',         'Calendar',          'plan',    140),
  ('lists',            'Lists',             'plan',    150),
  ('decide',           'Decision picker',   'plan',    160),
  ('labour',           'Invisible labour',  'plan',    170),
  ('costs',            'Shared costs',      'plan',    180),
  ('memories',         'Memories',          'memory',  190),
  ('goals',            'Goals',             'growth',  200),
  ('mood',             'Mood check-ins',    'growth',  210),
  ('worries',          'Worry space',       'growth',  220),
  ('love_languages',   'Love languages',    'growth',  230);

create table public.plans (
  id          text primary key check (id ~ '^[a-z0-9_-]+$'),
  name        text not null check (char_length(name) between 1 and 40),
  features    text[] not null default '{}',
  is_default  boolean not null default false,
  -- For later, when plans become subscriptions.
  price_note  text,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

-- At most one default plan.
create unique index plans_one_default on public.plans (is_default) where is_default;

insert into public.plans (id, name, features, is_default, sort) values
  ('full', 'Everything', (select array_agg(key order by sort) from public.features), true, 10),
  ('starter', 'Starter', array['chat', 'calls', 'snaps', 'taps', 'countdowns', 'daily_question'], false, 20);

-- ----------------------------------------------------------------- access ---
create type public.access_status as enum ('pending', 'approved', 'rejected', 'suspended');

create table public.user_access (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  status        public.access_status not null default 'pending',
  is_admin      boolean not null default false,
  protected     boolean not null default false,
  plan_id       text references public.plans (id) on delete set null,
  features      text[] not null default '{}',
  -- Shown to the person when rejected or suspended.
  reason        text,
  -- Private to admins.
  note          text,
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references public.profiles (id) on delete set null,
  updated_at    timestamptz not null default now()
);

create index user_access_status_idx on public.user_access (status, requested_at desc);

comment on table public.user_access is 'Approval and feature grants per person. Written only by admin_* functions.';

-- Everyone who already uses Us keeps everything.
insert into public.user_access (user_id, status, plan_id, features, decided_at)
select p.id, 'approved', 'full', (select array_agg(key order by sort) from public.features), now()
from public.profiles p;

-- The founding couple: protected, and the account below is the first admin.
update public.user_access a
set protected = true,
    is_admin = (u.email = 'jonalsuthar@gmail.com')
from auth.users u
where u.id = a.user_id
  and (u.email = 'jonalsuthar@gmail.com'
    or u.id in (
      select case when c.user_a_id = o.id then c.user_b_id else c.user_a_id end
      from public.couples c
      join auth.users o on o.id in (c.user_a_id, c.user_b_id)
      where o.email = 'jonalsuthar@gmail.com'
    ));

-- New sign-ups wait for approval.
create or replace function public.create_user_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_access (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger profiles_create_access
  after insert on public.profiles
  for each row execute function public.create_user_access();

create table public.admin_audit (
  id             bigint generated always as identity primary key,
  admin_id       uuid references public.profiles (id) on delete set null,
  action         text not null,
  target_user    uuid,
  target_couple  uuid,
  before         jsonb,
  after          jsonb,
  at             timestamptz not null default now()
);

create index admin_audit_at_idx on public.admin_audit (at desc);

create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  body        text not null check (char_length(body) between 1 and 280),
  tone        text not null default 'note' check (tone in ('note', 'warning')),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers ---
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_access
    where user_id = (select auth.uid()) and is_admin and status = 'approved'
  );
$$;

create or replace function public.is_approved(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_access where user_id = p_user and status = 'approved');
$$;

-- Can this person use this feature on their own? (Protected people: always.)
create or replace function public.user_has_feature(p_user uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_access a
    where a.user_id = p_user
      and a.status = 'approved'
      and (a.protected
        or (p_feature = any (a.features)
          and not exists (select 1 from public.features f where f.key = p_feature and not f.enabled)))
  );
$$;

-- The caller can use the feature, and so can their partner if they have one.
create or replace function public.has_feature(p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.user_has_feature((select auth.uid()), p_feature)
    and coalesce((
      select public.user_has_feature(
        case when c.user_a_id = (select auth.uid()) then c.user_b_id else c.user_a_id end,
        p_feature
      )
      from public.couples c
      where c.user_a_id = (select auth.uid()) or c.user_b_id = (select auth.uid())
      limit 1
    ), true);
$$;

-- The global gate: nothing couple-scoped resolves for someone not approved.
create or replace function public.current_couple_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.couples c
  where (c.user_a_id = (select auth.uid()) or c.user_b_id = (select auth.uid()))
    and public.is_approved((select auth.uid()))
  limit 1;
$$;

create or replace function public.current_partner_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.user_a_id = (select auth.uid()) then c.user_b_id else c.user_a_id end
  from public.couples c
  where (c.user_a_id = (select auth.uid()) or c.user_b_id = (select auth.uid()))
    and public.is_approved((select auth.uid()))
  limit 1;
$$;

-- What the apps need to know about me: whether I'm in, and what I can use.
create or replace function public.my_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', coalesce(a.status::text, 'pending'),
    'reason', a.reason,
    'is_admin', coalesce(a.is_admin and a.status = 'approved', false),
    'features', coalesce((
      select jsonb_agg(f.key order by f.sort) from public.features f where public.has_feature(f.key)
    ), '[]'::jsonb),
    'paused', coalesce((
      select jsonb_object_agg(f.key, coalesce(f.disabled_message, ''))
      from public.features f
      where not f.enabled and not coalesce(a.protected, false)
    ), '{}'::jsonb),
    'announcement', (
      select jsonb_build_object('id', n.id, 'body', n.body, 'tone', n.tone)
      from public.announcements n
      where n.starts_at <= now() and (n.ends_at is null or n.ends_at > now())
      order by n.starts_at desc
      limit 1
    )
  )
  from (select (select auth.uid()) as uid) me
  left join public.user_access a on a.user_id = me.uid;
$$;

-- ---------------------------------------------------------------- pairing ---
-- Only approved people can invite or pair.
create or replace function public.require_approved_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_approved(new.created_by) then
    raise exception 'not_approved' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger invites_require_approved
  before insert on public.invites
  for each row execute function public.require_approved_invite();

create or replace function public.require_approved_couple()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_approved(new.user_a_id) and public.is_approved(new.user_b_id)) then
    raise exception 'not_approved' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger couples_require_approved
  before insert on public.couples
  for each row execute function public.require_approved_couple();

-- A new couple shares one feature set: the overlap of what each was given.
create or replace function public.align_couple_features()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a text[] := (select features from public.user_access where user_id = new.user_a_id);
  v_b text[] := (select features from public.user_access where user_id = new.user_b_id);
  v_shared text[];
begin
  select coalesce(array_agg(f), '{}') into v_shared from unnest(v_a) f where f = any (v_b);

  update public.user_access
  set features = v_shared, updated_at = now()
  where user_id in (new.user_a_id, new.user_b_id) and not protected;
  return new;
end;
$$;

create trigger couples_align_features
  after insert on public.couples
  for each row execute function public.align_couple_features();

-- --------------------------------------------------------- feature gates ---
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('messages', 'chat'),
      ('calls', 'calls'),
      ('snaps', 'snaps'),
      ('taps', 'taps'),
      ('countdowns', 'countdowns'),
      ('location_shares', 'location'),
      ('arrival_checks', 'arrival'),
      ('plant_days', 'plant'),
      ('spark_events', 'spark'),
      ('spark_seasons', 'spark'),
      ('daily_questions', 'daily_question'),
      ('daily_answers', 'daily_question'),
      ('fight_sessions', 'fight_translator'),
      ('fight_entries', 'fight_translator'),
      ('future_letters', 'letters'),
      ('future_letter_bodies', 'letters'),
      ('inside_jokes', 'jokes'),
      ('calendar_events', 'calendar'),
      ('list_items', 'lists'),
      ('decision_options', 'decide'),
      ('labor_entries', 'labour'),
      ('expenses', 'costs'),
      ('memories', 'memories'),
      ('memory_ratings', 'memories'),
      ('goals', 'goals'),
      ('mood_checkins', 'mood'),
      ('insecurity_checkins', 'worries'),
      ('love_language_results', 'love_languages')
    ) as t (tbl, feature)
  loop
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using ((select public.has_feature(%L))) with check ((select public.has_feature(%L)))',
      r.tbl || ': feature ' || r.feature, r.tbl, r.feature, r.feature
    );
  end loop;
end;
$$;

-- -------------------------------------------------------- client access ---
alter table public.features      enable row level security;
alter table public.plans         enable row level security;
alter table public.user_access   enable row level security;
alter table public.admin_audit   enable row level security;
alter table public.announcements enable row level security;

-- Everyone may read the catalog (names, switches); only admins write, via functions.
create policy "features: signed-in read" on public.features for select to authenticated using (true);
create policy "plans: admins read" on public.plans for select to authenticated using ((select public.is_admin()));
-- My own row (so the app can listen for my approval); admins see all.
create policy "user_access: self or admin reads" on public.user_access for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "admin_audit: admins read" on public.admin_audit for select to authenticated using ((select public.is_admin()));
create policy "announcements: signed-in read" on public.announcements for select to authenticated using (true);

revoke insert, update, delete on public.features, public.plans, public.user_access, public.admin_audit, public.announcements
  from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.user_access, public.features;
  end if;
end;
$$;

-- ----------------------------------------------------------- admin tools ---
create or replace function public.admin_guard()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create or replace function public.admin_log(p_action text, p_user uuid, p_couple uuid, p_before jsonb, p_after jsonb)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.admin_audit (admin_id, action, target_user, target_couple, before, after)
  values ((select auth.uid()), p_action, p_user, p_couple, p_before, p_after);
$$;

-- Counts only. Nothing anyone wrote.
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.admin_guard();
  select jsonb_build_object(
    'people', (select count(*) from public.user_access),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (
      select status, count(*) n from public.user_access group by status) s),
    'couples', (select count(*) from public.couples),
    'unpaired_approved', (select count(*) from public.user_access a
      where a.status = 'approved'
        and not exists (select 1 from public.couples c where a.user_id in (c.user_a_id, c.user_b_id))),
    'active_1d', (select count(*) from auth.users where last_sign_in_at > now() - interval '1 day'),
    'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'active_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'signups', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d), '[]') from (
      select g::date d, (select count(*) from public.user_access a where a.requested_at::date = g::date) n
      from generate_series(current_date - 29, current_date, interval '1 day') g) s),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'messages', m, 'calls', c) order by d), '[]') from (
      select g::date d,
        (select count(*) from public.messages x where x.created_at >= g and x.created_at < g + interval '1 day' and x.kind = 'text') m,
        (select count(*) from public.calls x where x.created_at >= g and x.created_at < g + interval '1 day') c
      from generate_series(current_date - 13, current_date, interval '1 day') g) s),
    'push_failures_7d', (select count(*) from public.push_log where outcome = 'onesignal_error' and at > now() - interval '7 days')
  ) into v;
  return v;
end;
$$;

create or replace function public.admin_list_people(p_status public.access_status default null, p_search text default null)
returns table (
  user_id uuid,
  display_name text,
  email text,
  avatar_url text,
  status public.access_status,
  is_admin boolean,
  protected boolean,
  plan_id text,
  features text[],
  reason text,
  note text,
  requested_at timestamptz,
  decided_at timestamptz,
  last_seen timestamptz,
  couple_id uuid,
  partner_id uuid,
  partner_name text,
  paired_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return query
  select a.user_id, p.display_name, u.email::text, p.avatar_url, a.status, a.is_admin, a.protected, a.plan_id, a.features,
         a.reason, a.note, a.requested_at, a.decided_at, u.last_sign_in_at,
         c.id, pp.id, pp.display_name, c.paired_at
  from public.user_access a
  join public.profiles p on p.id = a.user_id
  left join auth.users u on u.id = a.user_id
  left join public.couples c on a.user_id in (c.user_a_id, c.user_b_id)
  left join public.profiles pp on pp.id = case when c.user_a_id = a.user_id then c.user_b_id else c.user_a_id end
  where (p_status is null or a.status = p_status)
    and (p_search is null or p_search = ''
      or p.display_name ilike '%' || p_search || '%'
      or u.email ilike '%' || p_search || '%')
  order by (a.status = 'pending') desc, a.requested_at desc;
end;
$$;

-- Only known feature keys, in catalog order.
create or replace function public.clean_features(p_features text[])
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(f.key order by f.sort), '{}') from public.features f where f.key = any (coalesce(p_features, '{}'));
$$;

-- Approve, reject, suspend or reinstate someone. Features (or a plan) apply to
-- them and, if they're paired, their partner too: one set per couple.
create or replace function public.admin_decide(
  p_user uuid,
  p_status public.access_status,
  p_plan text default null,
  p_features text[] default null,
  p_reason text default null
)
returns public.user_access
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.admin_guard();
  v_before public.user_access;
  v_after public.user_access;
  v_features text[];
  v_partner uuid;
begin
  select * into v_before from public.user_access where user_id = p_user for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_before.protected then
    raise exception 'protected' using errcode = 'P0001';
  end if;
  if p_user = me and p_status <> 'approved' then
    raise exception 'not_yourself' using errcode = 'P0001';
  end if;

  if p_features is not null then
    v_features := public.clean_features(p_features);
  elsif p_plan is not null then
    select public.clean_features(features) into v_features from public.plans where id = p_plan;
    if v_features is null then
      raise exception 'unknown_plan' using errcode = 'P0001';
    end if;
  elsif p_status = 'approved' and v_before.status = 'pending' then
    -- Approving without a choice: the default plan.
    select id, public.clean_features(features) into p_plan, v_features from public.plans where is_default;
  end if;

  update public.user_access
  set status = p_status,
      reason = case when p_status in ('rejected', 'suspended') then nullif(trim(p_reason), '') else null end,
      plan_id = case when v_features is not null then p_plan else plan_id end,
      features = coalesce(v_features, features),
      decided_at = now(),
      decided_by = me,
      updated_at = now()
  where user_id = p_user
  returning * into v_after;

  if v_features is not null then
    select case when c.user_a_id = p_user then c.user_b_id else c.user_a_id end into v_partner
    from public.couples c where p_user in (c.user_a_id, c.user_b_id);
    update public.user_access
    set features = v_features, plan_id = p_plan, updated_at = now()
    where user_id = v_partner and not protected;
  end if;

  perform public.admin_log('decide:' || p_status, p_user, null, to_jsonb(v_before), to_jsonb(v_after));
  return v_after;
end;
$$;

-- Change a couple's features: the same set for both of them.
create or replace function public.admin_set_couple_features(p_couple uuid, p_plan text default null, p_features text[] default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_couple public.couples;
  v_features text[];
  v_before jsonb;
begin
  perform public.admin_guard();
  select * into v_couple from public.couples where id = p_couple;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.user_access where user_id in (v_couple.user_a_id, v_couple.user_b_id) and protected) then
    raise exception 'protected' using errcode = 'P0001';
  end if;
  if p_features is not null then
    v_features := public.clean_features(p_features);
  else
    select public.clean_features(features) into v_features from public.plans where id = p_plan;
    if v_features is null then
      raise exception 'unknown_plan' using errcode = 'P0001';
    end if;
  end if;

  select jsonb_agg(jsonb_build_object('user_id', user_id, 'plan_id', plan_id, 'features', features)) into v_before
  from public.user_access where user_id in (v_couple.user_a_id, v_couple.user_b_id);

  update public.user_access
  set features = v_features, plan_id = p_plan, updated_at = now()
  where user_id in (v_couple.user_a_id, v_couple.user_b_id);

  perform public.admin_log('couple_features', null, p_couple, v_before, jsonb_build_object('plan_id', p_plan, 'features', v_features));
end;
$$;

create or replace function public.admin_set_note(p_user uuid, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  update public.user_access set note = nullif(trim(p_note), ''), updated_at = now() where user_id = p_user;
end;
$$;

create or replace function public.admin_set_admin(p_user uuid, p_admin boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.admin_guard();
begin
  if p_user = me and not p_admin then
    raise exception 'not_yourself' using errcode = 'P0001';
  end if;
  if p_admin and not public.is_approved(p_user) then
    raise exception 'not_approved' using errcode = 'P0001';
  end if;
  update public.user_access set is_admin = p_admin, updated_at = now() where user_id = p_user;
  perform public.admin_log(case when p_admin then 'admin:grant' else 'admin:revoke' end, p_user, null, null, null);
end;
$$;

-- The global kill switch for one feature (never reaches protected people).
create or replace function public.admin_set_feature(p_key text, p_enabled boolean, p_message text default null)
returns public.features
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_before public.features;
  v_after public.features;
begin
  perform public.admin_guard();
  select * into v_before from public.features where key = p_key;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.features
  set enabled = p_enabled, disabled_message = nullif(trim(p_message), ''), updated_at = now()
  where key = p_key
  returning * into v_after;
  perform public.admin_log('feature_switch', null, null, to_jsonb(v_before), to_jsonb(v_after));
  return v_after;
end;
$$;

create or replace function public.admin_save_plan(p_id text, p_name text, p_features text[], p_default boolean default false, p_price_note text default null)
returns public.plans
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.plans;
begin
  perform public.admin_guard();
  if p_default then
    update public.plans set is_default = false where is_default and id <> p_id;
  end if;
  insert into public.plans (id, name, features, is_default, price_note, sort)
  values (p_id, p_name, public.clean_features(p_features), p_default, nullif(trim(p_price_note), ''),
          coalesce((select max(sort) + 10 from public.plans), 10))
  on conflict (id) do update
    set name = excluded.name, features = excluded.features, is_default = excluded.is_default, price_note = excluded.price_note
  returning * into v;
  perform public.admin_log('plan_save', null, null, null, to_jsonb(v));
  return v;
end;
$$;

create or replace function public.admin_delete_plan(p_id text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  if exists (select 1 from public.plans where id = p_id and is_default) then
    raise exception 'plan_is_default' using errcode = 'P0001';
  end if;
  delete from public.plans where id = p_id;
  perform public.admin_log('plan_delete', null, null, jsonb_build_object('id', p_id), null);
end;
$$;

create or replace function public.admin_post_announcement(p_body text, p_tone text default 'note', p_ends_at timestamptz default null)
returns public.announcements
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.announcements;
begin
  perform public.admin_guard();
  -- One at a time: a new one ends whatever is showing.
  update public.announcements set ends_at = now() where ends_at is null or ends_at > now();
  insert into public.announcements (body, tone, ends_at, created_by)
  values (trim(p_body), p_tone, p_ends_at, auth.uid())
  returning * into v;
  perform public.admin_log('announce', null, null, null, to_jsonb(v));
  return v;
end;
$$;

create or replace function public.admin_end_announcement(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  update public.announcements set ends_at = now() where id = p_id and (ends_at is null or ends_at > now());
  perform public.admin_log('announce_end', null, null, jsonb_build_object('id', p_id), null);
end;
$$;

create or replace function public.admin_audit_log(p_limit int default 100)
returns table (id bigint, admin_name text, action text, target_user uuid, target_name text, target_couple uuid, before jsonb, after jsonb, at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard();
  return query
  select l.id, ap.display_name, l.action, l.target_user, tp.display_name, l.target_couple, l.before, l.after, l.at
  from public.admin_audit l
  left join public.profiles ap on ap.id = l.admin_id
  left join public.profiles tp on tp.id = l.target_user
  order by l.at desc
  limit least(greatest(p_limit, 1), 500);
end;
$$;

-- Signed-in people only; each admin_* checks admin itself.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.is_admin()', 'public.is_approved(uuid)', 'public.user_has_feature(uuid, text)', 'public.has_feature(text)',
    'public.my_access()', 'public.admin_guard()', 'public.admin_stats()',
    'public.admin_list_people(public.access_status, text)', 'public.clean_features(text[])',
    'public.admin_decide(uuid, public.access_status, text, text[], text)',
    'public.admin_set_couple_features(uuid, text, text[])', 'public.admin_set_note(uuid, text)',
    'public.admin_set_admin(uuid, boolean)', 'public.admin_set_feature(text, boolean, text)',
    'public.admin_save_plan(text, text, text[], boolean, text)', 'public.admin_delete_plan(text)',
    'public.admin_post_announcement(text, text, timestamptz)', 'public.admin_end_announcement(uuid)',
    'public.admin_audit_log(int)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  -- Internal only.
  revoke execute on function public.admin_log(text, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
end;
$$;

-- ------------------------------------------------------ new-request email ---
-- A new sign-up calls the admin-notify Edge Function, which emails the admin.
-- Uses the same Vault secrets as snaps-cleanup (project_url, cron_secret).
create or replace function public.notify_admin_of_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    perform net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/admin-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := jsonb_build_object('userId', new.user_id)
    );
  end if;
  return new;
exception when others then
  -- Email is a courtesy; never block a sign-up over it.
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    create trigger user_access_notify_admin
      after insert on public.user_access
      for each row execute function public.notify_admin_of_request();
  end if;
end;
$$;

-- ---------------------------------------------------------------- checks ---
-- The founding couple must come through this untouched.
do $$
declare
  v_missing int;
begin
  if exists (select 1 from auth.users where email = 'jonalsuthar@gmail.com') then
    select count(*) into v_missing
    from public.profiles p
    left join public.user_access a on a.user_id = p.id
    where p.id in (
      select id from auth.users where email = 'jonalsuthar@gmail.com'
      union
      select case when c.user_a_id = u.id then c.user_b_id else c.user_a_id end
      from public.couples c join auth.users u on u.id in (c.user_a_id, c.user_b_id)
      where u.email = 'jonalsuthar@gmail.com'
    )
    and not (coalesce(a.status = 'approved', false) and coalesce(a.protected, false)
      and a.features @> (select array_agg(key) from public.features));
    if v_missing > 0 then
      raise exception 'founding couple would lose access';
    end if;
    if not exists (
      select 1 from public.user_access a join auth.users u on u.id = a.user_id
      where u.email = 'jonalsuthar@gmail.com' and a.is_admin
    ) then
      raise exception 'founding admin missing';
    end if;
  end if;
end;
$$;

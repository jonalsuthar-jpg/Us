-- ============================================================================
-- Phases 3–6: schema stubs
--
-- These tables exist now so the RLS model for *private vs shared* data is
-- settled before features are built. Two patterns are used throughout:
--
--   SHARED   couple_id = current_couple_id()            (both partners)
--   PRIVATE  owner_id  = auth.uid()                      (author only, ever)
--
-- Private content never lives in a shared table. Where a feature needs a
-- "reveal" (daily question, fight translator), the private answer sits in an
-- owner-only table and a SECURITY DEFINER function exposes it only after the
-- reveal condition holds.
--
-- TODO(phase-3..6): flesh out columns, functions and Edge Functions per feature.
-- ============================================================================

-- ---------------------------------------------------------------- Phase 3 ---

-- Fight Translator: each partner's raw entry is PRIVATE forever; the
-- LLM-reframed "underlying need" is revealed once both have submitted.
create table public.fight_sessions (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples (id) on delete cascade,
  started_by    uuid not null references public.profiles (id) on delete cascade,
  cooldown_until timestamptz,
  revealed_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table public.fight_entries (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.fight_sessions (id) on delete cascade,
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  raw_text      text not null,          -- PRIVATE: never readable by partner
  reframed_need text,                   -- written by the edge function
  created_at    timestamptz not null default now(),
  unique (session_id, owner_id)
);
-- TODO(phase-3): get_fight_reveal(session_id) returns both reframed_need values
--               only when two entries exist; never raw_text of the partner.

-- Future Letters: body is PRIVATE to the author until unlocked.
create table public.future_letters (
  id              uuid primary key default gen_random_uuid(),
  couple_id       uuid not null references public.couples (id) on delete cascade,
  author_id       uuid not null references public.profiles (id) on delete cascade,
  title           text not null,
  unlock_at       timestamptz,
  unlock_milestone text,
  unlocked_at     timestamptz,
  created_at      timestamptz not null default now(),
  check (unlock_at is not null or unlock_milestone is not null)
);
create table public.future_letter_bodies (
  letter_id   uuid primary key references public.future_letters (id) on delete cascade,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  ciphertext  bytea not null            -- TODO(phase-3): pgsodium / vault encryption
);
-- TODO(phase-3): open_future_letter(letter_id) returns plaintext to the partner
--               only when unlocked_at is not null.

create table public.inside_jokes (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  phrase      text not null,
  story       text,
  last_resurfaced_at timestamptz,
  created_at  timestamptz not null default now()
);

create table public.daily_questions (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  prompt     text not null,
  for_date   date not null default current_date,
  unique (couple_id, for_date)
);
create table public.daily_answers (
  question_id uuid not null references public.daily_questions (id) on delete cascade,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  answer      text not null,            -- PRIVATE until both answered
  created_at  timestamptz not null default now(),
  primary key (question_id, owner_id)
);
-- TODO(phase-3): get_daily_reveal(question_id) — both answers once both exist.

-- ---------------------------------------------------------------- Phase 4 ---
create table public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  title       text not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  all_day     boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now()
);

create table public.decision_options (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples (id) on delete cascade,
  category      text not null,
  label         text not null,
  weight        numeric not null default 1 check (weight > 0),
  times_picked  integer not null default 0,
  last_picked_at timestamptz,
  created_at    timestamptz not null default now()
);

create table public.labor_entries (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  done_by     uuid not null references public.profiles (id) on delete cascade,
  task        text not null,
  effort      smallint not null default 1 check (effort between 1 and 5),
  done_on     date not null default current_date,
  created_at  timestamptz not null default now()
);

create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  paid_by     uuid not null references public.profiles (id) on delete cascade,
  description text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency    char(3) not null default 'USD',
  split_a_pct smallint not null default 50 check (split_a_pct between 0 and 100),
  spent_on    date not null default current_date,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- Phase 5 ---
create table public.memories (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  created_by   uuid not null references public.profiles (id) on delete cascade,
  title        text not null,
  body         text,
  happened_on  date not null,
  photo_path   text,                    -- Supabase Storage key in bucket "memories"
  kind         text not null default 'moment' check (kind in ('moment', 'trip', 'date')),
  created_at   timestamptz not null default now()
);

create table public.memory_ratings (
  memory_id  uuid not null references public.memories (id) on delete cascade,
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  rating     smallint check (rating between 1 and 5),
  note       text,                      -- PRIVATE
  primary key (memory_id, owner_id)
);

-- ---------------------------------------------------------------- Phase 6 ---
create table public.goals (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  owner_id    uuid references public.profiles (id) on delete cascade, -- null = shared goal
  title       text not null,
  progress    smallint not null default 0 check (progress between 0 and 100),
  created_at  timestamptz not null default now()
);

create table public.mood_checkins (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  score       smallint not null check (score between 1 and 5),   -- PRIVATE
  note        text,                                              -- PRIVATE
  nudge_partner boolean not null default false,  -- partner only ever gets a soft nudge
  created_at  timestamptz not null default now()
);

create table public.insecurity_checkins (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  body        text not null,                                     -- PRIVATE
  shared_at   timestamptz,               -- explicit opt-in share
  created_at  timestamptz not null default now()
);

create table public.love_language_results (
  owner_id    uuid primary key references public.profiles (id) on delete cascade,
  scores      jsonb not null,
  primary_language text not null,
  taken_at    timestamptz not null default now()
);

-- ------------------------------------------------------------------- RLS ---
do $$
declare
  t text;
begin
  -- SHARED couple tables: both partners read/write.
  foreach t in array array[
    'fight_sessions', 'future_letters', 'inside_jokes', 'daily_questions',
    'calendar_events', 'decision_options', 'labor_entries', 'expenses', 'memories'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$
      create policy "%1$s: couple access" on public.%1$I for all to authenticated
      using (couple_id = (select public.current_couple_id()))
      with check (couple_id = (select public.current_couple_id()))
    $p$, t);
  end loop;

  -- PRIVATE tables: only the owner, ever. Reveals go through definer functions.
  foreach t in array array[
    'fight_entries', 'future_letter_bodies', 'daily_answers', 'memory_ratings',
    'mood_checkins', 'insecurity_checkins', 'love_language_results'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$
      create policy "%1$s: owner only" on public.%1$I for all to authenticated
      using (owner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()))
    $p$, t);
  end loop;
end;
$$;

-- goals: shared goals (owner_id null) are visible to both; individual goals are
-- visible to both (a goal board is a shared surface) but editable by owner only.
alter table public.goals enable row level security;
create policy "goals: couple reads" on public.goals for select to authenticated
  using (couple_id = (select public.current_couple_id()));
create policy "goals: write own or shared" on public.goals for all to authenticated
  using (couple_id = (select public.current_couple_id())
         and (owner_id is null or owner_id = (select auth.uid())))
  with check (couple_id = (select public.current_couple_id())
              and (owner_id is null or owner_id = (select auth.uid())));

-- Insecurity check-ins the owner explicitly shared become readable by partner.
create policy "insecurity_checkins: partner reads shared" on public.insecurity_checkins
  for select to authenticated
  using (shared_at is not null and owner_id = (select public.current_partner_id()));

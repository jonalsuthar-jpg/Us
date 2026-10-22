-- ============================================================================
-- Spark Rank: a rank the two of us climb together, Ember I to Eternal, one
-- season per month. Doing things for each other earns Sparks: a message, a
-- snap, a call we both pick up, today's question, and most of all reaching
-- out first (after 4 quiet hours).
--
--   spark_events   PRIVATE (owner)  one row per award. I see only my own, so
--                                   "my effort" never becomes a scoreboard.
--                                   The together bonus has no owner.
--   spark_seasons  SHARED (couple)  the running total for each month, and
--                                   today's total for the two of us.
--
-- Written only by triggers, on the same actions that water the plant. Like
-- the plant, awarding Sparks never blocks the thing that earned them: any
-- error in spark_award() is swallowed.
--
-- The ladder (spark_ladder) is mirrored in packages/shared/src/api/spark.ts;
-- scripts/test-db.mjs checks that the two agree.
-- ============================================================================

create table public.spark_events (
  id          bigint generated always as identity primary key,
  couple_id   uuid not null references public.couples (id) on delete cascade,
  -- Null for the together bonus, which belongs to both of us.
  user_id     uuid references public.profiles (id) on delete cascade,
  day         date not null,
  kind        text not null check (kind in ('first_move', 'message', 'media', 'tap', 'snap', 'status', 'call_start', 'call_pickup', 'call_minutes', 'question', 'together')),
  sparks      int not null check (sparks > 0),
  -- What earned it ('messages:<id>', …): the same thing never pays twice.
  source      text not null,
  created_at  timestamptz not null default now()
);
create unique index spark_events_once on public.spark_events (source, kind, user_id) nulls not distinct;
create index spark_events_couple_day_idx on public.spark_events (couple_id, day);
create index spark_events_couple_created_idx on public.spark_events (couple_id, created_at desc);

alter table public.spark_events enable row level security;
create policy "spark_events: owner reads" on public.spark_events for select to authenticated
  using (user_id = (select auth.uid()) and couple_id = (select public.current_couple_id()));
revoke insert, update, delete on public.spark_events from authenticated;

create table public.spark_seasons (
  couple_id      uuid not null references public.couples (id) on delete cascade,
  -- The first day of the month, on the couple's clock.
  season         date not null check (extract(day from season) = 1),
  -- 40% of the last season's Sparks, already counted in `sparks`.
  carry_in       int not null default 0,
  sparks         int not null default 0,
  today          date,
  today_sparks   int not null default 0,
  -- The highest division a rank-up push went out for (see spark_claim_rank_up).
  notified_rank  int not null default 0,
  primary key (couple_id, season)
);

alter table public.spark_seasons enable row level security;
create policy "spark_seasons: couple reads" on public.spark_seasons for select to authenticated
  using (couple_id = (select public.current_couple_id()));
revoke insert, update, delete on public.spark_seasons from authenticated;

-- ------------------------------------------------------------- the ladder ---
-- Seven tiers of three steps (each step wider than the last), then Eternal.
create or replace function public.spark_ladder()
returns table (idx int, name text, at int)
language sql
immutable
set search_path = ''
as $$
  with tiers (t, tname, step) as (
    values (0, 'Ember', 100), (1, 'Spark', 150), (2, 'Glow', 220), (3, 'Flame', 300), (4, 'Blaze', 400), (5, 'Starlight', 500), (6, 'Aurora', 620)
  ),
  divs as (
    select t * 3 + d as idx, tname || ' ' || (array['I', 'II', 'III'])[d + 1] as name, step
    from tiers, generate_series(0, 2) as d
  )
  select idx, name, coalesce(sum(step) over (order by idx rows between unbounded preceding and 1 preceding), 0)::int
  from divs
  union all
  select 21, 'Eternal', (select sum(step) * 3 from tiers)::int
  order by 1;
$$;

-- The division (0 = Ember I … 21 = Eternal) a season total sits in.
create or replace function public.spark_division(p_sparks int)
returns int
language sql
immutable
set search_path = ''
as $$
  select coalesce(max(l.idx), 0) from public.spark_ladder() l where l.at <= p_sparks;
$$;

-- ---------------------------------------------------------------- awarding ---

-- Add to this month's total, opening the season (with its carry-in) if needed.
create or replace function public.spark_add(p_couple uuid, p_day date, p_gain int)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_season date := date_trunc('month', p_day)::date;
  v_carry int;
begin
  if not exists (select 1 from public.spark_seasons where couple_id = p_couple and season = v_season) then
    select floor(s.sparks * 0.4)::int into v_carry
    from public.spark_seasons s
    where s.couple_id = p_couple and s.season < v_season
    order by s.season desc
    limit 1;
    v_carry := coalesce(v_carry, 0);
    insert into public.spark_seasons (couple_id, season, carry_in, sparks, notified_rank)
    values (p_couple, v_season, v_carry, v_carry, public.spark_division(v_carry))
    on conflict do nothing;
  end if;
  update public.spark_seasons
  set sparks = sparks + p_gain,
      today_sparks = case when today = p_day then today_sparks + p_gain else p_gain end,
      today = p_day
  where couple_id = p_couple and season = v_season;
end;
$$;

-- Record one award, within its daily cap. Returns the Sparks it was worth.
create or replace function public.spark_grant(p_couple uuid, p_user uuid, p_day date, p_kind text, p_at timestamptz, p_source text)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- Sparks each, and the most a kind can earn one of us in a day.
  v_rule constant jsonb := '{
    "first_move":   [15, 45],
    "message":      [2, 20],
    "media":        [4, 12],
    "tap":          [3, 9],
    "snap":         [8, 24],
    "status":       [3, 3],
    "call_start":   [10, 30],
    "call_pickup":  [5, 15],
    "call_minutes": [1, 15],
    "question":     [10, 10]
  }';
  v_each int := (v_rule -> p_kind ->> 0)::int;
  v_cap int := (v_rule -> p_kind ->> 1)::int;
  v_used int;
  v_gain int;
  v_rows int;
begin
  select coalesce(sum(e.sparks), 0) into v_used
  from public.spark_events e
  where e.couple_id = p_couple and e.user_id = p_user and e.day = p_day and e.kind = p_kind;
  v_gain := least(v_each, v_cap - v_used);
  if v_gain is null or v_gain <= 0 then
    return 0;
  end if;
  insert into public.spark_events (couple_id, user_id, day, kind, sparks, source, created_at)
  values (p_couple, p_user, p_day, p_kind, v_gain, p_source, p_at)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return 0;
  end if;
  perform public.spark_add(p_couple, p_day, v_gain);
  return v_gain;
end;
$$;

-- One of us did something for the other.
--   p_kind    what it was (see spark_grant)
--   p_amount  how many of it (call minutes come in pairs of minutes)
create or replace function public.spark_award(p_couple uuid, p_user uuid, p_kind text, p_at timestamptz, p_source text, p_amount int default 1)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_day date;
  v_first boolean := false;
  v_streak int := 0;
  v_i int;
begin
  if not exists (select 1 from public.couples c where c.id = p_couple and p_user in (c.user_a_id, c.user_b_id)) then
    return;
  end if;
  v_day := public.couple_day(p_couple, p_at);

  -- Reaching out first: neither of us has reached out in the last 4 hours.
  if p_kind in ('message', 'media', 'tap', 'snap', 'call_start') then
    v_first := not exists (
      select 1 from public.spark_events e
      where e.couple_id = p_couple
        and e.kind in ('message', 'media', 'tap', 'snap', 'call_start')
        and e.created_at > p_at - interval '4 hours'
        and e.created_at <= p_at
    );
  end if;

  for v_i in 1 .. greatest(p_amount, 1) loop
    perform public.spark_grant(p_couple, p_user, v_day, p_kind, p_at, case when v_i = 1 then p_source else p_source || '#' || v_i end);
  end loop;
  if v_first then
    perform public.spark_grant(p_couple, p_user, v_day, 'first_move', p_at, p_source);
  end if;

  -- The day we both showed up (the plant just grew): a bonus for the two of
  -- us, bigger on a streak. The plant's trigger runs first (alphabetical).
  if exists (select 1 from public.plant_days d where d.couple_id = p_couple and d.day = v_day and d.a_at is not null and d.b_at is not null)
     and not exists (select 1 from public.spark_events e where e.source = 'together:' || v_day and e.couple_id = p_couple and e.kind = 'together') then
    loop
      exit when v_streak >= 6 or not exists (
        select 1 from public.plant_days d
        where d.couple_id = p_couple and d.day = v_day - (v_streak + 1) and d.a_at is not null and d.b_at is not null
      );
      v_streak := v_streak + 1;
    end loop;
    insert into public.spark_events (couple_id, user_id, day, kind, sparks, source, created_at)
    values (p_couple, null, v_day, 'together', case when v_streak >= 6 then 30 when v_streak >= 2 then 25 else 20 end, 'together:' || v_day, p_at)
    on conflict do nothing;
    if found then
      perform public.spark_add(p_couple, v_day, case when v_streak >= 6 then 30 when v_streak >= 2 then 25 else 20 end);
    end if;
  end if;
exception when others then
  -- Sparks are a nicety; they must never stop a message or a call.
  null;
end;
$$;

revoke execute on function public.spark_add(uuid, date, int), public.spark_grant(uuid, uuid, date, text, timestamptz, text),
  public.spark_award(uuid, uuid, text, timestamptz, text, int) from public, anon, authenticated;

create or replace function public.spark_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_couple uuid;
begin
  case tg_table_name
    when 'messages' then
      if new.kind = 'text' then
        perform public.spark_award(new.couple_id, new.sender_id, case when new.media_kind in ('image', 'audio') then 'media' else 'message' end, new.created_at, 'messages:' || new.id);
      end if;
    when 'taps' then
      perform public.spark_award(new.couple_id, new.from_id, 'tap', new.created_at, 'taps:' || new.id);
    when 'snaps' then
      perform public.spark_award(new.couple_id, new.author_id, 'snap', new.created_at, 'snaps:' || new.id);
    when 'daily_answers' then
      perform public.spark_award(q.couple_id, new.owner_id, 'question', new.created_at, 'daily_answers:' || new.question_id || ':' || new.owner_id)
      from public.daily_questions q where q.id = new.question_id;
    when 'calls' then
      if new.answered_at is not null and old.answered_at is null then
        -- The one who called reached out; both of us picked up.
        perform public.spark_award(new.couple_id, new.caller_id, 'call_start', new.answered_at, 'calls:' || new.id);
        perform public.spark_award(new.couple_id, new.caller_id, 'call_pickup', new.answered_at, 'calls:' || new.id);
        perform public.spark_award(new.couple_id, new.callee_id, 'call_pickup', new.answered_at, 'calls:' || new.id);
      end if;
      if new.ended_at is not null and old.ended_at is null and new.answered_at is not null then
        -- A Spark for every two minutes we talked.
        perform public.spark_award(new.couple_id, u, 'call_minutes', new.ended_at, 'calls:' || new.id,
          least(floor(extract(epoch from new.ended_at - new.answered_at) / 120)::int, 15))
        from unnest(array[new.caller_id, new.callee_id]) as u
        where new.ended_at - new.answered_at >= interval '2 minutes';
      end if;
    when 'profiles' then
      -- A new status (not clearing one).
      if new.status_at is not null and new.status_at is distinct from old.status_at
         and (new.status_text is not null or new.status_emoji is not null) then
        select c.id into v_couple from public.couples c where new.id in (c.user_a_id, c.user_b_id);
        if v_couple is not null then
          perform public.spark_award(v_couple, new.id, 'status', new.status_at, 'status:' || new.id || ':' || new.status_at);
        end if;
      end if;
  end case;
  return null;
end;
$$;

create trigger spark_award after insert on public.messages for each row execute function public.spark_trigger();
create trigger spark_award after insert on public.taps for each row execute function public.spark_trigger();
create trigger spark_award after insert on public.snaps for each row execute function public.spark_trigger();
create trigger spark_award after insert on public.daily_answers for each row execute function public.spark_trigger();
create trigger spark_award after update of answered_at, ended_at on public.calls for each row execute function public.spark_trigger();
create trigger spark_award after update of status_at on public.profiles for each row execute function public.spark_trigger();

-- ------------------------------------------------------------- rank-up push ---
-- Claim the rank-up notification for this season's newest division: returns
-- its name once, then null, however many clients ask. Used by the push
-- function with the service role.
create or replace function public.spark_claim_rank_up(p_couple uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rank int;
begin
  update public.spark_seasons s
  set notified_rank = public.spark_division(s.sparks)
  where s.couple_id = p_couple
    and s.season = date_trunc('month', public.couple_day(p_couple, now()))::date
    and public.spark_division(s.sparks) > s.notified_rank
  returning s.notified_rank into v_rank;
  return (select l.name from public.spark_ladder() l where l.idx = v_rank);
end;
$$;

revoke execute on function public.spark_claim_rank_up(uuid) from public, anon, authenticated;
grant execute on function public.spark_claim_rank_up(uuid) to service_role;

-- ---------------------------------------------------------------- realtime ---
-- The season row changes with every award, by either of us: open apps follow
-- it to move the rank chip at once.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.spark_seasons;
  end if;
end;
$$;

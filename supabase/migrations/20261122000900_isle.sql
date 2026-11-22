-- ============================================================================
-- Isle: a four-seat island trading game, the two of us and two bots.
--
--   isle_games   SHARED (couple)   one row per game; the whole game is one
--                                  JSON state (packages/shared/src/isle/rules.ts)
--
-- Rules
--   * Either of us reads and saves; nobody else sees any of it.
--   * One game is being played at a time. Starting a new one sets the old
--     one aside ('abandoned'); it isn't deleted.
--   * The rules run on the phones; the server keeps the latest state. Every
--     state carries a move count (mv), and save_isle() only takes a state
--     further on than what's saved, so two phones that both moved from the
--     same point can't both win: the late one gets 'stale', loads what's
--     there and plays its move again on top. Bot moves are worked out the
--     same way on both phones, so either may save them.
--   * Everything needs the 'isle' feature. Unpairing takes it all.
-- ============================================================================

insert into public.features (key, label, module, sort) values ('isle', 'Isle', 'connect', 138)
on conflict (key) do nothing;

update public.plans set features = array_append(features, 'isle')
where id = 'full' and not ('isle' = any (features));

update public.user_access set features = array_append(features, 'isle'), updated_at = now()
where plan_id = 'full' and not ('isle' = any (features));

create table public.isle_games (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  state      jsonb not null check (jsonb_typeof(state) = 'object' and pg_column_size(state) <= 65536),
  -- The state's move count: saves only go forwards.
  version    integer not null default 0,
  status     text not null default 'playing' check (status in ('playing', 'over', 'abandoned')),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index isle_games_one_playing on public.isle_games (couple_id) where status = 'playing';
create index isle_games_couple on public.isle_games (couple_id, created_at desc);

alter table public.isle_games enable row level security;

create policy "isle_games: couple reads" on public.isle_games for select to authenticated
  using (couple_id = (select public.current_couple_id()));
create policy "isle_games: feature isle" on public.isle_games as restrictive for all to authenticated
  using ((select public.has_feature('isle'))) with check ((select public.has_feature('isle')));

-- Writes only through the functions below.
revoke insert, update, delete on public.isle_games from authenticated, anon;

-- A new game: whatever was being played is set aside. Returns the new game's id.
create or replace function public.start_isle(p_state jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
set lock_timeout = '1s'
as $$
declare
  v_couple uuid := public.current_couple_id();
  v_id uuid;
begin
  if v_couple is null then
    raise exception 'not paired' using errcode = '42501';
  end if;
  if not public.has_feature('isle') then
    raise exception 'feature off' using errcode = '42501';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or pg_column_size(p_state) > 65536 then
    raise exception 'bad state' using errcode = '22023';
  end if;
  -- One new game every few seconds at most, however often it's pressed.
  if exists (
    select 1 from public.isle_games
    where couple_id = v_couple and created_at > clock_timestamp() - interval '3 seconds'
  ) then
    raise exception 'too fast' using errcode = '53400';
  end if;

  update public.isle_games set status = 'abandoned', updated_at = now()
  where couple_id = v_couple and status = 'playing';

  insert into public.isle_games (couple_id, state, version, created_by, updated_by)
  values (v_couple, p_state, coalesce((p_state ->> 'mv')::integer, 0), auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Save a game's state if it's further on than what's saved. Returns its move count.
create or replace function public.save_isle(p_id uuid, p_state jsonb)
returns integer
language plpgsql
security definer
set search_path = public
set lock_timeout = '1s'
as $$
declare
  v_couple uuid := public.current_couple_id();
  v_mv integer;
  v_status text;
  v_saved integer;
begin
  if v_couple is null then
    raise exception 'not paired' using errcode = '42501';
  end if;
  if not public.has_feature('isle') then
    raise exception 'feature off' using errcode = '42501';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or pg_column_size(p_state) > 65536 then
    raise exception 'bad state' using errcode = '22023';
  end if;
  begin
    v_mv := (p_state ->> 'mv')::integer;
  exception when others then
    v_mv := null;
  end;
  if v_mv is null or v_mv < 0 then
    raise exception 'bad state' using errcode = '22023';
  end if;

  -- Saved again too soon: a client stuck saving in a loop costs next to nothing.
  if exists (
    select 1 from public.isle_games
    where id = p_id and couple_id = v_couple and updated_at > clock_timestamp() - interval '100 milliseconds'
  ) then
    raise exception 'too fast' using errcode = '53400';
  end if;

  v_status := case when p_state ->> 'phase' = 'over' then 'over' else 'playing' end;
  update public.isle_games
  set state = p_state, version = v_mv, status = v_status, updated_by = auth.uid(), updated_at = now()
  where id = p_id and couple_id = v_couple and status = 'playing' and version < v_mv
  returning version into v_saved;

  if v_saved is null then
    raise exception 'stale' using errcode = '40001';
  end if;
  return v_saved;
end;
$$;

revoke execute on function public.start_isle(jsonb) from public, anon;
grant execute on function public.start_isle(jsonb) to authenticated;
revoke execute on function public.save_isle(uuid, jsonb) from public, anon;
grant execute on function public.save_isle(uuid, jsonb) to authenticated;

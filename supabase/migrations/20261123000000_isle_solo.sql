-- ============================================================================
-- Isle alone: one of us against three bots.
--
--   isle_games.owner   null   the game the two of us share
--                      me     my game alone: only I see it or save it
--
-- Rules
--   * One shared game and one game alone each can be going at once; starting
--     either sets aside only the old one of the same kind.
--   * A game alone is invisible to my partner.
--   * start_isle(p_state) still starts a shared game (older apps call it so).
-- ============================================================================

alter table public.isle_games add column owner uuid references public.profiles (id) on delete cascade;

drop index public.isle_games_one_playing;
create unique index isle_games_one_playing on public.isle_games (couple_id, coalesce(owner, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'playing';

drop policy "isle_games: couple reads" on public.isle_games;
create policy "isle_games: couple reads" on public.isle_games for select to authenticated
  using (couple_id = (select public.current_couple_id()) and (owner is null or owner = (select auth.uid())));

drop function public.start_isle(jsonb);

-- A new game, shared or alone: whatever of the same kind was being played is set aside. Returns its id.
create or replace function public.start_isle(p_state jsonb, p_solo boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
set lock_timeout = '1s'
as $$
declare
  v_couple uuid := public.current_couple_id();
  v_owner uuid := case when p_solo then auth.uid() else null end;
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
  -- One new game of each kind every few seconds at most, however often it's pressed.
  if exists (
    select 1 from public.isle_games
    where couple_id = v_couple and owner is not distinct from v_owner and created_at > clock_timestamp() - interval '3 seconds'
  ) then
    raise exception 'too fast' using errcode = '53400';
  end if;

  update public.isle_games set status = 'abandoned', updated_at = now()
  where couple_id = v_couple and owner is not distinct from v_owner and status = 'playing';

  insert into public.isle_games (couple_id, owner, state, version, created_by, updated_by)
  values (v_couple, v_owner, p_state, coalesce((p_state ->> 'mv')::integer, 0), auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Save a game's state if it's further on than what's saved: a shared one, or my own alone.
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
  where id = p_id and couple_id = v_couple and (owner is null or owner = auth.uid())
    and status = 'playing' and version < v_mv
  returning version into v_saved;

  if v_saved is null then
    raise exception 'stale' using errcode = '40001';
  end if;
  return v_saved;
end;
$$;

revoke execute on function public.start_isle(jsonb, boolean) from public, anon;
grant execute on function public.start_isle(jsonb, boolean) to authenticated;
revoke execute on function public.save_isle(uuid, jsonb) from public, anon;
grant execute on function public.save_isle(uuid, jsonb) to authenticated;

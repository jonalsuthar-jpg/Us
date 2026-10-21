-- ============================================================================
-- Our little plant: it grows on days when both of us did something for each
-- other — a snap, a "thinking of you", a message, today's question, a call
-- we picked up.
--
--   plant_days        SHARED (couple)  one row per day: when each of us first
--                                      did something. Says *that* we did,
--                                      never *what*. Written only by triggers.
--   profiles.timezone the device's IANA zone; the couple's "today" follows
--                     partner A's clock, so both of us see the same day.
--
-- The plant keeps its own history because snaps expire and daily answers are
-- private. Watering never blocks the thing that watered it: any error in
-- plant_water() is swallowed.
-- ============================================================================

-- A zone Postgres can use, or nothing.
create or replace function public.is_time_zone(p_tz text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform now() at time zone p_tz;
  return true;
exception when others then
  return false;
end;
$$;

alter table public.profiles
  add column timezone text,
  add constraint profiles_timezone_valid check (timezone is null or (char_length(timezone) <= 64 and public.is_time_zone(timezone)));

grant update (display_name, avatar_url, status_emoji, status_text, status_at, timezone) on public.profiles to authenticated;

create table public.plant_days (
  couple_id  uuid not null references public.couples (id) on delete cascade,
  day        date not null,
  a_at       timestamptz,
  b_at       timestamptz,
  primary key (couple_id, day)
);

alter table public.plant_days enable row level security;
create policy "plant_days: couple reads" on public.plant_days for select to authenticated
  using (couple_id = (select public.current_couple_id()));
revoke insert, update, delete on public.plant_days from authenticated;

-- The couple's calendar day for a moment: partner A's zone, else India.
create or replace function public.couple_day(p_couple uuid, p_at timestamptz)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (p_at at time zone coalesce(
    (select p.timezone from public.couples c join public.profiles p on p.id = c.user_a_id where c.id = p_couple),
    'Asia/Kolkata'
  ))::date;
$$;

-- One of us did something for the other. The first time each day counts.
create or replace function public.plant_water(p_couple uuid, p_user uuid, p_at timestamptz)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_is_a boolean;
begin
  select c.user_a_id = p_user into v_is_a
  from public.couples c
  where c.id = p_couple and p_user in (c.user_a_id, c.user_b_id);
  if v_is_a is null then
    return;
  end if;
  insert into public.plant_days as d (couple_id, day, a_at, b_at)
  values (p_couple, public.couple_day(p_couple, p_at), case when v_is_a then p_at end, case when not v_is_a then p_at end)
  on conflict (couple_id, day) do update
  set a_at = coalesce(d.a_at, excluded.a_at),
      b_at = coalesce(d.b_at, excluded.b_at);
exception when others then
  -- The plant is a nicety; it must never stop a message or a call.
  null;
end;
$$;

revoke execute on function public.plant_water(uuid, uuid, timestamptz), public.couple_day(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.plant_water_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  case tg_table_name
    when 'snaps' then
      perform public.plant_water(new.couple_id, new.author_id, new.created_at);
    when 'taps' then
      perform public.plant_water(new.couple_id, new.from_id, new.created_at);
    when 'messages' then
      if new.kind = 'text' then
        perform public.plant_water(new.couple_id, new.sender_id, new.created_at);
      end if;
    when 'daily_answers' then
      perform public.plant_water(q.couple_id, new.owner_id, new.created_at)
      from public.daily_questions q where q.id = new.question_id;
    when 'calls' then
      -- A call we both picked up waters it for both of us.
      if new.answered_at is not null and old.answered_at is null then
        perform public.plant_water(new.couple_id, new.caller_id, new.answered_at);
        perform public.plant_water(new.couple_id, new.callee_id, new.answered_at);
      end if;
  end case;
  return null;
end;
$$;

create trigger plant_water after insert on public.snaps for each row execute function public.plant_water_trigger();
create trigger plant_water after insert on public.taps for each row execute function public.plant_water_trigger();
create trigger plant_water after insert on public.messages for each row execute function public.plant_water_trigger();
create trigger plant_water after insert on public.daily_answers for each row execute function public.plant_water_trigger();
create trigger plant_water after update of answered_at on public.calls for each row execute function public.plant_water_trigger();

-- Start couples already using Us with the days they've already had.
insert into public.plant_days (couple_id, day, a_at, b_at)
select couple_id, day,
       min(at) filter (where is_a),
       min(at) filter (where not is_a)
from (
  select e.couple_id, e.at, e.user_id = c.user_a_id as is_a, public.couple_day(e.couple_id, e.at) as day
  from (
    select couple_id, sender_id as user_id, created_at as at from public.messages where kind = 'text'
    union all select couple_id, from_id, created_at from public.taps
    union all select couple_id, author_id, created_at from public.snaps
    union all select q.couple_id, a.owner_id, a.created_at from public.daily_answers a join public.daily_questions q on q.id = a.question_id
    union all select couple_id, caller_id, answered_at from public.calls where answered_at is not null
    union all select couple_id, callee_id, answered_at from public.calls where answered_at is not null
  ) e
  join public.couples c on c.id = e.couple_id and e.user_id in (c.user_a_id, c.user_b_id)
) x
group by couple_id, day
on conflict do nothing;

-- ------------------------------------------------------------ evening nudge ---
-- 19:30 India time: if only one of us watered it today, the other hears about
-- it. Same Vault secrets as snaps-cleanup.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('plant-nudge', '0 14 * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/plant-nudge',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        body := '{}'::jsonb
      )
    $job$);
  end if;
end;
$$;

-- Spark Rank and Growth (goals, mood check-ins, worries, love languages) are
-- gone from both apps. Their data goes with them: this cannot be undone.
-- Spark's trigger ran on every message, tap, snap, daily answer, call update
-- and status change, and its season row streamed to every open app.

-- ------------------------------------------------------------ Spark Rank ---
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime drop table public.spark_seasons;
  end if;
end;
$$;

-- Dropping the trigger function takes its triggers on messages, taps, snaps,
-- daily_answers, calls and profiles with it.
drop function if exists public.spark_trigger() cascade;

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'spark\_%'
  loop
    execute format('drop function %s cascade', f);
  end loop;
end;
$$;

drop table if exists public.spark_events cascade;
drop table if exists public.spark_seasons cascade;

-- ---------------------------------------------------------------- Growth ---
drop function if exists public.partner_nudges(int) cascade;
drop table if exists public.goals cascade;
drop table if exists public.mood_checkins cascade;
drop table if exists public.insecurity_checkins cascade;
drop table if exists public.love_language_results cascade;

-- -------------------------------------------------------------- Features ---
update public.plans set features = array(
  select f from unnest(features) f where f not in ('spark', 'goals', 'mood', 'worries', 'love_languages')
);
update public.user_access set features = array(
  select f from unnest(features) f where f not in ('spark', 'goals', 'mood', 'worries', 'love_languages')
);
delete from public.features where key in ('spark', 'goals', 'mood', 'worries', 'love_languages');

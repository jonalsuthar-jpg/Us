-- ============================================================================
-- Plans that repeat, reminders before a plan, and "on this day".
--
--   calendar_events.repeat         none | weekly | monthly | yearly
--   calendar_events.repeat_tz      the zone the plan was made in: repeats
--                                  land on that calendar (see recurrence.ts)
--   calendar_events.skip_dates     occurrences taken out, as local dates
--   calendar_events.remind_before  minutes before (0, 15, 60, 1440), or none
--   push_sent                      SERVER ONLY  which reminders have gone,
--                                  so none is sent twice
--
-- Every 5 minutes the reminders function sends what's due: plan reminders
-- to both of us, and at about 9:00 our time a memory from this day in an
-- earlier year. Same Vault secrets as plant-nudge.
-- ============================================================================

alter table public.calendar_events
  add column repeat text not null default 'none' check (repeat in ('none', 'weekly', 'monthly', 'yearly')),
  add column repeat_tz text check (repeat_tz is null or (char_length(repeat_tz) <= 64 and public.is_time_zone(repeat_tz))),
  add column skip_dates date[] not null default '{}' check (cardinality(skip_dates) <= 500),
  add column remind_before smallint check (remind_before in (0, 15, 60, 1440));

create index calendar_events_repeating_idx on public.calendar_events (couple_id) where repeat <> 'none';
create index calendar_events_reminders_idx on public.calendar_events (starts_at) where remind_before is not null;

create table public.push_sent (
  key  text primary key check (char_length(key) <= 200),
  at   timestamptz not null default now()
);
alter table public.push_sent enable row level security;
revoke all on public.push_sent from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('reminders', '*/5 * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        body := '{}'::jsonb
      )
    $job$);
    -- Old dedupe keys aren't needed once their moment has passed.
    perform cron.schedule('push-sent-tidy', '17 3 * * *', $job$ delete from public.push_sent where at < now() - interval '14 days' $job$);
  end if;
end;
$$;

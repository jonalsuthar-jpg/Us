-- ============================================================================
-- What each of us wants to be told, and when.
--
--   notification_prefs  PRIVATE (owner)  groups I've turned off, my quiet
--                                        hours (minutes after my local
--                                        midnight, in profiles.timezone),
--                                        and whether my lock screen hides
--                                        who and what a push is about.
--
-- Read by the push functions with the service role. Calls and "got home"
-- are always delivered whatever is set here (see _shared/notify-rules.ts).
-- ============================================================================

create table public.notification_prefs (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  off          text[] not null default '{}' check (cardinality(off) <= 20),
  quiet_start  smallint check (quiet_start between 0 and 1439),
  quiet_end    smallint check (quiet_end between 0 and 1439),
  hide_preview boolean not null default false,
  updated_at   timestamptz not null default now(),
  constraint notification_prefs_quiet_pair check ((quiet_start is null) = (quiet_end is null))
);

alter table public.notification_prefs enable row level security;
create policy "notification_prefs: mine" on public.notification_prefs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.notification_prefs from anon;
grant select, insert, update, delete on public.notification_prefs to authenticated;

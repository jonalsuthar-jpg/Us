-- Diagnostics: the push function records what happened to each call push
-- (sent / skipped / failed and why). Server-only: RLS on, no policies, so no
-- client can read or write it. Temporary; dropped once calls ring reliably.
create table public.push_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  category   text not null,
  outcome    text not null,
  detail     jsonb
);
alter table public.push_log enable row level security;
revoke all on public.push_log from anon, authenticated;

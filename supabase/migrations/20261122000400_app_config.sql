-- ============================================================================
-- App settings the server can change at any moment, read by every app.
--
--   app_config   key → value. Everyone signed in reads; admins write.
--
--   required_update_after   (timestamptz, as text) apps whose running update
--                           is older than this fetch the newest and restart
--                           at once, instead of waiting for a cold start.
--                           Publish the fix first, then set it to now.
-- ============================================================================

create table public.app_config (
  key        text primary key check (key ~ '^[a-z_]{1,40}$'),
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

create policy "app_config: everyone signed in reads" on public.app_config for select to authenticated using (true);
revoke insert, update, delete on public.app_config from authenticated, anon;

-- Set one setting. Admins only, and logged.
create or replace function public.admin_set_config(p_key text, p_value jsonb)
returns public.app_config
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_before public.app_config;
  v_after public.app_config;
begin
  perform public.admin_guard();
  select * into v_before from public.app_config where key = p_key;
  insert into public.app_config (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()
  returning * into v_after;
  perform public.admin_log('config', null, null, to_jsonb(v_before), to_jsonb(v_after));
  return v_after;
end;
$$;

revoke execute on function public.admin_set_config(text, jsonb) from public, anon;
grant execute on function public.admin_set_config(text, jsonb) to authenticated;

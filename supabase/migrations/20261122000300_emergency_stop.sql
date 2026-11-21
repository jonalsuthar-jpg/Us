-- ============================================================================
-- An emergency stop for a feature: off for everyone, the founding couple too.
--
-- A normal pause (features.enabled) never touches protected people, by
-- design. But when a feature is hurting the service (a bug flooding the
-- database), it has to stop for every app at once, old versions included:
-- the database refuses it (has_feature), and open apps see it go within a
-- second (they watch the features table) and close it.
-- ============================================================================

alter table public.features add column stopped boolean not null default false;

create or replace function public.user_has_feature(p_user uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_access a
    where a.user_id = p_user
      and a.status = 'approved'
      and (a.protected
        or (p_feature = any (a.features)
          and not exists (select 1 from public.features f where f.key = p_feature and not f.enabled)))
  )
  and not exists (select 1 from public.features f where f.key = p_feature and f.stopped);
$$;

create or replace function public.my_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', coalesce(a.status::text, 'pending'),
    'reason', a.reason,
    'is_admin', coalesce(a.is_admin and a.status = 'approved', false),
    'features', coalesce((
      select jsonb_agg(f.key order by f.sort) from public.features f where public.has_feature(f.key)
    ), '[]'::jsonb),
    'paused', coalesce((
      select jsonb_object_agg(f.key, coalesce(f.disabled_message, ''))
      from public.features f
      where f.stopped or (not f.enabled and not coalesce(a.protected, false))
    ), '{}'::jsonb),
    'announcement', (
      select jsonb_build_object('id', n.id, 'body', n.body, 'tone', n.tone)
      from public.announcements n
      where n.starts_at <= now() and (n.ends_at is null or n.ends_at > now())
      order by n.starts_at desc
      limit 1
    )
  )
  from (select (select auth.uid()) as uid) me
  left join public.user_access a on a.user_id = me.uid;
$$;

-- Stop (or restart) a feature for everyone. Admins only, and logged.
create or replace function public.admin_stop_feature(p_key text, p_stopped boolean, p_message text default null)
returns public.features
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_before public.features;
  v_after public.features;
begin
  perform public.admin_guard();
  select * into v_before from public.features where key = p_key;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.features
  set stopped = p_stopped,
      disabled_message = case when p_stopped then coalesce(nullif(trim(p_message), ''), disabled_message) else disabled_message end,
      updated_at = now()
  where key = p_key
  returning * into v_after;
  perform public.admin_log('feature_stop', null, null, to_jsonb(v_before), to_jsonb(v_after));
  return v_after;
end;
$$;

revoke execute on function public.admin_stop_feature(text, boolean, text) from public, anon;
grant execute on function public.admin_stop_feature(text, boolean, text) to authenticated;

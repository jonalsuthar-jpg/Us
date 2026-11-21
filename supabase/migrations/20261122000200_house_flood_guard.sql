-- ============================================================================
-- Our House: a flood guard on set_house_item.
--
-- A bug in one release kept a closed house saving the same thing every frame.
-- Those saves queued on the row and held the API's database connections, so
-- everything else (answers, the web's first load) waited and timed out.
-- Now a save of the same thing within 200 ms of the last is refused at once,
-- before any lock, and no save waits more than a second for one. The refusal
-- isn't 'stale', so the app doesn't reload over it.
-- ============================================================================

create or replace function public.set_house_item(p_key text, p_state jsonb, p_version integer)
returns integer
language plpgsql
security definer
set search_path = public
set lock_timeout = '1s'
as $$
declare
  v_couple uuid := public.current_couple_id();
  v_version integer;
begin
  if v_couple is null then
    raise exception 'not paired' using errcode = '42501';
  end if;
  if not public.has_feature('house') then
    raise exception 'feature off' using errcode = '42501';
  end if;
  if p_key is null or p_key !~ '^[a-z0-9:_-]{1,64}$' then
    raise exception 'bad key' using errcode = '22023';
  end if;

  -- Saved again too soon: a client stuck saving every frame costs next to nothing.
  if exists (
    select 1 from public.house_items
    where couple_id = v_couple and item_key = p_key and updated_at > clock_timestamp() - interval '200 milliseconds'
  ) then
    raise exception 'too fast' using errcode = '53400';
  end if;

  if p_state is null then
    delete from public.house_items where couple_id = v_couple and item_key = p_key and version = p_version;
    if not found then
      raise exception 'stale' using errcode = '40001';
    end if;
    return 0;
  end if;

  if jsonb_typeof(p_state) <> 'object' or pg_column_size(p_state) > 2048 then
    raise exception 'bad state' using errcode = '22023';
  end if;

  if coalesce(p_version, 0) = 0 then
    if (select count(*) from public.house_items where couple_id = v_couple) >= 400 then
      raise exception 'house full' using errcode = '54000';
    end if;
    insert into public.house_items (couple_id, item_key, state, updated_by)
    values (v_couple, p_key, p_state, auth.uid())
    on conflict (couple_id, item_key) do nothing
    returning version into v_version;
  else
    update public.house_items
    set state = p_state, version = version + 1, updated_by = auth.uid(), updated_at = now()
    where couple_id = v_couple and item_key = p_key and version = p_version
    returning version into v_version;
  end if;

  if v_version is null then
    raise exception 'stale' using errcode = '40001';
  end if;
  return v_version;
end;
$$;

revoke execute on function public.set_house_item(text, jsonb, integer) from public, anon;
grant execute on function public.set_house_item(text, jsonb, integer) to authenticated;

-- ============================================================================
-- Our House, saved: what stays as we left it.
--
--   house_items   SHARED (couple)   one row per thing in the house: a lamp on,
--                                   a door open, the mug where it was put
--                                   down, a sofa moved and recoloured, each
--                                   of our avatar looks, day or night
--
-- Rules
--   * Either of us reads and changes everything; nobody else sees any of it.
--   * Changes go through set_house_item() with the version I last saw, so two
--     of us moving the same thing at once can't silently undo each other:
--     the late one gets 'stale' and reloads. A null state removes the row
--     (something added while decorating, taken away again).
--   * Everything needs the 'house' feature. Unpairing takes it all.
-- ============================================================================

create table public.house_items (
  couple_id  uuid not null references public.couples (id) on delete cascade,
  item_key   text not null check (item_key ~ '^[a-z0-9:_-]{1,64}$'),
  state      jsonb not null check (jsonb_typeof(state) = 'object' and pg_column_size(state) <= 2048),
  version    integer not null default 1,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (couple_id, item_key)
);

alter table public.house_items enable row level security;

create policy "house_items: couple reads" on public.house_items for select to authenticated
  using (couple_id = (select public.current_couple_id()));
create policy "house_items: feature house" on public.house_items as restrictive for all to authenticated
  using ((select public.has_feature('house'))) with check ((select public.has_feature('house')));

-- Writes only through the function below.
revoke insert, update, delete on public.house_items from authenticated, anon;

-- Set (or with a null state, remove) one thing, if it's still at the version
-- I saw: 0 for something new. Returns the new version. A house holds at most
-- 400 things.
create or replace function public.set_house_item(p_key text, p_state jsonb, p_version integer)
returns integer
language plpgsql
security definer
set search_path = public
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

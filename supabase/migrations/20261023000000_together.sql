-- ============================================================================
-- Together: countdowns, shared lists, "thinking of you" taps, location sharing
-- and "let me know when you're home" checks.
--
-- Same rules as everywhere else: shared rows are couple-scoped, rows are
-- always created as yourself, and state that matters to the other person
-- (arrival, reveal) moves only through SECURITY DEFINER functions.
-- ============================================================================

-- ------------------------------------------------------------- countdowns ---
-- Trips, birthdays, anniversaries. Yearly ones repeat (birthdays). Day-count
-- milestones ("100 days together") are computed from couples.paired_at.
create table public.countdowns (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  emoji       text check (emoji is null or char_length(emoji) <= 16),
  on_date     date not null,
  yearly      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index countdowns_couple_idx on public.countdowns (couple_id, on_date);

alter table public.countdowns enable row level security;
create policy "countdowns: couple reads" on public.countdowns for select to authenticated
  using (couple_id = (select public.current_couple_id()));
create policy "countdowns: add as self" on public.countdowns for insert to authenticated
  with check (couple_id = (select public.current_couple_id()) and created_by = (select auth.uid()));
create policy "countdowns: couple edits" on public.countdowns for update to authenticated
  using (couple_id = (select public.current_couple_id()))
  with check (couple_id = (select public.current_couple_id()));
create policy "countdowns: couple deletes" on public.countdowns for delete to authenticated
  using (couple_id = (select public.current_couple_id()));
revoke update on public.countdowns from authenticated;
grant update (title, emoji, on_date, yearly) on public.countdowns to authenticated;

-- ----------------------------------------------------------- shared lists ---
create table public.list_items (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  list        text not null check (list in ('groceries', 'bucket', 'watch', 'read')),
  text        text not null check (char_length(text) between 1 and 200),
  note        text check (note is null or char_length(note) <= 500),
  added_by    uuid not null references public.profiles (id) on delete cascade,
  done_at     timestamptz,
  done_by     uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint list_items_done_shape check ((done_at is null) = (done_by is null))
);
create index list_items_couple_list_idx on public.list_items (couple_id, list, created_at);

alter table public.list_items enable row level security;
create policy "list_items: couple reads" on public.list_items for select to authenticated
  using (couple_id = (select public.current_couple_id()));
create policy "list_items: add as self" on public.list_items for insert to authenticated
  with check (
    couple_id = (select public.current_couple_id())
    and added_by = (select auth.uid())
    and done_at is null and done_by is null
  );
create policy "list_items: couple edits" on public.list_items for update to authenticated
  using (couple_id = (select public.current_couple_id()))
  with check (couple_id = (select public.current_couple_id()) and (done_by is null or (select public.is_couple_member(done_by))));
create policy "list_items: couple deletes" on public.list_items for delete to authenticated
  using (couple_id = (select public.current_couple_id()));
revoke update on public.list_items from authenticated;
grant update (text, note, done_at, done_by) on public.list_items to authenticated;

-- ------------------------------------------------------ thinking of you ---
create table public.taps (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  from_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index taps_couple_created_idx on public.taps (couple_id, created_at desc);

alter table public.taps enable row level security;
create policy "taps: couple reads" on public.taps for select to authenticated
  using (couple_id = (select public.current_couple_id()));
create policy "taps: send as self" on public.taps for insert to authenticated
  with check (couple_id = (select public.current_couple_id()) and from_id = (select auth.uid()));
revoke update, delete on public.taps from authenticated;

-- A tap is a feeling, not a flood: at most one every 10 seconds.
create or replace function public.taps_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.taps t
    where t.from_id = new.from_id and t.created_at > now() - interval '10 seconds'
  ) then
    raise exception 'too_soon' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;
create trigger taps_rate_limit before insert on public.taps
  for each row execute function public.taps_rate_limit();

-- ------------------------------------------------------- location sharing ---
-- One row per person. Opt-in and time-boxed: my partner can read my position
-- only while sharing_until is in the future. Stopping clears the coordinates.
create table public.location_shares (
  owner_id      uuid primary key references public.profiles (id) on delete cascade,
  couple_id     uuid not null references public.couples (id) on delete cascade,
  lat           double precision check (lat is null or lat between -90 and 90),
  lng           double precision check (lng is null or lng between -180 and 180),
  accuracy_m    real check (accuracy_m is null or accuracy_m >= 0),
  updated_at    timestamptz,
  sharing_until timestamptz,
  constraint location_shares_coords_together check ((lat is null) = (lng is null)),
  constraint location_shares_max_window check (sharing_until is null or sharing_until <= now() + interval '25 hours')
);

alter table public.location_shares enable row level security;
create policy "location_shares: owner manages" on public.location_shares for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and couple_id = (select public.current_couple_id()));
create policy "location_shares: partner reads while shared" on public.location_shares for select to authenticated
  using (
    couple_id = (select public.current_couple_id())
    and owner_id = (select public.current_partner_id())
    and sharing_until > now()
  );

create or replace function public.location_shares_scrub()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sharing_until is null or new.sharing_until <= now() then
    new.lat := null;
    new.lng := null;
    new.accuracy_m := null;
  end if;
  if new.lat is not null then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger location_shares_scrub before insert or update on public.location_shares
  for each row execute function public.location_shares_scrub();

-- ----------------------------------------------------- "tell me you're home" ---
-- The traveller is whoever is on their way: either I ask my partner to let me
-- know, or I offer to let them know. Only the traveller marks it arrived.
create table public.arrival_checks (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples (id) on delete cascade,
  requested_by  uuid not null references public.profiles (id) on delete cascade,
  traveller_id  uuid not null references public.profiles (id) on delete cascade,
  label         text not null default 'home' check (char_length(label) between 1 and 40),
  created_at    timestamptz not null default now(),
  arrived_at    timestamptz,
  cancelled_at  timestamptz
);
create unique index arrival_checks_one_open_idx on public.arrival_checks (traveller_id)
  where arrived_at is null and cancelled_at is null;
create index arrival_checks_couple_idx on public.arrival_checks (couple_id, created_at desc);

alter table public.arrival_checks enable row level security;
create policy "arrival_checks: couple reads" on public.arrival_checks for select to authenticated
  using (couple_id = (select public.current_couple_id()));
create policy "arrival_checks: request as self" on public.arrival_checks for insert to authenticated
  with check (
    couple_id = (select public.current_couple_id())
    and requested_by = (select auth.uid())
    and (select public.is_couple_member(traveller_id))
    and arrived_at is null and cancelled_at is null
  );
revoke update, delete on public.arrival_checks from authenticated;

-- The traveller says they've arrived.
create or replace function public.mark_arrived(p_id uuid)
returns public.arrival_checks
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.arrival_checks;
begin
  select * into v_row from public.arrival_checks where id = p_id for update;
  if not found or v_row.couple_id is distinct from public.current_couple_id() then
    raise exception 'check_not_found' using errcode = 'P0002';
  end if;
  if v_row.traveller_id <> auth.uid() then
    raise exception 'only the traveller can arrive' using errcode = '42501';
  end if;
  if v_row.arrived_at is null and v_row.cancelled_at is null then
    update public.arrival_checks set arrived_at = now() where id = p_id returning * into v_row;
  end if;
  return v_row;
end;
$$;

-- Either of us can call it off.
create or replace function public.cancel_arrival(p_id uuid)
returns public.arrival_checks
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.arrival_checks;
begin
  select * into v_row from public.arrival_checks where id = p_id for update;
  if not found or v_row.couple_id is distinct from public.current_couple_id() then
    raise exception 'check_not_found' using errcode = 'P0002';
  end if;
  if v_row.arrived_at is null and v_row.cancelled_at is null then
    update public.arrival_checks set cancelled_at = now() where id = p_id returning * into v_row;
  end if;
  return v_row;
end;
$$;

revoke all on public.countdowns, public.list_items, public.taps, public.location_shares, public.arrival_checks from anon;
revoke execute on function public.mark_arrived(uuid), public.cancel_arrival(uuid), public.taps_rate_limit() from public, anon;
grant execute on function public.mark_arrived(uuid), public.cancel_arrival(uuid) to authenticated;

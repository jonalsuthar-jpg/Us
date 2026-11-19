-- ============================================================================
-- Time capsules: a message written now and sealed until a date and time.
--
--   time_capsules            the sealed message, encrypted on the sender's
--                            device for the chat message it will become (the
--                            same id), so the server never reads it. Only the
--                            sender can see it, change it or cancel it while
--                            it waits; the partner can't even see it exists.
--   capsules_waiting_for_me  how many are sealed for me and when the next
--                            opens: a teaser, nothing more.
--   deliver_due_capsules     run by the reminders function every 5 minutes:
--                            each due capsule becomes a chat message, once.
--   messages.capsule_sealed_at  marks a message that came from a capsule.
-- ============================================================================

alter table public.messages add column capsule_sealed_at timestamptz;

create table public.time_capsules (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  sender_id    uuid not null references public.profiles (id) on delete cascade,
  ciphertext   text not null check (char_length(ciphertext) <= 24000),
  key_version  smallint not null,
  deliver_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  delivered_at timestamptz,
  foreign key (couple_id, key_version) references public.chat_keys (couple_id, key_version) on delete cascade,
  constraint time_capsules_window check (deliver_at <= created_at + interval '10 years 1 day')
);
create index time_capsules_due_idx on public.time_capsules (deliver_at) where delivered_at is null;
create index time_capsules_sender_idx on public.time_capsules (sender_id, deliver_at);

alter table public.time_capsules enable row level security;
create policy "time_capsules: mine" on public.time_capsules for select to authenticated
  using (sender_id = (select auth.uid()) and couple_id = (select public.current_couple_id()));
create policy "time_capsules: seal" on public.time_capsules for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and couple_id = (select public.current_couple_id())
    and delivered_at is null
    and deliver_at >= now() + interval '10 minutes'
  );
create policy "time_capsules: change while sealed" on public.time_capsules for update to authenticated
  using (sender_id = (select auth.uid()) and delivered_at is null)
  with check (sender_id = (select auth.uid()) and delivered_at is null and deliver_at >= now() + interval '10 minutes');
create policy "time_capsules: cancel while sealed" on public.time_capsules for delete to authenticated
  using (sender_id = (select auth.uid()) and delivered_at is null);
create policy "time_capsules: feature chat" on public.time_capsules as restrictive for all to authenticated
  using ((select public.has_feature('chat'))) with check ((select public.has_feature('chat')));
revoke update on public.time_capsules from authenticated;
grant update (ciphertext, key_version, deliver_at) on public.time_capsules to authenticated;

-- At most 50 waiting at once, per person.
create or replace function public.time_capsules_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.time_capsules where sender_id = new.sender_id and delivered_at is null) >= 50 then
    raise exception 'too_many_capsules' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger time_capsules_limit before insert on public.time_capsules for each row execute function public.time_capsules_limit();

-- The teaser: how many my partner has sealed for me, and when the next one opens.
create or replace function public.capsules_waiting_for_me()
returns table (waiting int, next_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int, min(t.deliver_at)
  from public.time_capsules t
  where t.couple_id = public.current_couple_id()
    and t.sender_id is distinct from (select auth.uid())
    and t.delivered_at is null;
$$;
revoke execute on function public.capsules_waiting_for_me() from public, anon;
grant execute on function public.capsules_waiting_for_me() to authenticated;

-- Every capsule that's due becomes a chat message (same id and ciphertext), once.
create or replace function public.deliver_due_capsules()
returns table (id uuid, couple_id uuid, sender_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    update public.time_capsules t set delivered_at = now()
    where t.delivered_at is null and t.deliver_at <= now()
    returning t.id, t.couple_id, t.sender_id, t.ciphertext, t.key_version, t.created_at
  ), sent as (
    insert into public.messages (id, couple_id, sender_id, kind, ciphertext, key_version, capsule_sealed_at)
    select d.id, d.couple_id, d.sender_id, 'text', d.ciphertext, d.key_version, d.created_at from due d
    on conflict on constraint messages_pkey do nothing
    returning messages.id
  )
  select d.id, d.couple_id, d.sender_id from due d where d.id in (select s.id from sent s);
end;
$$;
revoke execute on function public.deliver_due_capsules() from public, anon, authenticated;
grant execute on function public.deliver_due_capsules() to service_role;

-- "Open now": the sender opens one of theirs early.
create or replace function public.open_capsule_now(p_id uuid)
returns public.messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.time_capsules;
  m public.messages;
begin
  update public.time_capsules set delivered_at = now()
  where time_capsules.id = p_id and time_capsules.sender_id = (select auth.uid()) and time_capsules.delivered_at is null
    and time_capsules.couple_id = public.current_couple_id()
  returning * into c;
  if not found then
    raise exception 'capsule_not_found' using errcode = 'P0002';
  end if;
  insert into public.messages (id, couple_id, sender_id, kind, ciphertext, key_version, capsule_sealed_at)
  values (c.id, c.couple_id, c.sender_id, 'text', c.ciphertext, c.key_version, c.created_at)
  returning * into m;
  return m;
end;
$$;
revoke execute on function public.open_capsule_now(uuid) from public, anon;
grant execute on function public.open_capsule_now(uuid) to authenticated;

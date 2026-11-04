-- ============================================================================
-- A birthday room: one surprise, from Jonal for Parul, 10 Nov 2026.
--
--   birthday_rooms    SHARED (couple), TIME-LOCKED  the story she taps through
--                                    (`content`), written and previewed by the
--                                    one who made it. The one it's for can't
--                                    see the row, or any of its files, until
--                                    `unlock_at` (midnight in her zone).
--                                    Her side only changes through
--                                    birthday_open / birthday_mark /
--                                    birthday_keep.
--   storage "birthday"               the voice note and photos, under
--                                    <couple_id>/<room_id>/…, with the same lock.
--
-- Not a feature anyone can switch on: there's one row, seeded here, and the
-- apps show the room only when a row comes back.
-- ============================================================================

create table public.birthday_rooms (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  from_id      uuid not null references public.profiles (id) on delete cascade,
  for_id       uuid not null references public.profiles (id) on delete cascade,
  -- As it reads on the banner: "Happy Birthday, Parul ✨".
  name         text not null check (char_length(name) between 1 and 40),
  unlock_at    timestamptz not null,
  -- The festive Home is for the day itself; the room stays after.
  ends_at      timestamptz not null,
  content      jsonb not null default '{}'::jsonb check (pg_column_size(content) <= 65536),
  opened_at    timestamptz,
  notified_at  timestamptz,
  -- Her ticks on the quiz: {"0": true, "1": false, …}.
  marks        jsonb not null default '{}'::jsonb,
  memory_id    uuid references public.memories (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint birthday_rooms_two_of_us check (from_id <> for_id),
  constraint birthday_rooms_window check (ends_at > unlock_at)
);
create index birthday_rooms_couple_idx on public.birthday_rooms (couple_id);
create index birthday_rooms_unnotified_idx on public.birthday_rooms (unlock_at) where notified_at is null;

-- Who can see a room right now: the maker always, the birthday person from midnight.
create or replace function public.birthday_visible(p_room public.birthday_rooms)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_room.couple_id = public.current_couple_id()
     and (p_room.from_id = auth.uid() or (p_room.for_id = auth.uid() and now() >= p_room.unlock_at));
$$;

alter table public.birthday_rooms enable row level security;
create policy "birthday_rooms: maker always, birthday person from midnight" on public.birthday_rooms for select to authenticated
  using (
    couple_id = (select public.current_couple_id())
    and (from_id = (select auth.uid()) or (for_id = (select auth.uid()) and now() >= unlock_at))
  );
-- The maker edits the story; nothing else about the row.
create policy "birthday_rooms: maker edits" on public.birthday_rooms for update to authenticated
  using (couple_id = (select public.current_couple_id()) and from_id = (select auth.uid()))
  with check (couple_id = (select public.current_couple_id()) and from_id = (select auth.uid()));
revoke insert, update, delete on public.birthday_rooms from authenticated;
revoke all on public.birthday_rooms from anon;
grant update (content) on public.birthday_rooms to authenticated;

-- A room I may act on as the birthday person, once it has opened.
create or replace function public.birthday_mine(p_id uuid)
returns public.birthday_rooms
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.birthday_rooms;
begin
  select * into v_row from public.birthday_rooms
  where id = p_id and for_id = auth.uid() and couple_id = public.current_couple_id() and now() >= unlock_at;
  if not found then
    raise exception 'room_not_found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- She opened it (the first time counts).
create or replace function public.birthday_open(p_id uuid)
returns public.birthday_rooms
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.birthday_rooms := public.birthday_mine(p_id);
begin
  update public.birthday_rooms set opened_at = coalesce(opened_at, now()) where id = v_row.id returning * into v_row;
  return v_row;
end;
$$;

-- She ticks one of my quiz answers right or wrong.
create or replace function public.birthday_mark(p_id uuid, p_index int, p_right boolean)
returns public.birthday_rooms
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.birthday_rooms := public.birthday_mine(p_id);
begin
  if p_index is null or p_index < 0 or p_index >= 20 then
    raise exception 'bad_question' using errcode = '22023';
  end if;
  update public.birthday_rooms
  set marks = marks || jsonb_build_object(p_index::text, p_right)
  where id = v_row.id
  returning * into v_row;
  return v_row;
end;
$$;

-- "Keep this in Memories": once, as a memory of the day.
create or replace function public.birthday_keep(p_id uuid)
returns public.birthday_rooms
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.birthday_rooms := public.birthday_mine(p_id);
  v_memory uuid;
begin
  if v_row.memory_id is not null then
    return v_row;
  end if;
  insert into public.memories (couple_id, created_by, title, body, happened_on, kind)
  values (
    v_row.couple_id, auth.uid(), 'My birthday room 🎂',
    'The birthday surprise, kept. Open it again from Home.',
    (v_row.unlock_at at time zone coalesce((select timezone from public.profiles where id = v_row.for_id), 'Asia/Kolkata'))::date,
    'moment'
  )
  returning id into v_memory;
  update public.birthday_rooms set memory_id = v_memory where id = v_row.id returning * into v_row;
  return v_row;
end;
$$;

-- "Us, so far": totals the server can count without reading anything we wrote.
create or replace function public.birthday_totals()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'messages', (select count(*) from public.messages m where m.couple_id = c.id and m.kind = 'text'),
    'first_message_at', (select min(m.created_at) from public.messages m where m.couple_id = c.id and m.kind = 'text'),
    'calls', (select count(*) from public.calls k where k.couple_id = c.id and k.answered_at is not null),
    'call_seconds', (
      select coalesce(sum(extract(epoch from (k.ended_at - k.answered_at))), 0)::bigint
      from public.calls k
      where k.couple_id = c.id and k.answered_at is not null and k.ended_at > k.answered_at
    ),
    'paired_at', c.paired_at
  )
  from public.couples c
  where c.id = public.current_couple_id()
    and exists (select 1 from public.birthday_rooms r where public.birthday_visible(r));
$$;

revoke execute on function public.birthday_mine(uuid) from public, anon, authenticated;
revoke execute on function public.birthday_open(uuid), public.birthday_mark(uuid, int, boolean), public.birthday_keep(uuid), public.birthday_totals() from public, anon;
grant execute on function public.birthday_open(uuid), public.birthday_mark(uuid, int, boolean), public.birthday_keep(uuid), public.birthday_totals() to authenticated;

-- --------------------------------------------------------------- storage ---
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('birthday', 'birthday', false, 26214400,
            array['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
    on conflict (id) do nothing;

    -- <couple_id>/<room_id>/<file>: readable when the room is.
    execute $p$
      create policy "birthday bucket: reads with the room" on storage.objects for select to authenticated
      using (
        bucket_id = 'birthday'
        and exists (
          select 1 from public.birthday_rooms r
          where r.id::text = (storage.foldername(name))[2]
            and r.couple_id::text = (storage.foldername(name))[1]
            and public.birthday_visible(r)
        )
      )
    $p$;
    execute $p$
      create policy "birthday bucket: maker uploads" on storage.objects for insert to authenticated
      with check (
        bucket_id = 'birthday'
        and exists (
          select 1 from public.birthday_rooms r
          where r.id::text = (storage.foldername(name))[2]
            and r.couple_id::text = (storage.foldername(name))[1]
            and r.couple_id = (select public.current_couple_id())
            and r.from_id = (select auth.uid())
        )
      )
    $p$;
    execute $p$
      create policy "birthday bucket: maker removes" on storage.objects for delete to authenticated
      using (
        bucket_id = 'birthday'
        and exists (
          select 1 from public.birthday_rooms r
          where r.id::text = (storage.foldername(name))[2]
            and r.couple_id::text = (storage.foldername(name))[1]
            and r.couple_id = (select public.current_couple_id())
            and r.from_id = (select auth.uid())
        )
      )
    $p$;
  end if;
end;
$$;

-- ------------------------------------------------------------------ seed ---
-- Jonal → Parul, midnight to midnight on 10 Nov in her zone. The story starts
-- as a draft (`drafts` lists what's still placeholder); Jonal fills it in from
-- the preview in the app.
insert into public.birthday_rooms (couple_id, from_id, for_id, name, unlock_at, ends_at, content)
select c.id, j.id, p.id, 'Parul',
       '2026-11-10 00:00'::timestamp at time zone tz.zone,
       '2026-11-11 00:00'::timestamp at time zone tz.zone,
       $json${
         "drafts": ["notes", "moments", "quiz", "gift"],
         "wish": { "line": "Close your eyes, make a wish… now blow." },
         "song": { "caption": "I sang this for you. Please don’t judge 🙈", "audio_path": null },
         "notes": [
           "You laugh at your own jokes before you finish them.",
           "You always ask how my day was, even when yours was busy.",
           "You notice the small things other people miss.",
           "You get excited about food in the best way.",
           "You make ordinary days feel lighter."
         ],
         "moments": [
           { "text": "Our first call, the one that went on way longer than planned.", "date": null, "photo_path": null },
           { "text": "That inside joke we still can’t explain to anyone.", "date": null, "photo_path": null },
           { "text": "The day you sent me that song.", "date": null, "photo_path": null }
         ],
         "quiz": [
           { "q": "Her favourite food?", "a": "✏️ Your answer" },
           { "q": "Her comfort movie?", "a": "✏️ Your answer" },
           { "q": "What she orders at a café?", "a": "✏️ Your answer" },
           { "q": "Coffee or chai?", "a": "✏️ Your answer" },
           { "q": "Morning person or night owl?", "a": "✏️ Your answer" }
         ],
         "gift": { "title": "One coffee or chai, my treat ☕", "body": "Whenever you want. No expiry date." },
         "cake": { "line": "Let’s cut it together. I’ll pick up." },
         "card": { "line": "Let’s sign a birthday card together, live." },
         "ending": { "line": "Happy birthday. I’m really glad I met you. 🙂" }
       }$json$::jsonb
from auth.users ju
join public.profiles j on j.id = ju.id
join auth.users pu on pu.email = 'parulsutradhar11@gmail.com'
join public.profiles p on p.id = pu.id
join public.couples c on (c.user_a_id, c.user_b_id) in ((j.id, p.id), (p.id, j.id))
cross join lateral (
  -- profiles.timezone is already checked to be a zone Postgres knows.
  select coalesce(p.timezone, 'Asia/Kolkata') as zone
) tz
where ju.email = 'jonalsuthar@gmail.com'
  and not exists (select 1 from public.birthday_rooms);

-- No couple found means a typo above, not "no birthday": stop here rather than ship an empty room.
do $$
begin
  if not exists (select 1 from public.birthday_rooms) then
    raise exception 'birthday room not seeded: Jonal and Parul aren''t a couple here';
  end if;
end;
$$;

-- ----------------------------------------------------------- the midnight ---
-- Every 5 minutes: a room that just opened sends its push. Same Vault secrets
-- as plant-nudge.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('birthday-unlock', '*/5 * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/birthday-unlock',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        body := '{}'::jsonb
      )
      where exists (select 1 from public.birthday_rooms where notified_at is null and unlock_at <= now())
    $job$);
  end if;
end;
$$;

-- The birthday has been and gone. Its story stays, read-only, opened from its
-- card in Memories; everything that made the day (the midnight push, editing,
-- quiz ticks, "keep this", the old storage bucket) goes.

-- Every room has its memory: the one kept on the day, or one made now.
do $$
declare
  r public.birthday_rooms;
  v_memory uuid;
begin
  for r in select * from public.birthday_rooms where memory_id is null loop
    insert into public.memories (couple_id, created_by, title, body, happened_on, kind)
    values (
      r.couple_id, r.for_id, 'My birthday room 🎂', '',
      (r.unlock_at at time zone coalesce((select timezone from public.profiles where id = r.for_id), 'Asia/Kolkata'))::date,
      'moment'
    )
    returning id into v_memory;
    update public.birthday_rooms set memory_id = v_memory where id = r.id;
  end loop;
end;
$$;

-- The old text sent you to Home; the story now opens from the card itself.
update public.memories m set body = 'Our birthday story. Open it any time.'
from public.birthday_rooms r
where r.memory_id = m.id;

-- Read-only from now on.
drop policy if exists "birthday_rooms: maker edits" on public.birthday_rooms;
revoke update on public.birthday_rooms from authenticated;

drop function if exists public.birthday_open(uuid);
drop function if exists public.birthday_mark(uuid, int, boolean);
drop function if exists public.birthday_keep(uuid);
drop function if exists public.birthday_mine(uuid);
drop index if exists public.birthday_rooms_unnotified_idx;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'birthday-unlock') then
    perform cron.unschedule('birthday-unlock');
  end if;
end;
$$;

-- Its files live in R2 now (read through the media function).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    drop policy if exists "birthday bucket: reads with the room" on storage.objects;
    drop policy if exists "birthday bucket: maker uploads" on storage.objects;
    drop policy if exists "birthday bucket: maker removes" on storage.objects;
  end if;
end;
$$;

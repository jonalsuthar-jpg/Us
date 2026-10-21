-- ============================================================================
-- Snaps: photos that last 24 hours.
--
--   snaps          SHARED (couple)   a photo and optional caption. Readable
--                                    only until expires_at; after that it is
--                                    gone for both of us, and the hourly
--                                    snaps-cleanup function deletes the row
--                                    and its file.
--   storage bucket "snaps"           private, under "<couple_id>/"
--   messages.snap_id                 a chat reply to a snap. No foreign key:
--                                    the reply still reads "replied to a
--                                    snap" after the snap is gone.
--   memories.from_snap               a snap one of us kept, so keeping it
--                                    twice doesn't make two memories
--
-- Seen and reactions are my partner's to set, through definer functions.
-- ============================================================================

create table public.snaps (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  photo_path  text not null,
  caption     text check (caption is null or char_length(caption) between 1 and 200),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours',
  seen_at     timestamptz,
  reaction    text check (reaction is null or char_length(reaction) <= 16),
  reacted_at  timestamptz,
  constraint snaps_max_window check (expires_at <= created_at + interval '25 hours'),
  constraint snaps_photo_in_couple_folder check (
    starts_with(photo_path, couple_id::text || '/') and position('..' in photo_path) = 0
  )
);
create index snaps_couple_expires_idx on public.snaps (couple_id, expires_at desc);

alter table public.snaps enable row level security;
create policy "snaps: couple reads while live" on public.snaps for select to authenticated
  using (couple_id = (select public.current_couple_id()) and expires_at > now());
create policy "snaps: post as self" on public.snaps for insert to authenticated
  with check (
    couple_id = (select public.current_couple_id())
    and author_id = (select auth.uid())
    and seen_at is null and reaction is null and reacted_at is null
  );
create policy "snaps: author deletes" on public.snaps for delete to authenticated
  using (author_id = (select auth.uid()));
revoke update on public.snaps from authenticated;

-- Server clock for the timestamps, and at most 10 live snaps each.
create or replace function public.snaps_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.snaps s where s.author_id = new.author_id and s.expires_at > now()) >= 10 then
    raise exception 'too_many_snaps' using errcode = 'P0001';
  end if;
  new.created_at := now();
  new.expires_at := least(new.expires_at, now() + interval '24 hours');
  return new;
end;
$$;
create trigger snaps_before_insert before insert on public.snaps
  for each row execute function public.snaps_before_insert();

-- My partner opened my snap. Only the first time counts.
create or replace function public.mark_snap_seen(p_id uuid)
returns public.snaps
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.snaps;
begin
  select * into v_row from public.snaps where id = p_id and expires_at > now() for update;
  if not found or v_row.couple_id is distinct from public.current_couple_id() then
    raise exception 'snap_not_found' using errcode = 'P0002';
  end if;
  if v_row.author_id = auth.uid() then
    raise exception 'only your partner sees your snap' using errcode = '42501';
  end if;
  update public.snaps set seen_at = coalesce(seen_at, now()) where id = p_id returning * into v_row;
  return v_row;
end;
$$;

-- My partner reacts to my snap (null takes the reaction back).
create or replace function public.react_to_snap(p_id uuid, p_emoji text)
returns public.snaps
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.snaps;
  v_emoji text := nullif(trim(coalesce(p_emoji, '')), '');
begin
  if v_emoji is not null and char_length(v_emoji) > 16 then
    raise exception 'reaction_too_long' using errcode = '22023';
  end if;
  select * into v_row from public.snaps where id = p_id and expires_at > now() for update;
  if not found or v_row.couple_id is distinct from public.current_couple_id() then
    raise exception 'snap_not_found' using errcode = 'P0002';
  end if;
  if v_row.author_id = auth.uid() then
    raise exception 'only your partner reacts to your snap' using errcode = '42501';
  end if;
  update public.snaps
  set reaction = v_emoji,
      reacted_at = case when v_emoji is null then null else now() end,
      seen_at = coalesce(seen_at, now())
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;

-- Messages and memories point at a snap; their policies can't read snaps
-- past expiry under RLS, so the "is it ours" check goes through a helper.
create or replace function public.snap_in_my_couple(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.snaps s where s.id = p_id and s.couple_id = public.current_couple_id());
$$;

revoke execute on function public.mark_snap_seen(uuid), public.react_to_snap(uuid, text), public.snap_in_my_couple(uuid) from public, anon;
grant execute on function public.mark_snap_seen(uuid), public.react_to_snap(uuid, text), public.snap_in_my_couple(uuid) to authenticated;

-- ------------------------------------------------------- replies in chat ---
alter table public.messages add column snap_id uuid;

drop policy "messages: send as self" on public.messages;
create policy "messages: send as self"
  on public.messages for insert to authenticated
  with check (
    couple_id = (select public.current_couple_id())
    and sender_id = (select auth.uid())
    and kind = 'text'
    and status = 'sent'
    and delivered_at is null and read_at is null
    and reactions = '{}'::jsonb
    and pinned_at is null and pinned_by is null
    and (reply_to is null or public.message_in_my_couple(reply_to))
    and (snap_id is null or public.snap_in_my_couple(snap_id))
  );

-- --------------------------------------------------- kept in Memories ---
alter table public.memories add column from_snap uuid unique references public.snaps (id) on delete set null;

create policy "memories: kept snaps are ours" on public.memories
  as restrictive for insert to authenticated
  with check (from_snap is null or public.snap_in_my_couple(from_snap));

-- ---------------------------------------------------------------- storage ---
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('snaps', 'snaps', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
    on conflict (id) do nothing;

    execute $p$
      create policy "snaps bucket: couple reads" on storage.objects for select to authenticated
      using (bucket_id = 'snaps' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
    $p$;
    execute $p$
      create policy "snaps bucket: couple uploads" on storage.objects for insert to authenticated
      with check (bucket_id = 'snaps' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
    $p$;
    execute $p$
      create policy "snaps bucket: couple updates" on storage.objects for update to authenticated
      using (bucket_id = 'snaps' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
      with check (bucket_id = 'snaps' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
    $p$;
    execute $p$
      create policy "snaps bucket: couple deletes" on storage.objects for delete to authenticated
      using (bucket_id = 'snaps' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
    $p$;
  end if;
end;
$$;

-- ---------------------------------------------------------------- cleanup ---
-- Hourly, pg_cron calls the snaps-cleanup Edge Function, which removes the
-- expired rows and their files (SQL can't delete Storage files). The URL and
-- secret live in Vault, set once per project:
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same as the CRON_SECRET function secret>', 'cron_secret');
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule('snaps-cleanup', '7 * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/snaps-cleanup',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        body := '{}'::jsonb
      )
    $job$);
  end if;
end;
$$;

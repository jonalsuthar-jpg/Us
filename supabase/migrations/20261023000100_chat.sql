-- ============================================================================
-- Chat upgrades: replies, photos and voice notes, reactions, pinned messages.
-- (Search is a plain query over messages the couple can already read.)
--
--   reply_to    another message in the same thread
--   media_*     a photo or voice note in the private "chat" bucket, under
--               "<couple_id>/", with optional metadata (size, duration)
--   reactions   {"<user id>": "❤️"} — one reaction per person, set through
--               react_to_message() (messages stay non-editable for clients)
--   pinned_*    set through pin_message()
--
-- Reactions and pins are UPDATEs on messages, so they reach both apps through
-- the Postgres Changes stream the thread already listens to.
-- ============================================================================

alter table public.messages
  add column reply_to   uuid references public.messages (id) on delete set null,
  add column media_path text,
  add column media_kind text check (media_kind is null or media_kind in ('image', 'audio')),
  add column media_meta jsonb,
  add column reactions  jsonb not null default '{}'::jsonb,
  add column pinned_at  timestamptz,
  add column pinned_by  uuid references public.profiles (id) on delete set null;

alter table public.messages drop constraint messages_shape;
alter table public.messages add constraint messages_shape check (
  (kind = 'text' and call_id is null and (body is not null or media_path is not null))
  or (kind = 'call' and call_id is not null)
);
alter table public.messages add constraint messages_media_shape check ((media_path is null) = (media_kind is null));
alter table public.messages add constraint messages_media_in_couple_folder check (
  media_path is null or (starts_with(media_path, couple_id::text || '/') and position('..' in media_path) = 0)
);
alter table public.messages add constraint messages_media_meta_size check (media_meta is null or pg_column_size(media_meta) <= 1024);

create index messages_pinned_idx on public.messages (couple_id, pinned_at desc) where pinned_at is not null;

-- A policy on messages can't query messages itself (Postgres sees recursion),
-- so the "reply is in our thread" check goes through a definer helper.
create or replace function public.message_in_my_couple(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.messages m where m.id = p_id and m.couple_id = public.current_couple_id());
$$;
revoke execute on function public.message_in_my_couple(uuid) from public, anon;
grant execute on function public.message_in_my_couple(uuid) to authenticated;

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
  );

-- React (or with null, un-react) to a message in our thread.
create or replace function public.react_to_message(p_id uuid, p_emoji text)
returns public.messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_row public.messages;
  v_emoji text := nullif(trim(coalesce(p_emoji, '')), '');
begin
  if v_emoji is not null and char_length(v_emoji) > 16 then
    raise exception 'reaction_too_long' using errcode = '22023';
  end if;
  select * into v_row from public.messages where id = p_id for update;
  if not found or v_row.couple_id is distinct from public.current_couple_id() then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;
  update public.messages
  set reactions = case when v_emoji is null then reactions - me::text else reactions || jsonb_build_object(me::text, v_emoji) end
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.pin_message(p_id uuid, p_pinned boolean)
returns public.messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.messages;
begin
  select * into v_row from public.messages where id = p_id for update;
  if not found or v_row.couple_id is distinct from public.current_couple_id() then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;
  update public.messages
  set pinned_at = case when p_pinned then coalesce(pinned_at, now()) end,
      pinned_by = case when p_pinned then coalesce(pinned_by, auth.uid()) end
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.react_to_message(uuid, text), public.pin_message(uuid, boolean) from public, anon;
grant execute on function public.react_to_message(uuid, text), public.pin_message(uuid, boolean) to authenticated;

-- Storage for chat photos and voice notes (real Supabase projects only).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('chat', 'chat', false, 20971520, array[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
      'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/wav'
    ])
    on conflict (id) do nothing;

    execute $p$
      create policy "chat bucket: couple reads" on storage.objects for select to authenticated
      using (bucket_id = 'chat' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
    $p$;
    execute $p$
      create policy "chat bucket: couple uploads" on storage.objects for insert to authenticated
      with check (bucket_id = 'chat' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
    $p$;
    -- A retried send re-uploads to the same path (upsert), which is an update.
    execute $p$
      create policy "chat bucket: couple updates" on storage.objects for update to authenticated
      using (bucket_id = 'chat' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
      with check (bucket_id = 'chat' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
    $p$;
    execute $p$
      create policy "chat bucket: couple deletes" on storage.objects for delete to authenticated
      using (bucket_id = 'chat' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
    $p$;
  end if;
end;
$$;

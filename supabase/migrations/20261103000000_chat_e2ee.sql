-- ============================================================================
-- End-to-end encrypted chat.
--
-- The couple shares one random key (the "chat key"). It never reaches the
-- server in the clear: each device has its own X25519 keypair, and the chat
-- key is stored here sealed to every device that may read it, plus once per
-- person sealed with their chat PIN as a backup.
--
--   chat_devices      PRIVATE-ish   a device's public key. Both of us see
--                                   both of our devices (to seal the key to
--                                   them and show safety codes).
--   chat_keys         SHARED        that a chat key exists, and who made it.
--   chat_key_wraps    SHARED        the chat key sealed to one device.
--   chat_key_backups  PRIVATE       the chat key sealed with my PIN.
--
-- Messages, reactions and snap captions keep their metadata (sender, times,
-- receipts, pins, media kind) in the clear; the content moves into
-- `ciphertext` / encrypted values that only our devices can open. Files in
-- the chat bucket are encrypted on the device before upload.
-- ============================================================================

-- ---------------------------------------------------------------- devices ---
create table public.chat_devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- base64 of a 32-byte X25519 public key
  public_key  text not null unique check (public_key ~ '^[A-Za-z0-9+/]{43}=$'),
  label       text not null check (char_length(label) between 1 and 60),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create index chat_devices_user_idx on public.chat_devices (user_id);

alter table public.chat_devices enable row level security;
create policy "chat_devices: ours" on public.chat_devices for select to authenticated
  using (user_id = (select auth.uid()) or user_id = (select public.current_partner_id()));
create policy "chat_devices: register mine" on public.chat_devices for insert to authenticated
  with check (user_id = (select auth.uid()) and revoked_at is null);
revoke update, delete on public.chat_devices from authenticated;
revoke all on public.chat_devices from anon;

-- ------------------------------------------------------------------- keys ---
create table public.chat_keys (
  couple_id    uuid not null references public.couples (id) on delete cascade,
  key_version  smallint not null check (key_version > 0),
  created_by   uuid not null references public.chat_devices (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (couple_id, key_version)
);

alter table public.chat_keys enable row level security;
create policy "chat_keys: couple reads" on public.chat_keys for select to authenticated
  using (couple_id = (select public.current_couple_id()));
revoke insert, update, delete on public.chat_keys from authenticated;
revoke all on public.chat_keys from anon;

create table public.chat_key_wraps (
  couple_id    uuid not null,
  key_version  smallint not null,
  device_id    uuid not null references public.chat_devices (id) on delete cascade,
  -- base64 of ephemeral public key ‖ nonce ‖ sealed key
  wrapped_key  text not null check (char_length(wrapped_key) <= 200),
  wrapped_by   uuid references public.chat_devices (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (device_id, key_version),
  foreign key (couple_id, key_version) references public.chat_keys (couple_id, key_version) on delete cascade
);
create index chat_key_wraps_couple_idx on public.chat_key_wraps (couple_id, key_version);

-- A device of mine or my partner's that hasn't been revoked.
create or replace function public.chat_device_in_my_couple(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_devices d
    where d.id = p_id
      and d.revoked_at is null
      and (d.user_id = auth.uid() or d.user_id = public.current_partner_id())
  );
$$;
revoke execute on function public.chat_device_in_my_couple(uuid) from public, anon;
grant execute on function public.chat_device_in_my_couple(uuid) to authenticated;

alter table public.chat_key_wraps enable row level security;
-- The sealed key is useless without that device's private key, and seeing
-- which devices have one tells the apps who is still waiting.
create policy "chat_key_wraps: couple reads" on public.chat_key_wraps for select to authenticated
  using (couple_id = (select public.current_couple_id()));
create policy "chat_key_wraps: seal for our devices" on public.chat_key_wraps for insert to authenticated
  with check (
    couple_id = (select public.current_couple_id())
    and public.chat_device_in_my_couple(device_id)
    and wrapped_by is not null
    and exists (select 1 from public.chat_devices d where d.id = wrapped_by and d.user_id = (select auth.uid()) and d.revoked_at is null)
  );
revoke update, delete on public.chat_key_wraps from authenticated;
revoke all on public.chat_key_wraps from anon;

create table public.chat_key_backups (
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  couple_id    uuid not null,
  key_version  smallint not null,
  -- base64 salt, KDF parameters, base64 nonce ‖ sealed key
  salt         text not null check (char_length(salt) <= 64),
  params       jsonb not null check (pg_column_size(params) <= 256),
  wrapped_key  text not null check (char_length(wrapped_key) <= 200),
  updated_at   timestamptz not null default now(),
  primary key (user_id, couple_id, key_version),
  foreign key (couple_id, key_version) references public.chat_keys (couple_id, key_version) on delete cascade
);

alter table public.chat_key_backups enable row level security;
create policy "chat_key_backups: mine" on public.chat_key_backups for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and couple_id = (select public.current_couple_id()));
revoke all on public.chat_key_backups from anon;

-- Make the couple's chat key, sealed to the device that made it, in one step.
-- When both of us open the app at once only the first one counts: the other
-- gets false and waits for the key to be shared with it.
create or replace function public.claim_chat_key(p_version smallint, p_device_id uuid, p_wrapped_key text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_couple uuid := public.current_couple_id();
  v_made int;
begin
  if v_couple is null then
    raise exception 'not_paired' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.chat_devices d where d.id = p_device_id and d.user_id = auth.uid() and d.revoked_at is null) then
    raise exception 'device_not_found' using errcode = 'P0002';
  end if;
  insert into public.chat_keys (couple_id, key_version, created_by)
  values (v_couple, p_version, p_device_id)
  on conflict do nothing;
  get diagnostics v_made = row_count;
  if v_made = 0 then
    return false;
  end if;
  insert into public.chat_key_wraps (couple_id, key_version, device_id, wrapped_key, wrapped_by)
  values (v_couple, p_version, p_device_id, p_wrapped_key, p_device_id);
  return true;
end;
$$;

-- Sign a device of mine out of the chat: it loses its sealed key.
create or replace function public.revoke_chat_device(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.chat_devices set revoked_at = coalesce(revoked_at, now())
  where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'device_not_found' using errcode = 'P0002';
  end if;
  delete from public.chat_key_wraps where device_id = p_id;
end;
$$;

revoke execute on function public.claim_chat_key(smallint, uuid, text), public.revoke_chat_device(uuid) from public, anon;
grant execute on function public.claim_chat_key(smallint, uuid, text), public.revoke_chat_device(uuid) to authenticated;

-- --------------------------------------------------------------- messages ---
-- base64 of nonce ‖ ciphertext; the decrypted JSON holds body and media_meta.
alter table public.messages
  add column ciphertext text check (ciphertext is null or char_length(ciphertext) <= 24000),
  add column key_version smallint;
alter table public.messages add constraint messages_encryption_shape check (
  (ciphertext is null) = (key_version is null)
  and (ciphertext is null or (body is null and media_meta is null))
);

alter table public.messages drop constraint messages_shape;
alter table public.messages add constraint messages_shape check (
  (kind = 'text' and call_id is null and (
    body is not null or ciphertext is not null or media_path is not null or coalesce(media_kind in ('gif', 'sticker'), false)
  ))
  or (kind = 'call' and call_id is not null)
);

-- An encrypted GIF or sticker link lives inside the ciphertext, where the
-- GIPHY check can't see it.
alter table public.messages drop constraint messages_media_shape;
alter table public.messages add constraint messages_media_shape check (
  (media_kind is null and media_path is null)
  or (media_kind is not null and media_kind in ('image', 'audio') and media_path is not null)
  or (
    media_kind is not null
    and media_kind = 'gif'
    and media_path is null
    and (ciphertext is not null or coalesce(media_meta ->> 'url', '') ~ '^https://media[0-9]*\.giphy\.com/')
  )
  or (
    media_kind is not null
    and media_kind = 'sticker'
    and (
      (media_path is null and (ciphertext is not null or coalesce(media_meta ->> 'url', '') ~ '^https://media[0-9]*\.giphy\.com/'))
      or (media_path is not null and media_path ~ ('^' || couple_id::text || '/sticker-[0-9a-f-]{36}\.(png|webp)$'))
    )
  )
);

-- The key a message names must be one of ours.
create or replace function public.chat_key_in_my_couple(p_version smallint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.chat_keys k where k.couple_id = public.current_couple_id() and k.key_version = p_version);
$$;
revoke execute on function public.chat_key_in_my_couple(smallint) from public, anon;
grant execute on function public.chat_key_in_my_couple(smallint) to authenticated;

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
    and (key_version is null or public.chat_key_in_my_couple(key_version))
  );

-- Reactions on encrypted messages are encrypted too: base64, a little longer.
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
  if v_emoji is not null and char_length(v_emoji) > 16 and not (char_length(v_emoji) <= 160 and v_emoji ~ '^[A-Za-z0-9+/]+=*$') then
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

-- Encrypt a message sent before encryption, once. Either of us may do it for
-- any message in our thread: the content changes form, not meaning, and the
-- apps check the ciphertext is bound to this message and its sender.
-- `p_reactions` must carry the same people as the reactions it replaces.
create or replace function public.encrypt_legacy_message(p_id uuid, p_ciphertext text, p_key_version smallint, p_reactions jsonb)
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
  if v_row.ciphertext is not null or v_row.kind <> 'text' then
    return v_row;
  end if;
  if not exists (select 1 from public.chat_keys k where k.couple_id = v_row.couple_id and k.key_version = p_key_version) then
    raise exception 'key_not_found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(coalesce(p_reactions, '{}'::jsonb)) <> 'object'
     or (select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(coalesce(p_reactions, '{}'::jsonb)) k)
        is distinct from (select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(v_row.reactions) k)
     or exists (select 1 from jsonb_each(coalesce(p_reactions, '{}'::jsonb)) e where jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 160)
  then
    raise exception 'reactions_mismatch' using errcode = '22023';
  end if;
  update public.messages
  set ciphertext = p_ciphertext,
      key_version = p_key_version,
      body = null,
      media_meta = null,
      reactions = coalesce(p_reactions, '{}'::jsonb)
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.encrypt_legacy_message(uuid, text, smallint, jsonb) from public, anon;
grant execute on function public.encrypt_legacy_message(uuid, text, smallint, jsonb) to authenticated;

-- ------------------------------------------------------------------ snaps ---
alter table public.snaps
  add column caption_ct text check (caption_ct is null or char_length(caption_ct) <= 1200),
  add column key_version smallint;
alter table public.snaps add constraint snaps_caption_encryption check (
  (caption_ct is null) = (key_version is null) and (caption is null or caption_ct is null)
);

-- ---------------------------------------------------------------- storage ---
-- Encrypted files are opaque bytes, whatever they were before.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    update storage.buckets
    set allowed_mime_types = array_append(allowed_mime_types, 'application/octet-stream')
    where id = 'chat' and not ('application/octet-stream' = any (allowed_mime_types));
  end if;
end;
$$;

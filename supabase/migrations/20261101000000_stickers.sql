-- ============================================================================
-- Our own stickers: made from a photo (the subject cut out, text, a doodle,
-- a white outline), kept for both of us to send again.
--
--   stickers   SHARED (couple)   one row per saved sticker; the picture is a
--                                transparent PNG in the private "chat" bucket
--                                at "<couple_id>/sticker-<id>.png" (top level,
--                                so unpairing's folder cleanup removes it)
--
-- A sticker message is either a GIPHY link (as before) or one of our sticker
-- files: media_kind 'sticker' with media_path pointing at it. Sending one
-- uploads nothing; the message points at the saved file.
-- ============================================================================

insert into public.features (key, label, module, sort) values ('stickers', 'Stickers', 'talk', 25)
on conflict (key) do nothing;

update public.plans set features = array_append(features, 'stickers')
where id = 'full' and not ('stickers' = any (features));

update public.user_access set features = array_append(features, 'stickers'), updated_at = now()
where plan_id = 'full' and not ('stickers' = any (features));

create table public.stickers (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  path        text not null,
  width       int not null default 512 check (width between 1 and 2048),
  height      int not null default 512 check (height between 1 and 2048),
  created_at  timestamptz not null default now(),
  constraint stickers_file_in_couple_folder check (
    path ~ ('^' || couple_id::text || '/sticker-[0-9a-f-]{36}\.(png|webp)$')
  )
);
-- Saving a sticker that's already in Ours does nothing.
create unique index stickers_unique_path on public.stickers (couple_id, path);
create index stickers_couple_created_idx on public.stickers (couple_id, created_at desc);

alter table public.stickers enable row level security;
create policy "stickers: couple reads" on public.stickers for select to authenticated
  using (couple_id = (select public.current_couple_id()));
create policy "stickers: save as self" on public.stickers for insert to authenticated
  with check (couple_id = (select public.current_couple_id()) and created_by = (select auth.uid()));
create policy "stickers: creator removes" on public.stickers for delete to authenticated
  using (couple_id = (select public.current_couple_id()) and created_by = (select auth.uid()));
create policy "stickers: feature stickers" on public.stickers as restrictive for all to authenticated
  using ((select public.has_feature('stickers'))) with check ((select public.has_feature('stickers')));
revoke update on public.stickers from authenticated;
revoke all on public.stickers from anon;

-- A sticker message: a GIPHY link, or one of our sticker files.
alter table public.messages drop constraint messages_media_shape;
alter table public.messages add constraint messages_media_shape check (
  (media_kind is null and media_path is null)
  or (media_kind is not null and media_kind in ('image', 'audio') and media_path is not null)
  or (
    media_kind is not null
    and media_kind = 'gif'
    and media_path is null
    and coalesce(media_meta ->> 'url', '') ~ '^https://media[0-9]*\.giphy\.com/'
  )
  or (
    media_kind is not null
    and media_kind = 'sticker'
    and (
      (media_path is null and coalesce(media_meta ->> 'url', '') ~ '^https://media[0-9]*\.giphy\.com/')
      or (media_path is not null and media_path ~ ('^' || couple_id::text || '/sticker-[0-9a-f-]{36}\.(png|webp)$'))
    )
  )
);

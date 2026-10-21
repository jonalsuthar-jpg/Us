-- ============================================================================
-- GIFs and stickers in chat.
--
-- They are GIPHY links, not files in our folder: media_kind 'gif' / 'sticker',
-- no media_path, and media_meta.url holding the GIPHY media URL. Only GIPHY's
-- media hosts are accepted, so a message can't carry an arbitrary (tracking)
-- link that the other person's app would load.
-- ============================================================================

alter table public.messages drop constraint if exists messages_media_kind_check;
alter table public.messages add constraint messages_media_kind_check
  check (media_kind is null or media_kind in ('image', 'audio', 'gif', 'sticker'));

alter table public.messages drop constraint messages_media_shape;
-- Each branch tests media_kind explicitly: `null in (...)` is unknown, which a
-- check constraint would let through.
alter table public.messages add constraint messages_media_shape check (
  (media_kind is null and media_path is null)
  or (media_kind is not null and media_kind in ('image', 'audio') and media_path is not null)
  or (
    media_kind is not null
    and media_kind in ('gif', 'sticker')
    and media_path is null
    and coalesce(media_meta ->> 'url', '') ~ '^https://media[0-9]*\.giphy\.com/'
  )
);

alter table public.messages drop constraint messages_shape;
alter table public.messages add constraint messages_shape check (
  (kind = 'text' and call_id is null and (body is not null or media_path is not null or coalesce(media_kind in ('gif', 'sticker'), false)))
  or (kind = 'call' and call_id is not null)
);

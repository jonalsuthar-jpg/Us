-- Chat videos. The file lives in Cloudflare R2, not Supabase Storage (R2
-- doesn't charge for downloads), under "<couple_id>/video/<message id>.<ext>",
-- signed by the chat-video function. Videos are always encrypted on the
-- device (".enc"), so R2 only ever holds ciphertext.

alter table public.messages drop constraint messages_media_kind_check;
alter table public.messages add constraint messages_media_kind_check
  check (media_kind is null or media_kind in ('image', 'audio', 'video', 'gif', 'sticker'));

alter table public.messages drop constraint messages_media_shape;
alter table public.messages add constraint messages_media_shape check (
  (media_kind is null and media_path is null)
  or (media_kind is not null and media_kind in ('image', 'audio') and media_path is not null)
  or (
    media_kind is not null
    and media_kind = 'video'
    and media_path is not null
    and ciphertext is not null
    and media_path ~ ('^' || couple_id::text || '/video/' || id::text || '\.enc$')
  )
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

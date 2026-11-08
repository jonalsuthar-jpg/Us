-- Stickers from the keyboard (Gboard's GIF and sticker tabs): saved to Ours
-- as they came, so an animated one stays animated. A sticker file may now be
-- a GIF as well as a PNG or WebP.

alter table public.stickers drop constraint stickers_file_in_couple_folder;
alter table public.stickers add constraint stickers_file_in_couple_folder check (
  path ~ ('^' || couple_id::text || '/sticker-[0-9a-f-]{36}\.(png|webp|gif)$')
);

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
      or (media_path is not null and media_path ~ ('^' || couple_id::text || '/sticker-[0-9a-f-]{36}\.(png|webp|gif)$'))
    )
  )
);

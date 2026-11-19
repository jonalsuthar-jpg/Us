-- ============================================================================
-- Memories with more than one photo, and a video.
--
--   memories.photo_paths  up to 10 photos, in order; the first is the cover,
--                         and photo_path keeps holding it (Home, snaps kept as
--                         memories and older apps read only that).
--   memories.video_path   one short video, "<couple_id>/video/<uuid>.<ext>"
--   memories.video_meta   its width, height and length
--
-- Everything stays in our folder of the memories bucket.
-- ============================================================================

create or replace function public.paths_in_folder(p_paths text[], p_folder uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(p like p_folder::text || '/%' and p !~ '\.\.'), true) from unnest(p_paths) p;
$$;

alter table public.memories
  add column photo_paths text[] not null default '{}',
  add column video_path text,
  add column video_meta jsonb,
  add constraint memories_photos_max check (cardinality(photo_paths) <= 10),
  add constraint memories_photos_in_couple_folder check (public.paths_in_folder(photo_paths, couple_id)),
  add constraint memories_video_in_couple_folder check (video_path is null or video_path like couple_id::text || '/video/%'),
  add constraint memories_video_meta_size check (video_meta is null or octet_length(video_meta::text) <= 512);

update public.memories set photo_paths = array[photo_path] where photo_path is not null and photo_paths = '{}';

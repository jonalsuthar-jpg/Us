-- ============================================================================
-- What a memory's card shows.
--
--   memories.cover_path         a cover we chose ourselves (any photo)
--   memories.video_poster_path  a still from the video, made when it's added,
--                               so a memory with only a video isn't blank
--
-- The card shows the chosen cover, else the first photo, else the still.
-- ============================================================================

alter table public.memories
  add column cover_path text,
  add column video_poster_path text,
  add constraint memories_cover_in_couple_folder check (cover_path is null or (cover_path like couple_id::text || '/%' and cover_path !~ '\.\.')),
  add constraint memories_poster_in_couple_folder check (video_poster_path is null or (video_poster_path like couple_id::text || '/%' and video_poster_path !~ '\.\.'));

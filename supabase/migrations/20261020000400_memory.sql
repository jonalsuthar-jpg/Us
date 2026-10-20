-- ============================================================================
-- Phase 5: Memory — timeline with photos, on this day, trips & dates.
--
--   memories        SHARED  (couple)       the moment itself
--   memory_ratings  PRIVATE (owner only)   how it felt to *me*; never shown
--                                          to my partner
--   storage bucket "memories"              private; objects live under
--                                          "<couple_id>/…" and only that
--                                          couple can read or write them
-- ============================================================================

alter table public.memories
  add constraint memories_title_len check (char_length(title) between 1 and 200),
  add constraint memories_photo_in_couple_folder
    check (photo_path is null or photo_path like couple_id::text || '/%');

create index memories_couple_happened_idx on public.memories (couple_id, happened_on desc);

create policy "memories: create as self" on public.memories
  as restrictive for insert to authenticated
  with check (created_by = (select auth.uid()));

-- A private rating can only be attached to one of our own memories. The
-- subquery runs under the caller's RLS, so other couples' rows are invisible.
create policy "memory_ratings: only our memories" on public.memory_ratings
  as restrictive for all to authenticated
  using (exists (select 1 from public.memories m where m.id = memory_id))
  with check (exists (select 1 from public.memories m where m.id = memory_id));

alter table public.memory_ratings
  add constraint memory_ratings_note_len check (note is null or char_length(note) <= 2000);

-- Storage only exists on a real Supabase project (not the PGlite test harness).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('memories', 'memories', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
    on conflict (id) do nothing;

    execute $p$
      create policy "memories bucket: couple reads" on storage.objects for select to authenticated
      using (bucket_id = 'memories' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
    $p$;
    execute $p$
      create policy "memories bucket: couple uploads" on storage.objects for insert to authenticated
      with check (bucket_id = 'memories' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
    $p$;
    execute $p$
      create policy "memories bucket: couple updates" on storage.objects for update to authenticated
      using (bucket_id = 'memories' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
      with check (bucket_id = 'memories' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
    $p$;
    execute $p$
      create policy "memories bucket: couple deletes" on storage.objects for delete to authenticated
      using (bucket_id = 'memories' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
    $p$;
  end if;
end;
$$;

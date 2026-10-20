-- ============================================================================
-- Realtime wiring
--   * Postgres Changes for messages + calls (respects the RLS above)
--   * Realtime Authorization for the private broadcast/presence channel
--     "couple:<couple_id>" which carries typing, presence and WebRTC signaling.
--
-- Guarded so the migration also applies to plain Postgres (used by the
-- scripts/test-db.mjs harness, which has no Realtime schema).
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.calls;
  end if;
end;
$$;

-- Full row images on UPDATE so receipt changes carry every column.
alter table public.messages replica identity full;
alter table public.calls replica identity full;

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'realtime' and table_name = 'messages') then

    execute $p$
      create policy "couple channel: members receive"
        on realtime.messages for select to authenticated
        using (
          realtime.messages.extension in ('broadcast', 'presence')
          and (select realtime.topic()) = 'couple:' || (select public.current_couple_id())::text
        )
    $p$;

    execute $p$
      create policy "couple channel: members send"
        on realtime.messages for insert to authenticated
        with check (
          realtime.messages.extension in ('broadcast', 'presence')
          and (select realtime.topic()) = 'couple:' || (select public.current_couple_id())::text
        )
    $p$;
  end if;
end;
$$;

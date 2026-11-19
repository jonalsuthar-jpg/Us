-- ============================================================================
-- Edit a message: my own, encrypted, not deleted, within a day of sending.
-- The new text arrives as a fresh ciphertext for the same message (the apps
-- keep its media details and add the edit time inside it); the server only
-- swaps it in and notes when. Reactions, pins, replies and receipts stay.
-- ============================================================================

alter table public.messages add column edited_at timestamptz;

create or replace function public.edit_message(p_id uuid, p_ciphertext text, p_key_version smallint)
returns public.messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_row public.messages;
begin
  select * into v_row from public.messages where id = p_id for update;
  if not found or v_row.couple_id is distinct from public.current_couple_id() then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;
  if v_row.sender_id is distinct from me or v_row.kind <> 'text' then
    raise exception 'not_yours' using errcode = '42501';
  end if;
  if v_row.deleted_at is not null or v_row.ciphertext is null then
    raise exception 'not_editable' using errcode = '22023';
  end if;
  if v_row.created_at < now() - interval '24 hours' then
    raise exception 'edit_too_late' using errcode = '22023';
  end if;
  if p_ciphertext is null or char_length(p_ciphertext) > 24000 then
    raise exception 'not_editable' using errcode = '22023';
  end if;
  if not exists (select 1 from public.chat_keys k where k.couple_id = v_row.couple_id and k.key_version = p_key_version) then
    raise exception 'key_not_found' using errcode = 'P0002';
  end if;
  update public.messages
  set ciphertext = p_ciphertext, key_version = p_key_version, edited_at = now()
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.edit_message(uuid, text, smallint) from public, anon;
grant execute on function public.edit_message(uuid, text, smallint) to authenticated;

-- Deleting messages, as in WhatsApp.
--
--   Delete for everyone   my own messages: the content is wiped and both of
--                         us see "This message was deleted" (deleted_at set).
--   Delete for me         any message: it's hidden on my devices only
--                         (my id added to hidden_for).
--
-- Both go through delete_message(); nobody can update messages directly. The
-- app removes the wiped message's file from R2 itself (via media/chat-video).

alter table public.messages
  add column deleted_at timestamptz,
  add column hidden_for uuid[] not null default '{}';

-- A deleted text message has nothing left in it.
alter table public.messages drop constraint messages_shape;
alter table public.messages add constraint messages_shape check (
  (kind = 'text' and call_id is null and (
    deleted_at is not null or body is not null or ciphertext is not null or media_path is not null or coalesce(media_kind in ('gif', 'sticker'), false)
  ))
  or (kind = 'call' and call_id is not null)
);

create or replace function public.delete_message(p_id uuid, p_for_everyone boolean)
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

  if p_for_everyone then
    if v_row.sender_id is distinct from me or v_row.kind <> 'text' then
      raise exception 'not_yours' using errcode = '42501';
    end if;
    if v_row.deleted_at is not null then
      return v_row;
    end if;
    update public.messages
    set deleted_at = now(), body = null, ciphertext = null, key_version = null,
        media_kind = null, media_path = null, media_meta = null,
        reactions = '{}'::jsonb, pinned_at = null, pinned_by = null
    where id = p_id
    returning * into v_row;
  else
    update public.messages
    set hidden_for = array_append(hidden_for, me)
    where id = p_id and not (me = any (hidden_for))
    returning * into v_row;
    if not found then
      select * into v_row from public.messages where id = p_id;
    end if;
  end if;
  return v_row;
end;
$$;

revoke execute on function public.delete_message(uuid, boolean) from public, anon;
grant execute on function public.delete_message(uuid, boolean) to authenticated;

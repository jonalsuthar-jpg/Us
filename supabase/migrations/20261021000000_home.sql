-- ============================================================================
-- Home — the page the app opens on.
--
--   profiles.status_*   SHARED on purpose: an emoji + short line each of you
--                       sets for the other to see ("😴 sleepy"). Separate from
--                       the private mood log, which stays private.
--   couples.photo_path  SHARED "photo of us", stored in the private memories
--                       bucket under the couple's folder. Set via
--                       set_couple_photo() (couples has no client writes).
-- ============================================================================

alter table public.profiles
  add column status_emoji text,
  add column status_text  text,
  add column status_at    timestamptz,
  add constraint profiles_status_emoji_len check (status_emoji is null or char_length(status_emoji) <= 16),
  add constraint profiles_status_text_len check (status_text is null or char_length(status_text) <= 60);

grant update (display_name, avatar_url, status_emoji, status_text, status_at) on public.profiles to authenticated;

alter table public.couples
  add column photo_path text;

-- Either partner may set (or clear) the couple photo. The path must live in
-- this couple's storage folder, so nobody can point it at another couple's file.
create or replace function public.set_couple_photo(p_path text)
returns public.couples
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_couple uuid := public.current_couple_id();
  v_row public.couples;
begin
  if v_couple is null then
    raise exception 'not paired' using errcode = '42501';
  end if;
  if p_path is not null and (p_path not like v_couple::text || '/%' or p_path like '%..%') then
    raise exception 'photo must be in this couple''s folder' using errcode = '42501';
  end if;
  update public.couples set photo_path = p_path where id = v_couple returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.set_couple_photo(text) from public, anon;
grant execute on function public.set_couple_photo(text) to authenticated;

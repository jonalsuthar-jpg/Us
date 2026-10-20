-- ============================================================================
-- Phase 6: Growth — goals, mood check-ins, worry space, love languages.
--
--   goals                  SHARED board; individual goals editable by owner
--   mood_checkins          PRIVATE; partner only ever learns *that* I asked
--                          for a nudge (partner_nudges), never score or note
--   insecurity_checkins    PRIVATE "worry space"; owner may share one
--   love_language_results  PRIVATE; owner may choose to share the result
-- ============================================================================

alter table public.goals
  add column updated_at timestamptz not null default now(),
  add constraint goals_title_len check (char_length(title) between 1 and 200);

create index goals_couple_idx on public.goals (couple_id, created_at);

create trigger goals_touch before update on public.goals
  for each row execute function public.touch_updated_at();

alter table public.mood_checkins
  add constraint mood_checkins_note_len check (note is null or char_length(note) <= 2000);

create index mood_checkins_owner_created_idx on public.mood_checkins (owner_id, created_at desc);

alter table public.insecurity_checkins
  add constraint insecurity_checkins_body_len check (char_length(body) between 1 and 5000);

create index insecurity_checkins_owner_created_idx on public.insecurity_checkins (owner_id, created_at desc);

-- My partner's recent "I could use a little care" moments: timestamps only.
create or replace function public.partner_nudges(p_hours integer default 48)
returns table (nudged_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.created_at
  from public.mood_checkins m
  where m.owner_id = (select public.current_partner_id())
    and m.nudge_partner
    and m.created_at > now() - make_interval(hours => least(greatest(p_hours, 1), 168))
  order by m.created_at desc;
$$;

revoke execute on function public.partner_nudges(integer) from public, anon;
grant execute on function public.partner_nudges(integer) to authenticated;

-- Love languages: a private result the owner can choose to share.
alter table public.love_language_results
  add column shared boolean not null default false,
  add constraint love_language_primary_valid
    check (primary_language in ('words', 'acts', 'gifts', 'time', 'touch'));

create policy "love_language_results: partner reads shared" on public.love_language_results
  for select to authenticated
  using (shared and owner_id = (select public.current_partner_id()));

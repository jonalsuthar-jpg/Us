-- ============================================================================
-- Phase 4: Plan — shared calendar, decision picker, invisible labour, costs.
--
-- The tables live in *_future_phases.sql with couple-scoped RLS. This adds the
-- integrity rules the features rely on (restrictive policies, so they narrow
-- the existing "couple access" policies rather than replace them) and the
-- weighted decision picker.
-- ============================================================================

-- True when p_user is me or my partner.
create or replace function public.is_couple_member(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
     and (p_user = (select auth.uid()) or p_user = (select public.current_partner_id()));
$$;

revoke execute on function public.is_couple_member(uuid) from public, anon;
grant execute on function public.is_couple_member(uuid) to authenticated;

-- ------------------------------------------------------------- calendar ---
alter table public.calendar_events
  add constraint calendar_events_title_len check (char_length(title) between 1 and 200),
  add constraint calendar_events_ends_after_start check (ends_at is null or ends_at >= starts_at);

create index calendar_events_couple_starts_idx on public.calendar_events (couple_id, starts_at);

-- Either of you can edit any event, but you can only create one as yourself.
create policy "calendar_events: create as self" on public.calendar_events
  as restrictive for insert to authenticated
  with check (created_by = (select auth.uid()));

-- ------------------------------------------------------- decision picker ---
alter table public.decision_options
  add constraint decision_options_label_len check (char_length(label) between 1 and 120),
  add constraint decision_options_category_len check (char_length(category) between 1 and 60);

create index decision_options_couple_category_idx on public.decision_options (couple_id, category);

-- Pick one option from a category, weighted by `weight`, with anything picked
-- recently deprioritised: an option picked today counts at 20% of its weight,
-- recovering linearly to 100% over 14 days. Records the pick and returns it.
--
-- Weighted sampling uses the exponential-key trick: order by -ln(U) / w and
-- take the first row, which selects each row with probability w / sum(w).
create or replace function public.pick_decision(p_category text)
returns public.decision_options
language plpgsql
volatile
set search_path = ''
as $$
declare
  cid uuid := public.current_couple_id();
  picked public.decision_options;
begin
  if cid is null then
    raise exception 'not_paired' using errcode = 'P0001';
  end if;

  select o.* into picked
  from public.decision_options o
  where o.couple_id = cid and o.category = p_category
  order by -ln(1 - random()) / (
    o.weight * case
      when o.last_picked_at is null then 1
      else least(1, 0.2 + 0.8 * extract(epoch from (now() - o.last_picked_at)) / (14 * 86400))
    end
  )
  limit 1;

  if picked.id is null then
    raise exception 'no_options' using errcode = 'P0001';
  end if;

  update public.decision_options o
  set times_picked = o.times_picked + 1,
      last_picked_at = now()
  where o.id = picked.id
  returning o.* into picked;

  return picked;
end;
$$;

revoke execute on function public.pick_decision(text) from public, anon;
grant execute on function public.pick_decision(text) to authenticated;

-- ------------------------------------------------------ invisible labour ---
alter table public.labor_entries
  add constraint labor_entries_task_len check (char_length(task) between 1 and 200);

create index labor_entries_couple_done_on_idx on public.labor_entries (couple_id, done_on desc);

-- You can log what either of you did (noticing your partner's effort is the
-- point), but only for the two of you.
create policy "labor_entries: done by a member" on public.labor_entries
  as restrictive for all to authenticated
  using (true)
  with check ((select public.is_couple_member(done_by)));

-- ---------------------------------------------------------------- costs ---
alter table public.expenses
  add column is_settlement boolean not null default false,
  add constraint expenses_description_len check (char_length(description) between 1 and 200),
  add constraint expenses_currency_format check (currency ~ '^[A-Z]{3}$');

create index expenses_couple_spent_on_idx on public.expenses (couple_id, spent_on desc);

create policy "expenses: paid by a member" on public.expenses
  as restrictive for all to authenticated
  using (true)
  with check ((select public.is_couple_member(paid_by)));

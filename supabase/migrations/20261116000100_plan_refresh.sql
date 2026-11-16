-- ============================================================================
-- Plan refresh: a little more shape for the redesigned Plan screens.
--
--  * expenses.category       Food, groceries, rent… for the monthly summary.
--  * expenses.a_share_cents  An exact split ("I'll cover 400 of the 1,240").
--                            When set it wins over split_a_pct, which can only
--                            say whole percents.
--  * calendar_events.kind    Date, trip, birthday, errand: a colour and icon.
--  * labor_entries.thanked_at  The other one said thanks for this.
--
-- All nullable, so old rows and older app builds keep working unchanged.
-- ============================================================================

alter table public.expenses
  add column category text,
  add column a_share_cents integer,
  add constraint expenses_category_known
    check (category is null or category in ('food', 'groceries', 'rent', 'travel', 'fun', 'bills', 'other')),
  add constraint expenses_a_share_within
    check (a_share_cents is null or (a_share_cents >= 0 and a_share_cents <= amount_cents));

alter table public.calendar_events
  add column kind text,
  add constraint calendar_events_kind_known
    check (kind is null or kind in ('date', 'trip', 'birthday', 'errand', 'other'));

alter table public.labor_entries
  add column thanked_at timestamptz;

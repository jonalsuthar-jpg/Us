-- ============================================================================
-- Leaving: unpair, and (via the delete-account Edge Function) deleting an account.
--
-- unpair() deletes the couple row. Every couple-scoped table references
-- couples(id) on delete cascade, so everything the two of you shared goes
-- with it: messages, calls, plans, memories, goals, questions. Owner-only
-- data (mood check-ins, worries, love-language results) stays with its owner.
--
-- Photos live in Storage under "<couple_id>/", which SQL can't delete. Clients
-- remove that folder first (see packages/shared/src/api/account.ts).
-- ============================================================================

create or replace function public.unpair()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_couple uuid := public.current_couple_id();
begin
  if v_couple is null then
    raise exception 'not_paired' using errcode = 'P0001';
  end if;
  delete from public.couples where id = v_couple;
end;
$$;

revoke execute on function public.unpair() from public, anon;
grant execute on function public.unpair() to authenticated;

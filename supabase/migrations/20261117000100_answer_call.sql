-- Answering is first-come: with the app open on a phone and a laptop, both
-- can tap Answer at once. The call remembers which device took it, and the
-- other one hears "call_already_answered" instead of joining as well.

alter table public.calls add column if not exists answered_device text;

create or replace function public.answer_call(p_call_id uuid, p_device text)
returns public.calls
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  c public.calls;
begin
  select * into c from public.calls where id = p_call_id for update;
  if not found or me <> c.callee_id then
    raise exception 'call_not_found' using errcode = 'P0002';
  end if;
  if c.status = 'ringing' then
    update public.calls set status = 'active', answered_at = now(), answered_device = p_device
    where id = c.id returning * into c;
    return c;
  end if;
  -- The same device asking again (a retry) is fine.
  if c.status = 'active' and c.answered_device is not distinct from p_device then
    return c;
  end if;
  raise exception 'call_already_answered' using errcode = 'P0001';
end;
$$;

revoke execute on function public.answer_call(uuid, text) from public, anon;
grant execute on function public.answer_call(uuid, text) to authenticated;

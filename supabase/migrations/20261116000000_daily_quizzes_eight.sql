-- Daily games: 8 questions a round instead of 5.
--
-- Today's rounds that neither of us has started are dropped, so they're made
-- again with 8 the next time either of us opens Connect.

delete from public.quiz_rounds r
where r.for_date >= current_date - 1
  and not exists (select 1 from public.quiz_answers a where a.round_id = r.id);

-- Today's round of each game (8 questions), made on first ask. Questions we haven't had come
-- first; once the bank runs out, the ones we had longest ago come back. Know me
-- is about one of us one day and the other the next. p_date is the caller's
-- local date, within a day of the server's.
create or replace function public.todays_quizzes(p_date date default null)
returns table (
  id uuid,
  kind text,
  created_by uuid,
  subject_id uuid,
  questions text[],
  for_date date,
  items jsonb,
  created_at timestamptz,
  my_answers smallint[],
  partner_done boolean,
  partner_answers smallint[]
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_couple    uuid := public.current_couple_id();
  v_me        uuid := auth.uid();
  v_partner   uuid := public.current_partner_id();
  v_date      date := coalesce(p_date, current_date);
  v_kind      text;
  v_questions text[];
begin
  if v_couple is null or v_partner is null then
    raise exception 'not_paired' using errcode = 'P0001';
  end if;
  if not public.has_feature('quizzes') then
    raise exception 'feature_off' using errcode = '42501';
  end if;
  if v_date not between current_date - 1 and current_date + 1 then
    raise exception 'date_out_of_range' using errcode = '22023';
  end if;

  foreach v_kind in array array['this_or_that', 'know_me', 'most_likely', 'rate_it'] loop
    continue when exists (select 1 from public.quiz_rounds r where r.couple_id = v_couple and r.kind = v_kind and r.for_date = v_date);

    select array_agg(s.qid) into v_questions
    from (
      select q.id as qid
      from public.quiz_questions q
      left join lateral (
        select max(r.created_at) as last from public.quiz_rounds r
        where r.couple_id = v_couple and r.kind = v_kind and q.id = any (r.questions)
      ) u on true
      where q.kind = v_kind and q.active
      order by u.last nulls first, random()
      limit 8
    ) s;
    continue when v_questions is null;

    insert into public.quiz_rounds (couple_id, kind, created_by, subject_id, questions, for_date)
    values (
      v_couple, v_kind, v_me,
      case when v_kind = 'know_me' then
        case when (v_date - date '2000-01-01') % 2 = 0 then least(v_me, v_partner) else greatest(v_me, v_partner) end
      end,
      v_questions, v_date
    )
    on conflict (couple_id, kind, for_date) where for_date is not null do nothing;
  end loop;

  return query select * from public.quiz_history(10, v_date);
end;
$$;
revoke execute on function public.todays_quizzes(date) from public, anon;
grant execute on function public.todays_quizzes(date) to authenticated;

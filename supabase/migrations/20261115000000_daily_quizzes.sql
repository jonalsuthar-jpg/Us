-- ============================================================================
-- Daily games: one round of each couple game per day, drawn from a question
-- bank that lives here instead of in the apps.
--
--   quiz_questions  READ-ONLY bank   know_me (about {name}, with options),
--                                    this_or_that (two options),
--                                    most_likely ("Who's more likely to…",
--                                    answered 0 = me, 1 = my partner),
--                                    rate_it (a thing, answered 1–10).
--   quiz_rounds     + for_date       a daily round. todays_quizzes() makes
--                                    today's rounds; the apps no longer insert.
--
-- The bank is seeded by the 2026111500010x migrations. Older rounds keep
-- working: the first 50 know-me and 60 this-or-that ids are the ones the apps
-- used to carry.
-- ============================================================================

alter table public.quiz_rounds drop constraint quiz_rounds_kind_check;
alter table public.quiz_rounds add constraint quiz_rounds_kind_check
  check (kind in ('know_me', 'this_or_that', 'most_likely', 'rate_it'));
alter table public.quiz_rounds add column for_date date;
create unique index quiz_rounds_daily_idx on public.quiz_rounds (couple_id, kind, for_date) where for_date is not null;

-- New rounds come only from todays_quizzes, one of each game a day.
drop policy "quiz_rounds: start as self" on public.quiz_rounds;
revoke insert on public.quiz_rounds from authenticated;

-- Know me and this or that pick an option (0–5), most likely picks a person
-- (0–1), rate it a score (1–10).
alter table public.quiz_answers add constraint quiz_answers_range check (0 <= all (answers) and 10 >= all (answers));

create table public.quiz_questions (
  id       text primary key,
  kind     text not null check (kind in ('know_me', 'this_or_that', 'most_likely', 'rate_it')),
  -- Know me: about the subject, {name} for them. This or that: none.
  prompt   text check (char_length(prompt) <= 200),
  options  text[] not null default '{}',
  active   boolean not null default true,
  constraint quiz_questions_shape check (
    case kind
      when 'know_me' then prompt is not null and cardinality(options) between 2 and 6
      when 'this_or_that' then cardinality(options) = 2
      else prompt is not null and cardinality(options) = 0
    end
  )
);
create index quiz_questions_kind_idx on public.quiz_questions (kind) where active;

alter table public.quiz_questions enable row level security;
create policy "quiz_questions: anyone signed in reads" on public.quiz_questions for select to authenticated using (true);
revoke insert, update, delete on public.quiz_questions from authenticated;
revoke all on public.quiz_questions from anon;

-- Our rounds, newest first, each with its questions spelled out (`items`), my
-- picks and, once we've both answered, my partner's. p_date: one day's rounds.
drop function public.quiz_history(int);
create or replace function public.quiz_history(p_limit int default 30, p_date date default null)
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
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.kind, r.created_by, r.subject_id, r.questions, r.for_date,
         (select coalesce(jsonb_agg(jsonb_build_object('id', o.qid, 'prompt', qq.prompt, 'options', coalesce(qq.options, '{}')) order by o.n), '[]')
            from unnest(r.questions) with ordinality as o (qid, n)
            left join public.quiz_questions qq on qq.id = o.qid),
         r.created_at,
         mine.answers,
         theirs.answers is not null,
         case when mine.answers is not null then theirs.answers end
  from public.quiz_rounds r
  left join public.quiz_answers mine on mine.round_id = r.id and mine.user_id = auth.uid()
  left join public.quiz_answers theirs on theirs.round_id = r.id and theirs.user_id = public.current_partner_id()
  where r.couple_id = public.current_couple_id() and public.has_feature('quizzes')
    and (p_date is null or r.for_date = p_date)
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 200);
$$;
revoke execute on function public.quiz_history(int, date) from public, anon;
grant execute on function public.quiz_history(int, date) to authenticated;

-- Today's round of each game, made on first ask. Questions we haven't had come
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
      limit 5
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

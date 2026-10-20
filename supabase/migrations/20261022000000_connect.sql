-- ============================================================================
-- Phase 3 · Connect — security tightening + Daily Question
--
-- The phase 3 stubs (20261020000200_future_phases.sql) gave the shared tables
-- a blanket "both partners read/write everything" policy. That is too open
-- for features built on a reveal:
--   * a partner could set future_letters.unlocked_at and open a letter early,
--   * either partner could set fight_sessions.revealed_at / cooldown_until,
--   * rows could be created in the other person's name (author_id, started_by),
--   * private answers/entries could be attached to another couple's rows.
-- This migration replaces those policies with the same pattern Plan and Memory
-- use: shared reads, writes only as yourself, and reveal state changed only
-- by SECURITY DEFINER functions (or the service role in Edge Functions).
--
-- Daily Question is built here end to end:
--   todays_question(date)  creates or returns the couple's prompt for a day
--   daily_history(limit)   my answers + my partner's, theirs only once we've
--                          both answered (before that: just "they answered")
-- ============================================================================

-- --------------------------------------------------------- fight translator ---
drop policy "fight_sessions: couple access" on public.fight_sessions;

create policy "fight_sessions: couple reads" on public.fight_sessions
  for select to authenticated
  using (couple_id = (select public.current_couple_id()));

create policy "fight_sessions: start as self" on public.fight_sessions
  for insert to authenticated
  with check (
    couple_id = (select public.current_couple_id())
    and started_by = (select auth.uid())
    and revealed_at is null
    and cooldown_until is null
  );

-- Reveal and cooldown are set by the fight-translator Edge Function only.
revoke update, delete on public.fight_sessions from authenticated;

drop policy "fight_entries: owner only" on public.fight_entries;

create policy "fight_entries: owner reads" on public.fight_entries
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- My raw entry, into a session of ours that hasn't been revealed yet.
-- reframed_need is written by the Edge Function, never by a client.
create policy "fight_entries: write own" on public.fight_entries
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and reframed_need is null
    and exists (
      select 1 from public.fight_sessions s
      where s.id = session_id
        and s.couple_id = (select public.current_couple_id())
        and s.revealed_at is null
    )
  );

revoke update, delete on public.fight_entries from authenticated;

-- ------------------------------------------------------------ future letters ---
drop policy "future_letters: couple access" on public.future_letters;

-- Both of us see the sealed envelope (title, unlock date); the body is separate.
create policy "future_letters: couple reads" on public.future_letters
  for select to authenticated
  using (couple_id = (select public.current_couple_id()));

create policy "future_letters: write as author" on public.future_letters
  for insert to authenticated
  with check (
    couple_id = (select public.current_couple_id())
    and author_id = (select auth.uid())
    and unlocked_at is null
  );

-- The author may adjust or withdraw a letter while it's still sealed.
create policy "future_letters: author edits sealed" on public.future_letters
  for update to authenticated
  using (author_id = (select auth.uid()) and unlocked_at is null)
  with check (author_id = (select auth.uid()) and unlocked_at is null);

create policy "future_letters: author deletes sealed" on public.future_letters
  for delete to authenticated
  using (author_id = (select auth.uid()) and unlocked_at is null);

-- unlocked_at is not in this list: only a definer function / the service role sets it.
revoke update on public.future_letters from authenticated;
grant update (title, unlock_at, unlock_milestone) on public.future_letters to authenticated;

drop policy "future_letter_bodies: owner only" on public.future_letter_bodies;

create policy "future_letter_bodies: author only" on public.future_letter_bodies
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.future_letters l
      where l.id = letter_id and l.author_id = (select auth.uid()) and l.unlocked_at is null
    )
  );

-- -------------------------------------------------------------- inside jokes ---
drop policy "inside_jokes: couple access" on public.inside_jokes;

create policy "inside_jokes: couple reads" on public.inside_jokes
  for select to authenticated
  using (couple_id = (select public.current_couple_id()));

create policy "inside_jokes: add as self" on public.inside_jokes
  for insert to authenticated
  with check (couple_id = (select public.current_couple_id()) and created_by = (select auth.uid()));

create policy "inside_jokes: couple edits" on public.inside_jokes
  for update to authenticated
  using (couple_id = (select public.current_couple_id()))
  with check (couple_id = (select public.current_couple_id()));

create policy "inside_jokes: couple deletes" on public.inside_jokes
  for delete to authenticated
  using (couple_id = (select public.current_couple_id()));

revoke update on public.inside_jokes from authenticated;
grant update (phrase, story, last_resurfaced_at) on public.inside_jokes to authenticated;

-- ------------------------------------------------------------ daily question ---
drop policy "daily_questions: couple access" on public.daily_questions;

create policy "daily_questions: couple reads" on public.daily_questions
  for select to authenticated
  using (couple_id = (select public.current_couple_id()));

-- Questions are created by todays_question() only.
revoke insert, update, delete on public.daily_questions from authenticated;

alter table public.daily_answers
  add constraint daily_answers_answer_len check (char_length(answer) between 1 and 2000);

drop policy "daily_answers: owner only" on public.daily_answers;

create policy "daily_answers: owner reads" on public.daily_answers
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "daily_answers: answer our questions" on public.daily_answers
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.daily_questions q
      where q.id = question_id and q.couple_id = (select public.current_couple_id())
    )
  );

-- Once sent, an answer is sealed: no editing it after seeing theirs.
revoke update, delete on public.daily_answers from authenticated;

revoke all on public.fight_sessions, public.fight_entries, public.future_letters, public.future_letter_bodies,
  public.inside_jokes, public.daily_questions, public.daily_answers from anon;

-- The prompt bank. Order is shuffled per couple (see todays_question).
create or replace function public.daily_prompts()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'What’s a small thing I do that makes you feel loved?',
    'What did you want to be when you were ten?',
    'Which day together would you happily live again?',
    'What’s something you’re quietly proud of this week?',
    'If we had a free Saturday with no plans, what would you want to do?',
    'What’s a song that reminds you of us?',
    'What’s one thing you’d like us to try together this year?',
    'When did you first realise you liked me?',
    'What’s a habit of mine you secretly find adorable?',
    'What’s something you need more of right now?',
    'Where would you go tomorrow if money and time didn’t matter?',
    'What’s a meal you’d want on a perfect day?',
    'What’s something you learned from your family that you want to keep?',
    'What’s something you learned from your family that you want to leave behind?',
    'What’s been on your mind lately that you haven’t said out loud?',
    'What’s a memory of us that makes you laugh?',
    'What does a good evening at home look like for you?',
    'What’s one thing I could take off your plate this week?',
    'Which friend of ours would you call in an emergency, and why?',
    'What’s a dream you’ve never told anyone?',
    'What’s the best gift you’ve ever received?',
    'How do you like to be comforted when you’re upset?',
    'What made you smile today?',
    'What do you think we’re really good at as a team?',
    'What’s something you want to get better at?',
    'Which tradition should we start?',
    'What’s a place that feels like home to you?',
    'What would you tell your younger self about love?',
    'What’s something I said that stayed with you?',
    'If today had a title, what would it be?',
    'What are you looking forward to this month?',
    'What’s a small adventure we could have this weekend?',
    'What’s the kindest thing a stranger has done for you?',
    'Which of your own qualities do you like most?',
    'What do you want our home to feel like?',
    'What’s something you were scared of that turned out fine?',
    'Which film or book character are you most like?',
    'What does “being there” for each other mean to you?',
    'What would your perfect birthday look like?',
    'What’s a question you wish I’d ask you more often?'
  ];
$$;

-- Today's question for the couple (created on first ask). p_date is the
-- caller's local date so "today" follows their clock; it must be within a day
-- of the server's date.
create or replace function public.todays_question(p_date date default null)
returns public.daily_questions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_couple uuid := public.current_couple_id();
  v_date   date := coalesce(p_date, current_date);
  v_prompts text[] := public.daily_prompts();
  v_len    int := array_length(v_prompts, 1);
  v_offset int;
  v_count  int;
  v_row    public.daily_questions;
begin
  if v_couple is null then
    raise exception 'not_paired' using errcode = 'P0001';
  end if;
  if v_date not between current_date - 1 and current_date + 1 then
    raise exception 'date_out_of_range' using errcode = '22023';
  end if;

  select * into v_row from public.daily_questions where couple_id = v_couple and for_date = v_date;
  if found then
    return v_row;
  end if;

  -- Walk the bank from a per-couple starting point, so no prompt repeats
  -- until every one has been asked.
  v_offset := ((hashtext(v_couple::text) % v_len) + v_len) % v_len;
  select count(*)::int into v_count from public.daily_questions where couple_id = v_couple;

  insert into public.daily_questions (couple_id, prompt, for_date)
  values (v_couple, v_prompts[1 + (v_offset + v_count) % v_len], v_date)
  on conflict (couple_id, for_date) do nothing
  returning * into v_row;

  if not found then
    -- My partner created it a moment ago.
    select * into v_row from public.daily_questions where couple_id = v_couple and for_date = v_date;
  end if;
  return v_row;
end;
$$;

-- Recent questions with both answers. My partner's answer is only included
-- once I've answered too (and they have); otherwise just whether they have.
create or replace function public.daily_history(p_limit int default 30)
returns table (
  question_id      uuid,
  prompt           text,
  for_date         date,
  my_answer        text,
  my_answered_at   timestamptz,
  partner_answered boolean,
  partner_answer   text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    q.id,
    q.prompt,
    q.for_date,
    mine.answer,
    mine.created_at,
    theirs.owner_id is not null,
    case when mine.owner_id is not null and theirs.owner_id is not null then theirs.answer end
  from public.daily_questions q
  left join public.daily_answers mine
    on mine.question_id = q.id and mine.owner_id = (select auth.uid())
  left join public.daily_answers theirs
    on theirs.question_id = q.id and theirs.owner_id = (select public.current_partner_id())
  where q.couple_id = (select public.current_couple_id())
  order by q.for_date desc
  limit least(greatest(coalesce(p_limit, 30), 1), 365);
$$;

revoke execute on function public.daily_prompts(), public.todays_question(date), public.daily_history(int) from public, anon;
grant execute on function public.todays_question(date), public.daily_history(int) to authenticated;

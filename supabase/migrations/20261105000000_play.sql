-- ============================================================================
-- Play: mini games, couple quizzes, and talk cards on calls.
--
--   games          SHARED (couple)   a turn-based game (tic-tac-toe, connect
--                                    four, word chain). The board lives in
--                                    `state`; it only changes through
--                                    game_move / game_resign, which check whose
--                                    turn it is and that nobody moved first.
--   quiz_rounds    SHARED (couple)   a round of "How well do you know me" or
--                                    "This or that": which questions, and for
--                                    know-me, whose answers are the true ones.
--   quiz_answers   PRIVATE (owner)   my picks. My partner sees them only once
--                                    we've both answered (quiz_history).
--
-- Talk cards on calls are ephemeral (synced over the couple channel) and need
-- only the feature switch.
-- ============================================================================

insert into public.features (key, label, module, sort) values
  ('games', 'Games', 'connect', 140),
  ('quizzes', 'Couple quizzes', 'connect', 145),
  ('call_cards', 'Cards on calls', 'talk', 22)
on conflict (key) do nothing;

update public.plans set features = features || array(select f from unnest(array['games', 'quizzes', 'call_cards']) f where not (f = any (features)))
where id = 'full';

update public.user_access set features = features || array(select f from unnest(array['games', 'quizzes', 'call_cards']) f where not (f = any (features))), updated_at = now()
where plan_id = 'full';

-- ------------------------------------------------------------------ games ---
create table public.games (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  kind        text not null check (kind in ('tictactoe', 'connect4', 'wordchain')),
  created_by  uuid not null references public.profiles (id) on delete cascade,
  state       jsonb not null check (pg_column_size(state) <= 16384),
  -- Whose move it is; null once the game is over.
  turn        uuid references public.profiles (id) on delete cascade,
  status      text not null default 'active' check (status in ('active', 'won', 'draw', 'abandoned')),
  winner      uuid references public.profiles (id) on delete set null,
  -- Bumped by every move, so a move made against an old board is refused.
  version     int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint games_turn_shape check ((status = 'active') = (turn is not null)),
  constraint games_winner_shape check ((status in ('won', 'abandoned')) = (winner is not null))
);
create index games_couple_updated_idx on public.games (couple_id, updated_at desc);

alter table public.games enable row level security;
create policy "games: couple reads" on public.games for select to authenticated
  using (couple_id = (select public.current_couple_id()));
create policy "games: start as self" on public.games for insert to authenticated
  with check (
    couple_id = (select public.current_couple_id())
    and created_by = (select auth.uid())
    and status = 'active' and version = 0 and winner is null
    and turn in ((select auth.uid()), (select public.current_partner_id()))
  );
create policy "games: feature games" on public.games as restrictive for all to authenticated
  using ((select public.has_feature('games'))) with check ((select public.has_feature('games')));
revoke update, delete on public.games from authenticated;
revoke all on public.games from anon;

-- My move: the new board, and whether it ended the game. The rules run in the
-- apps (packages/shared/src/games); here we make sure it's my turn, that the
-- board I moved on is still the current one, and that the result is sound.
create or replace function public.game_move(p_id uuid, p_version int, p_state jsonb, p_status text, p_winner uuid)
returns public.games
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.games;
  v_me uuid := auth.uid();
  v_partner uuid := public.current_partner_id();
begin
  select * into v_row from public.games where id = p_id for update;
  if not found or v_row.couple_id is distinct from public.current_couple_id() then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;
  if not public.has_feature('games') then
    raise exception 'feature_off' using errcode = '42501';
  end if;
  if v_row.status <> 'active' then
    raise exception 'game_over' using errcode = '22023';
  end if;
  if v_row.turn is distinct from v_me then
    raise exception 'not_your_turn' using errcode = '42501';
  end if;
  if v_row.version <> p_version then
    raise exception 'game_moved_on' using errcode = '40001';
  end if;
  if p_status not in ('active', 'won', 'draw')
     or (p_status = 'won') <> (p_winner is not null)
     or (p_winner is not null and p_winner not in (v_me, v_partner))
     or p_state is null or pg_column_size(p_state) > 16384 then
    raise exception 'bad_move' using errcode = '22023';
  end if;
  update public.games
  set state = p_state,
      status = p_status,
      winner = p_winner,
      turn = case when p_status = 'active' then v_partner end,
      version = version + 1,
      updated_at = now()
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;

-- Give up (either of us, any time): my partner wins.
create or replace function public.game_resign(p_id uuid)
returns public.games
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.games;
begin
  select * into v_row from public.games where id = p_id for update;
  if not found or v_row.couple_id is distinct from public.current_couple_id() then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;
  if not public.has_feature('games') then
    raise exception 'feature_off' using errcode = '42501';
  end if;
  if v_row.status <> 'active' then
    return v_row;
  end if;
  update public.games
  set status = 'abandoned', winner = public.current_partner_id(), turn = null, version = version + 1, updated_at = now()
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.game_move(uuid, int, jsonb, text, uuid) from public, anon;
revoke execute on function public.game_resign(uuid) from public, anon;
grant execute on function public.game_move(uuid, int, jsonb, text, uuid) to authenticated;
grant execute on function public.game_resign(uuid) to authenticated;

-- ---------------------------------------------------------------- quizzes ---
create table public.quiz_rounds (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  kind        text not null check (kind in ('know_me', 'this_or_that')),
  created_by  uuid not null references public.profiles (id) on delete cascade,
  -- Know me: the person the questions are about (their answers are the truth).
  subject_id  uuid references public.profiles (id) on delete cascade,
  questions   text[] not null check (cardinality(questions) between 1 and 20),
  created_at  timestamptz not null default now(),
  constraint quiz_rounds_subject_shape check ((kind = 'know_me') = (subject_id is not null))
);
create index quiz_rounds_couple_created_idx on public.quiz_rounds (couple_id, created_at desc);

alter table public.quiz_rounds enable row level security;
create policy "quiz_rounds: couple reads" on public.quiz_rounds for select to authenticated
  using (couple_id = (select public.current_couple_id()));
create policy "quiz_rounds: start as self" on public.quiz_rounds for insert to authenticated
  with check (
    couple_id = (select public.current_couple_id())
    and created_by = (select auth.uid())
    and (subject_id is null or subject_id in ((select auth.uid()), (select public.current_partner_id())))
  );
create policy "quiz_rounds: feature quizzes" on public.quiz_rounds as restrictive for all to authenticated
  using ((select public.has_feature('quizzes'))) with check ((select public.has_feature('quizzes')));
revoke update, delete on public.quiz_rounds from authenticated;
revoke all on public.quiz_rounds from anon;

create table public.quiz_answers (
  round_id    uuid not null references public.quiz_rounds (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- One pick per question, in order: the chosen option's index.
  answers     smallint[] not null check (cardinality(answers) between 1 and 20),
  created_at  timestamptz not null default now(),
  primary key (round_id, user_id)
);

alter table public.quiz_answers enable row level security;
-- Owner-only, always: the partner's picks come through quiz_history once both are in.
create policy "quiz_answers: own reads" on public.quiz_answers for select to authenticated
  using (user_id = (select auth.uid()));
create policy "quiz_answers: answer as self" on public.quiz_answers for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.quiz_rounds r
      where r.id = round_id and r.couple_id = (select public.current_couple_id()) and cardinality(r.questions) = cardinality(answers)
    )
  );
create policy "quiz_answers: feature quizzes" on public.quiz_answers as restrictive for all to authenticated
  using ((select public.has_feature('quizzes'))) with check ((select public.has_feature('quizzes')));
-- Sealed once sent.
revoke update, delete on public.quiz_answers from authenticated;
revoke all on public.quiz_answers from anon;

-- Our rounds, newest first, with my picks and, once we've both answered, my partner's.
create or replace function public.quiz_history(p_limit int default 30)
returns table (
  id uuid,
  kind text,
  created_by uuid,
  subject_id uuid,
  questions text[],
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
  select r.id, r.kind, r.created_by, r.subject_id, r.questions, r.created_at,
         mine.answers,
         theirs.answers is not null,
         case when mine.answers is not null then theirs.answers end
  from public.quiz_rounds r
  left join public.quiz_answers mine on mine.round_id = r.id and mine.user_id = auth.uid()
  left join public.quiz_answers theirs on theirs.round_id = r.id and theirs.user_id = public.current_partner_id()
  where r.couple_id = public.current_couple_id() and public.has_feature('quizzes')
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 200);
$$;
revoke execute on function public.quiz_history(int) from public, anon;
grant execute on function public.quiz_history(int) to authenticated;

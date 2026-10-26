-- ============================================================================
-- Draw together: drawings we keep, doodles for each other, Draw & Guess.
--
--   drawings      SHARED (couple)   a saved canvas, doodle, game round or
--                                   daily doodle; strokes + PNG in Storage
--   draw_words    SHARED (couple)   our own Draw & Guess words
--   draw_games    SHARED (couple)   Draw & Guess games and their scores
--   draw_secrets  the word of a turn-based round, hidden from the guesser
--                 until they've answered
--   storage bucket "drawings"       private; "<couple_id>/…" like memories
--
-- Rules
--   * Insert as yourself; only the creator deletes.
--   * A doodle is for my partner. Only they mark it seen (mark_doodle_seen).
--   * A daily doodle stays hidden from me until I've drawn mine that day.
--   * A Draw & Guess turn is answered only by the guesser (answer_guess).
--   * Everything needs the 'draw' feature, which existing full-plan people get.
-- ============================================================================

-- ---------------------------------------------------------------- feature ---
insert into public.features (key, label, module, sort) values ('draw', 'Draw together', 'connect', 135)
on conflict (key) do nothing;

update public.plans set features = array_append(features, 'draw')
where id = 'full' and not ('draw' = any (features));

update public.user_access set features = array_append(features, 'draw'), updated_at = now()
where plan_id = 'full' and not ('draw' = any (features));

-- --------------------------------------------------------------- drawings ---
create table public.drawings (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples (id) on delete cascade,
  created_by    uuid not null references public.profiles (id) on delete cascade,
  kind          text not null default 'canvas' check (kind in ('canvas', 'doodle', 'guess', 'daily')),
  title         text check (title is null or char_length(title) between 1 and 120),
  -- A line to go with a doodle.
  note          text check (note is null or char_length(note) between 1 and 200),
  strokes_path  text not null,
  png_path      text not null,
  width         int not null default 1200 check (width between 1 and 4000),
  height        int not null default 1600 check (height between 1 and 4000),
  stroke_count  int not null default 0 check (stroke_count >= 0),
  -- Who drew in it (both of us for a shared canvas).
  artists       uuid[] not null default '{}',
  -- Doodles: who it's for, and when they opened it.
  for_user      uuid references public.profiles (id) on delete cascade,
  seen_at       timestamptz,
  memory_id     uuid references public.memories (id) on delete set null,
  -- Daily doodles: the day (the drawer's calendar date) and its prompt.
  day           date,
  prompt        text check (prompt is null or char_length(prompt) <= 120),
  -- Draw & Guess turns: game, round, the word's hashes, hints, and the answer.
  game_id       uuid,
  round         int check (round is null or round between 0 and 20),
  meta          jsonb not null default '{}'::jsonb check (pg_column_size(meta) < 16384),
  answered_at   timestamptz,
  solved        boolean,
  answer_ms     int check (answer_ms is null or answer_ms between 0 and 600000),
  points        int check (points is null or points between 0 and 1000),
  created_at    timestamptz not null default now(),
  constraint drawings_files_in_couple_folder check (
    starts_with(strokes_path, couple_id::text || '/') and starts_with(png_path, couple_id::text || '/')
    and position('..' in strokes_path) = 0 and position('..' in png_path) = 0
  ),
  constraint drawings_doodle_has_recipient check ((kind = 'doodle') = (for_user is not null)),
  constraint drawings_daily_has_day check ((kind = 'daily') = (day is not null)),
  constraint drawings_guess_has_game check ((kind = 'guess') = (game_id is not null and round is not null))
);

create index drawings_couple_created_idx on public.drawings (couple_id, created_at desc);
create index drawings_unseen_idx on public.drawings (for_user) where seen_at is null;
create unique index drawings_one_daily_each on public.drawings (couple_id, created_by, day) where kind = 'daily';
create unique index drawings_one_turn_per_round on public.drawings (game_id, round) where kind = 'guess';

-- Have I drawn the daily doodle for this day? (Security definer: the policy
-- below can't query the table it guards.)
create or replace function public.drew_daily(p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.drawings
    where couple_id = public.current_couple_id() and created_by = auth.uid() and kind = 'daily' and day = p_day
  );
$$;

alter table public.drawings enable row level security;

create policy "drawings: couple reads" on public.drawings for select to authenticated
  using (
    couple_id = (select public.current_couple_id())
    and (kind <> 'daily' or created_by = (select auth.uid()) or public.drew_daily(day))
  );

create policy "drawings: create as self" on public.drawings for insert to authenticated
  with check (
    couple_id = (select public.current_couple_id())
    and created_by = (select auth.uid())
    and seen_at is null and answered_at is null and solved is null and answer_ms is null and points is null
    and (for_user is null or for_user = (select public.current_partner_id()))
  );

-- Only the title and the memory link change in place; the rest goes through functions.
create policy "drawings: creator edits" on public.drawings for update to authenticated
  using (couple_id = (select public.current_couple_id()) and created_by = (select auth.uid()))
  with check (couple_id = (select public.current_couple_id()) and created_by = (select auth.uid()));

create policy "drawings: creator deletes" on public.drawings for delete to authenticated
  using (couple_id = (select public.current_couple_id()) and created_by = (select auth.uid()));

revoke update on public.drawings from authenticated;
grant update (title, memory_id) on public.drawings to authenticated;

-- My partner opened the doodle I left them.
create or replace function public.mark_doodle_seen(p_id uuid)
returns public.drawings
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.drawings;
begin
  select * into v_row from public.drawings where id = p_id for update;
  if not found or v_row.couple_id is distinct from public.current_couple_id() then
    raise exception 'drawing_not_found' using errcode = 'P0002';
  end if;
  if v_row.kind <> 'doodle' or v_row.for_user is distinct from auth.uid() then
    raise exception 'only the person it is for can open it' using errcode = '42501';
  end if;
  update public.drawings set seen_at = coalesce(seen_at, now()) where id = p_id returning * into v_row;
  return v_row;
end;
$$;

-- Did each of us draw the daily doodle for this day? (Never shows the drawing.)
create or replace function public.daily_doodle_status(p_day date)
returns table (mine boolean, partner boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (select 1 from public.drawings where couple_id = public.current_couple_id() and kind = 'daily' and day = p_day and created_by = auth.uid()),
    exists (select 1 from public.drawings where couple_id = public.current_couple_id() and kind = 'daily' and day = p_day and created_by = public.current_partner_id());
$$;

-- --------------------------------------------------------------- words ---
create table public.draw_words (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  word        text not null check (char_length(btrim(word)) between 1 and 40),
  added_by    uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create unique index draw_words_unique on public.draw_words (couple_id, lower(btrim(word)));

alter table public.draw_words enable row level security;
create policy "draw_words: couple reads" on public.draw_words for select to authenticated
  using (couple_id = (select public.current_couple_id()));
create policy "draw_words: add as self" on public.draw_words for insert to authenticated
  with check (couple_id = (select public.current_couple_id()) and added_by = (select auth.uid()));
create policy "draw_words: couple removes" on public.draw_words for delete to authenticated
  using (couple_id = (select public.current_couple_id()));
revoke update on public.draw_words from authenticated;

-- --------------------------------------------------------------- games ---
create table public.draw_games (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  started_by   uuid not null references public.profiles (id) on delete cascade,
  mode         text not null default 'live' check (mode in ('live', 'turns')),
  packs        text[] not null default '{everyday}',
  rounds       int not null default 6 check (rounds between 1 and 20),
  -- Rounds finished so far.
  played       int not null default 0 check (played >= 0),
  score        int not null default 0 check (score between 0 and 100000),
  solved       int not null default 0 check (solved >= 0),
  best_word    text check (best_word is null or char_length(best_word) <= 40),
  best_ms      int check (best_ms is null or best_ms >= 0),
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint draw_games_played_le_rounds check (played <= rounds)
);
create index draw_games_couple_idx on public.draw_games (couple_id, created_at desc);

alter table public.drawings add constraint drawings_game_fk foreign key (game_id) references public.draw_games (id) on delete cascade;

alter table public.draw_games enable row level security;
create policy "draw_games: couple reads" on public.draw_games for select to authenticated
  using (couple_id = (select public.current_couple_id()));
create policy "draw_games: start as self" on public.draw_games for insert to authenticated
  with check (
    couple_id = (select public.current_couple_id()) and started_by = (select auth.uid())
    and played = 0 and score = 0 and solved = 0 and finished_at is null
  );
revoke update, delete on public.draw_games from authenticated;

-- A turn's word, kept apart so the guesser can't read it before answering.
create table public.draw_secrets (
  drawing_id  uuid primary key references public.drawings (id) on delete cascade,
  couple_id   uuid not null references public.couples (id) on delete cascade,
  word        text not null check (char_length(word) between 1 and 40)
);

alter table public.draw_secrets enable row level security;
create policy "draw_secrets: drawer, or after answering" on public.draw_secrets for select to authenticated
  using (
    couple_id = (select public.current_couple_id())
    and exists (
      select 1 from public.drawings d
      where d.id = drawing_id and (d.created_by = (select auth.uid()) or d.answered_at is not null)
    )
  );
create policy "draw_secrets: the drawer adds" on public.draw_secrets for insert to authenticated
  with check (
    couple_id = (select public.current_couple_id())
    and exists (select 1 from public.drawings d where d.id = drawing_id and d.created_by = (select auth.uid()) and d.kind = 'guess')
  );
revoke update, delete on public.draw_secrets from authenticated;

-- A live game's result, written once by whoever's device finished it.
create or replace function public.finish_draw_game(p_id uuid, p_played int, p_score int, p_solved int, p_best_word text, p_best_ms int)
returns public.draw_games
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.draw_games;
begin
  select * into v_row from public.draw_games where id = p_id for update;
  if not found or v_row.couple_id is distinct from public.current_couple_id() then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;
  if not public.has_feature('draw') then
    raise exception 'feature_off' using errcode = '42501';
  end if;
  if v_row.finished_at is not null then
    return v_row;
  end if;
  if p_played < 0 or p_played > v_row.rounds or p_solved < 0 or p_solved > p_played
     or p_score < 0 or p_score > p_played * 200 then
    raise exception 'bad_result' using errcode = '22023';
  end if;
  update public.draw_games
  set played = p_played, score = p_score, solved = p_solved,
      best_word = left(p_best_word, 40), best_ms = p_best_ms, finished_at = now(), updated_at = now()
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;

-- The guesser answers a turn of a game played in turns. Scores add to the
-- game; the last round finishes it.
create or replace function public.answer_guess(p_drawing uuid, p_solved boolean, p_ms int, p_points int)
returns public.draw_games
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d public.drawings;
  v_g public.draw_games;
  v_level text;
  v_max int;
begin
  select * into v_d from public.drawings where id = p_drawing for update;
  if not found or v_d.couple_id is distinct from public.current_couple_id() or v_d.kind <> 'guess' then
    raise exception 'drawing_not_found' using errcode = 'P0002';
  end if;
  if not public.has_feature('draw') then
    raise exception 'feature_off' using errcode = '42501';
  end if;
  if v_d.created_by = auth.uid() then
    raise exception 'the drawer cannot answer' using errcode = '42501';
  end if;
  if v_d.answered_at is not null then
    raise exception 'already_answered' using errcode = '23505';
  end if;
  v_level := coalesce(v_d.meta ->> 'level', 'easy');
  v_max := case v_level when 'hard' then 200 when 'medium' then 150 else 100 end;
  if p_ms < 0 or p_ms > 600000 or p_points < 0 or p_points > v_max or (not p_solved and p_points <> 0) then
    raise exception 'bad_answer' using errcode = '22023';
  end if;
  update public.drawings set answered_at = now(), solved = p_solved, answer_ms = p_ms, points = p_points where id = p_drawing;

  select * into v_g from public.draw_games where id = v_d.game_id for update;
  update public.draw_games
  set played = least(rounds, played + 1),
      score = score + p_points,
      solved = solved + case when p_solved then 1 else 0 end,
      best_word = case when p_solved and (best_ms is null or p_ms < best_ms) then (select left(w.word, 40) from public.draw_secrets w where w.drawing_id = v_d.id) else best_word end,
      best_ms = case when p_solved and (best_ms is null or p_ms < best_ms) then p_ms else best_ms end,
      finished_at = case when played + 1 >= rounds then now() else finished_at end,
      updated_at = now()
  where id = v_g.id
  returning * into v_g;
  return v_g;
end;
$$;

revoke execute on function public.drew_daily(date), public.mark_doodle_seen(uuid), public.daily_doodle_status(date),
  public.finish_draw_game(uuid, int, int, int, text, int), public.answer_guess(uuid, boolean, int, int) from public, anon;
grant execute on function public.drew_daily(date), public.mark_doodle_seen(uuid), public.daily_doodle_status(date),
  public.finish_draw_game(uuid, int, int, int, text, int), public.answer_guess(uuid, boolean, int, int) to authenticated;

-- ------------------------------------------------------- feature gating ---
create policy "drawings: feature draw" on public.drawings as restrictive for all to authenticated
  using ((select public.has_feature('draw'))) with check ((select public.has_feature('draw')));
create policy "draw_words: feature draw" on public.draw_words as restrictive for all to authenticated
  using ((select public.has_feature('draw'))) with check ((select public.has_feature('draw')));
create policy "draw_secrets: feature draw" on public.draw_secrets as restrictive for all to authenticated
  using ((select public.has_feature('draw'))) with check ((select public.has_feature('draw')));
create policy "draw_games: feature draw" on public.draw_games as restrictive for all to authenticated
  using ((select public.has_feature('draw'))) with check ((select public.has_feature('draw')));

revoke all on public.drawings, public.draw_words, public.draw_games, public.draw_secrets from anon;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.drawings, public.draw_games;
  end if;
end;
$$;

-- --------------------------------------------------------------- storage ---
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('drawings', 'drawings', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/json'])
    on conflict (id) do nothing;

    execute $p$
      create policy "drawings bucket: couple reads" on storage.objects for select to authenticated
      using (bucket_id = 'drawings' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
    $p$;
    execute $p$
      create policy "drawings bucket: couple uploads" on storage.objects for insert to authenticated
      with check (bucket_id = 'drawings' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
    $p$;
    execute $p$
      create policy "drawings bucket: couple deletes" on storage.objects for delete to authenticated
      using (bucket_id = 'drawings' and (storage.foldername(name))[1] = (select public.current_couple_id())::text)
    $p$;
  end if;
end;
$$;

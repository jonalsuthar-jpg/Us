-- The mini games (tic-tac-toe, connect four, word chain) are gone from both
-- apps; couple quizzes and talk cards on calls stay. Their games go with
-- them: this cannot be undone.

drop function if exists public.game_move(uuid, int, jsonb, text, uuid);
drop function if exists public.game_resign(uuid);
drop table if exists public.games cascade;

update public.plans set features = array(select f from unnest(features) f where f <> 'games')
where 'games' = any (features);
update public.user_access set features = array(select f from unnest(features) f where f <> 'games'), updated_at = now()
where 'games' = any (features);
delete from public.features where key = 'games';

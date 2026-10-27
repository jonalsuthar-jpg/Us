-- Draw & Guess settings, chosen before a game like Scribble's lobby: how long
-- to draw, how many hint letters and how many words to pick from. Rounds was
-- already there. Games from before keep the old rules (80 s, 3 hints, 3 words).
alter table public.draw_games
  add column draw_ms int not null default 80000 check (draw_ms between 30000 and 180000),
  add column hints   int not null default 3     check (hints between 0 and 5),
  add column choices int not null default 3     check (choices between 1 and 5);


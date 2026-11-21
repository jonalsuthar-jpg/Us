-- Our money: the lake pays too (a fish caught off the jetty, shells from the beach).
create or replace function public.wallet_reward(p_reason text)
returns table (amount integer, per_day integer)
language sql
immutable
as $$
  select r.amount, r.per_day from (values
    ('daily', 25, 2),        -- coming in, once a day each
    ('together', 20, 3),     -- doing something together
    ('game', 15, 8),         -- finishing a game
    ('game_win', 30, 8),     -- winning one
    ('dinner', 40, 3),       -- cooking dinner
    ('harvest', 20, 6),      -- picking from the garden
    ('catch', 5, 10),        -- a catch streak
    ('treasure', 25, 3),     -- finding the treasure
    ('fish', 10, 8),         -- a fish caught off the jetty
    ('shells', 5, 8)         -- shells from the beach
  ) as r(reason, amount, per_day)
  where r.reason = p_reason;
$$;

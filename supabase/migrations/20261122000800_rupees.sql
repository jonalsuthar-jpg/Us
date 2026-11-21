-- Our money in rupees, at prices that feel like India: every amount ×10.
-- The balance and the history are scaled once, so nothing anyone had is lost.
create or replace function public.wallet_reward(p_reason text)
returns table (amount integer, per_day integer)
language sql
immutable
as $$
  select r.amount, r.per_day from (values
    ('daily', 250, 2),        -- coming in, once a day each
    ('together', 200, 3),     -- doing something together
    ('game', 150, 8),         -- finishing a game
    ('game_win', 300, 8),     -- winning one
    ('dinner', 400, 3),       -- cooking dinner
    ('harvest', 200, 6),      -- picking from the garden
    ('catch', 50, 10),        -- a catch streak
    ('treasure', 250, 3),     -- finding the treasure
    ('fish', 100, 8),         -- a fish caught off the jetty
    ('shells', 50, 8)         -- shells from the beach
  ) as r(reason, amount, per_day)
  where r.reason = p_reason;
$$;

create or replace function public.wallet_price(p_item text)
returns integer
language sql
immutable
as $$
  select case p_item
    when 'gift:flowers' then 200
    when 'gift:box' then 300
    when 'bread' then 80
    when 'coffee' then 120
    when 'bouquet' then 250
    when 'furniture:plantPot' then 250
    when 'furniture:armchair' then 600
    when 'furniture:beanbag' then 450
    when 'furniture:floorLamp' then 400
    when 'furniture:rug' then 500
    when 'furniture:bookshelf' then 700
    when 'furniture:coffeeTable' then 350
    when 'bus_ticket' then 150
  end;
$$;

update public.wallets set balance = balance * 10;
update public.wallet_ledger set delta = delta * 10;

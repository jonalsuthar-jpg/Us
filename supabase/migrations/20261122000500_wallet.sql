-- ============================================================================
-- Our money: a shared couple balance, earned by doing things together in the
-- house and the village, spent on gifts, treats and furniture.
--
--   wallets         SHARED (couple)  the balance
--   wallet_ledger   SHARED (couple)  every change, who, why, and a ref
--
-- Rules
--   * The balance lives here, never in the app. Money only moves through
--     earn() and spend(), and they decide the amounts from the lists below:
--     an app can't send itself money or set its own price.
--   * Each earning or purchase has a ref ("dinner:2026-11-22T…"), unique per
--     couple: the same thing never pays (or charges) twice.
--   * Each kind of earning has a daily cap, and no couple moves money more
--     than 30 times a minute (a misbehaving app can't flood the database).
--   * Everything needs the 'house' feature.
-- ============================================================================

create table public.wallets (
  couple_id  uuid primary key references public.couples (id) on delete cascade,
  balance    integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.wallet_ledger (
  id         bigint generated always as identity primary key,
  couple_id  uuid not null references public.couples (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,
  delta      integer not null,
  reason     text not null check (reason ~ '^[a-z_:]{1,40}$'),
  ref        text not null check (ref ~ '^[A-Za-z0-9:_.\-]{1,120}$'),
  created_at timestamptz not null default now(),
  unique (couple_id, ref)
);
create index wallet_ledger_recent on public.wallet_ledger (couple_id, created_at desc);

alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;
create policy "wallets: couple reads" on public.wallets for select to authenticated
  using (couple_id = (select public.current_couple_id()));
create policy "wallet_ledger: couple reads" on public.wallet_ledger for select to authenticated
  using (couple_id = (select public.current_couple_id()));
create policy "wallets: feature house" on public.wallets as restrictive for all to authenticated
  using ((select public.has_feature('house'))) with check ((select public.has_feature('house')));
create policy "wallet_ledger: feature house" on public.wallet_ledger as restrictive for all to authenticated
  using ((select public.has_feature('house'))) with check ((select public.has_feature('house')));
revoke insert, update, delete on public.wallets, public.wallet_ledger from authenticated, anon;

-- What things pay, and how many times a day each may (packages/shared/src/api/wallet.ts mirrors this for the app).
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
    ('treasure', 25, 3)      -- finding the treasure
  ) as r(reason, amount, per_day)
  where r.reason = p_reason;
$$;

-- What things cost.
create or replace function public.wallet_price(p_item text)
returns integer
language sql
immutable
as $$
  select case p_item
    when 'gift:flowers' then 20
    when 'gift:box' then 30
    when 'bread' then 8
    when 'coffee' then 12
    when 'bouquet' then 25
    when 'furniture:plantPot' then 25
    when 'furniture:armchair' then 60
    when 'furniture:beanbag' then 45
    when 'furniture:floorLamp' then 40
    when 'furniture:rug' then 50
    when 'furniture:bookshelf' then 70
    when 'furniture:coffeeTable' then 35
    when 'bus_ticket' then 15
  end;
$$;

-- The couple's wallet row, made on first use.
create or replace function public.wallet_row(p_couple uuid)
returns public.wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.wallets;
begin
  insert into public.wallets (couple_id) values (p_couple) on conflict (couple_id) do nothing;
  select * into v from public.wallets where couple_id = p_couple for update;
  return v;
end;
$$;
revoke execute on function public.wallet_row(uuid) from public, anon, authenticated;

create or replace function public.wallet_guard(p_couple uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.wallet_ledger where couple_id = p_couple and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'too fast' using errcode = '53400';
  end if;
end;
$$;
revoke execute on function public.wallet_guard(uuid) from public, anon, authenticated;

-- Earn for something done. Returns the new balance; 0 added if it already paid, or today's cap is reached.
create or replace function public.earn(p_reason text, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple uuid := public.current_couple_id();
  v_reward record;
  v_today integer;
  v_wallet public.wallets;
begin
  if v_couple is null then
    raise exception 'not paired' using errcode = '42501';
  end if;
  if not public.has_feature('house') then
    raise exception 'feature off' using errcode = '42501';
  end if;
  select * into v_reward from public.wallet_reward(p_reason);
  if v_reward.amount is null then
    raise exception 'bad reason' using errcode = '22023';
  end if;
  if p_ref is null or p_ref !~ '^[A-Za-z0-9:_.\-]{1,120}$' then
    raise exception 'bad ref' using errcode = '22023';
  end if;
  perform public.wallet_guard(v_couple);
  v_wallet := public.wallet_row(v_couple);
  if exists (select 1 from public.wallet_ledger where couple_id = v_couple and ref = p_ref) then
    return jsonb_build_object('balance', v_wallet.balance, 'added', 0, 'why', 'already');
  end if;
  select count(*) into v_today from public.wallet_ledger
  where couple_id = v_couple and reason = p_reason and delta > 0 and created_at > date_trunc('day', now());
  if v_today >= v_reward.per_day then
    return jsonb_build_object('balance', v_wallet.balance, 'added', 0, 'why', 'cap');
  end if;
  insert into public.wallet_ledger (couple_id, user_id, delta, reason, ref) values (v_couple, auth.uid(), v_reward.amount, p_reason, p_ref);
  update public.wallets set balance = balance + v_reward.amount, updated_at = now() where couple_id = v_couple returning * into v_wallet;
  return jsonb_build_object('balance', v_wallet.balance, 'added', v_reward.amount);
end;
$$;

-- Buy something. Returns the new balance; refuses when there isn't enough.
create or replace function public.spend(p_item text, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple uuid := public.current_couple_id();
  v_price integer := public.wallet_price(p_item);
  v_wallet public.wallets;
begin
  if v_couple is null then
    raise exception 'not paired' using errcode = '42501';
  end if;
  if not public.has_feature('house') then
    raise exception 'feature off' using errcode = '42501';
  end if;
  if v_price is null then
    raise exception 'bad item' using errcode = '22023';
  end if;
  if p_ref is null or p_ref !~ '^[A-Za-z0-9:_.\-]{1,120}$' then
    raise exception 'bad ref' using errcode = '22023';
  end if;
  perform public.wallet_guard(v_couple);
  v_wallet := public.wallet_row(v_couple);
  if exists (select 1 from public.wallet_ledger where couple_id = v_couple and ref = p_ref) then
    return jsonb_build_object('balance', v_wallet.balance, 'spent', 0, 'why', 'already');
  end if;
  if v_wallet.balance < v_price then
    raise exception 'not enough' using errcode = 'P0001';
  end if;
  insert into public.wallet_ledger (couple_id, user_id, delta, reason, ref) values (v_couple, auth.uid(), -v_price, 'spend:' || split_part(p_item, ':', 1), p_ref);
  update public.wallets set balance = balance - v_price, updated_at = now() where couple_id = v_couple returning * into v_wallet;
  return jsonb_build_object('balance', v_wallet.balance, 'spent', v_price);
end;
$$;

revoke execute on function public.earn(text, text), public.spend(text, text) from public, anon;
grant execute on function public.earn(text, text), public.spend(text, text) to authenticated;
revoke execute on function public.wallet_reward(text), public.wallet_price(text) from public, anon;
grant execute on function public.wallet_reward(text), public.wallet_price(text) to authenticated;

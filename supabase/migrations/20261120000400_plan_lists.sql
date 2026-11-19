-- ============================================================================
-- Plan: our own lists beside the four built in, receipts on expenses.
--
--   lists              SHARED (couple)  a list we named ("Gifts", "Garden"),
--                                       up to 20; its items are list_items
--                                       with list = 'custom' and list_id set.
--   expenses.receipt_path  a photo in our folder of the memories bucket.
--
-- Expenses could already be edited by either of us (RLS "couple access");
-- the apps now offer it.
-- ============================================================================

create table public.lists (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  emoji      text check (emoji is null or char_length(emoji) <= 16),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index lists_couple_idx on public.lists (couple_id, created_at);

alter table public.lists enable row level security;
create policy "lists: couple reads" on public.lists for select to authenticated
  using (couple_id = (select public.current_couple_id()));
create policy "lists: add as self" on public.lists for insert to authenticated
  with check (couple_id = (select public.current_couple_id()) and created_by = (select auth.uid()));
create policy "lists: couple edits" on public.lists for update to authenticated
  using (couple_id = (select public.current_couple_id()))
  with check (couple_id = (select public.current_couple_id()));
create policy "lists: couple deletes" on public.lists for delete to authenticated
  using (couple_id = (select public.current_couple_id()));
create policy "lists: feature lists" on public.lists as restrictive for all to authenticated
  using ((select public.has_feature('lists'))) with check ((select public.has_feature('lists')));
revoke update on public.lists from authenticated;
grant update (name, emoji) on public.lists to authenticated;

-- At most 20 of our own.
create or replace function public.lists_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.lists where couple_id = new.couple_id) >= 20 then
    raise exception 'too_many_lists' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger lists_limit before insert on public.lists for each row execute function public.lists_limit();

-- Items: a built-in list by name, or one of ours by id.
alter table public.list_items
  add column list_id uuid references public.lists (id) on delete cascade,
  drop constraint list_items_list_check,
  add constraint list_items_list_check check (
    (list in ('groceries', 'bucket', 'watch', 'read') and list_id is null)
    or (list = 'custom' and list_id is not null)
  );
create index list_items_list_id_idx on public.list_items (list_id) where list_id is not null;

create or replace function public.list_in_my_couple(p_list uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.lists l where l.id = p_list and l.couple_id = public.current_couple_id());
$$;
revoke execute on function public.list_in_my_couple(uuid) from public, anon;
grant execute on function public.list_in_my_couple(uuid) to authenticated;

create policy "list_items: our own lists" on public.list_items as restrictive for insert to authenticated
  with check (list_id is null or (select public.list_in_my_couple(list_id)));

-- --------------------------------------------------------------- receipts ---
alter table public.expenses
  add column receipt_path text,
  add constraint expenses_receipt_in_couple_folder
    check (receipt_path is null or receipt_path like couple_id::text || '/receipts/%');

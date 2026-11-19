-- ============================================================================
-- The chat's info screen: things saved for ourselves, and a look we share.
--
--   saved_messages  PRIVATE (owner)  messages I starred to find again
--   chat_settings   PRIVATE (owner)  my nickname for my partner
--   chat_themes     SHARED (couple)  the chat's background, for both of us
-- ============================================================================

-- message_in_my_couple() (20261023000100_chat.sql) checks a saved message is one of ours.
create table public.saved_messages (
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  saved_at   timestamptz not null default now(),
  primary key (owner_id, message_id)
);
create index saved_messages_owner_idx on public.saved_messages (owner_id, saved_at desc);
alter table public.saved_messages enable row level security;
create policy "saved_messages: mine" on public.saved_messages for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (select public.message_in_my_couple(message_id)));
revoke update on public.saved_messages from authenticated;

create table public.chat_settings (
  owner_id         uuid primary key references public.profiles (id) on delete cascade,
  partner_nickname text check (partner_nickname is null or char_length(btrim(partner_nickname)) between 1 and 40),
  updated_at       timestamptz not null default now()
);
alter table public.chat_settings enable row level security;
create policy "chat_settings: mine" on public.chat_settings for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create table public.chat_themes (
  couple_id  uuid primary key references public.couples (id) on delete cascade,
  theme      text not null default 'paper' check (theme in ('paper', 'rose', 'teal', 'sage', 'gold', 'night')),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.chat_themes enable row level security;
create policy "chat_themes: couple" on public.chat_themes for all to authenticated
  using (couple_id = (select public.current_couple_id()))
  with check (couple_id = (select public.current_couple_id()) and updated_by = (select auth.uid()));
create policy "chat_themes: feature chat" on public.chat_themes as restrictive for all to authenticated
  using ((select public.has_feature('chat'))) with check ((select public.has_feature('chat')));

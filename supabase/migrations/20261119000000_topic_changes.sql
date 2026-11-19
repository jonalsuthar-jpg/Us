-- ============================================================================
-- Catch-up after a sleep. The "changed" pings on the couple channel are
-- ephemeral, so a phone whose link slept in the background used to refetch
-- every screen when it woke. Now each ping also stamps its topic here, and
-- the woken app asks once which topics moved and reloads only those.
--
--   topic_changes     SHARED (couple)  one row per topic: when it last
--                                      changed. Says *that* something
--                                      changed, never *what*.
-- ============================================================================

create table public.topic_changes (
  couple_id  uuid not null references public.couples (id) on delete cascade,
  topic      text not null check (char_length(topic) between 1 and 64),
  changed_at timestamptz not null default now(),
  primary key (couple_id, topic)
);

alter table public.topic_changes enable row level security;
create policy "topic_changes: couple reads" on public.topic_changes for select to authenticated
  using (couple_id = (select public.current_couple_id()));
revoke insert, update, delete on public.topic_changes from authenticated;

-- Stamp a topic of ours as changed now. Does nothing when I'm not paired.
create or replace function public.touch_topic(p_topic text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_couple uuid := public.current_couple_id();
begin
  if v_couple is null or p_topic is null or char_length(p_topic) not between 1 and 64 then
    return;
  end if;
  insert into public.topic_changes (couple_id, topic, changed_at)
  values (v_couple, p_topic, now())
  on conflict (couple_id, topic) do update set changed_at = now();
end;
$$;

revoke execute on function public.touch_topic(text) from public, anon;
grant execute on function public.touch_topic(text) to authenticated;

-- Topics of ours that changed after p_since, plus a cursor to pass next time.
-- The cursor sits a minute behind the server's clock, so a ping stamped while
-- this answer was on its way is still caught (at worst, reloaded twice).
-- The plant is written by triggers, never pinged, so its days count too.
create or replace function public.changed_topics(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.current_couple_id() as couple_id)
  select jsonb_build_object(
    'cursor', now() - interval '1 minute',
    'topics', coalesce((
      select jsonb_agg(t.topic)
      from (
        select tc.topic
        from public.topic_changes tc, me
        where tc.couple_id = me.couple_id and p_since is not null and tc.changed_at > p_since
        union
        select 'plant'
        from public.plant_days pd, me
        where pd.couple_id = me.couple_id and p_since is not null
          and pd.day >= (p_since at time zone 'UTC')::date - 1
          and greatest(pd.a_at, pd.b_at) > p_since
      ) t
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.changed_topics(timestamptz) from public, anon;
grant execute on function public.changed_topics(timestamptz) to authenticated;

-- ============================================================================
-- Our House: a shared 3D home with a garden and a pool.
--
-- Phase 0 is live only: where each of us stands travels over the couple
-- channel and nothing is saved, so this adds just the feature. Saved state
-- (lights, doors, moved things, decorating) comes with house_items later.
-- Everyone on the full plan gets it, like Draw together.
-- ============================================================================

insert into public.features (key, label, module, sort) values ('house', 'Our house', 'connect', 137)
on conflict (key) do nothing;

update public.plans set features = array_append(features, 'house')
where id = 'full' and not ('house' = any (features));

update public.user_access set features = array_append(features, 'house'), updated_at = now()
where plan_id = 'full' and not ('house' = any (features));

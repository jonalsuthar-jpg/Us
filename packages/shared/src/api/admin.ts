import type { FeatureKey } from '../features';
import type { UsClient } from '../supabase';
import type { AccessStatus } from './access';

/** Admin console API. Every call is checked by the database (public.is_admin()). */

export interface AdminStats {
  people: number;
  by_status: Partial<Record<AccessStatus, number>>;
  couples: number;
  unpaired_approved: number;
  active_1d: number;
  active_7d: number;
  active_30d: number;
  signups: { day: string; n: number }[];
  activity: { day: string; messages: number; calls: number }[];
  push_failures_7d: number;
}

export interface AdminPerson {
  user_id: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  status: AccessStatus;
  is_admin: boolean;
  /** The founding couple: always approved with everything; can't be changed. */
  protected: boolean;
  plan_id: string | null;
  features: FeatureKey[];
  reason: string | null;
  note: string | null;
  requested_at: string;
  decided_at: string | null;
  last_seen: string | null;
  couple_id: string | null;
  partner_id: string | null;
  partner_name: string | null;
  paired_at: string | null;
}

export interface Plan {
  id: string;
  name: string;
  features: FeatureKey[];
  is_default: boolean;
  price_note: string | null;
  sort: number;
}

export interface FeatureSwitch {
  key: FeatureKey;
  label: string;
  module: string;
  sort: number;
  enabled: boolean;
  disabled_message: string | null;
}

export interface AnnouncementRow {
  id: string;
  body: string;
  tone: 'note' | 'warning';
  starts_at: string;
  ends_at: string | null;
}

export interface AuditEntry {
  id: number;
  admin_name: string | null;
  action: string;
  target_user: string | null;
  target_name: string | null;
  target_couple: string | null;
  before: unknown;
  after: unknown;
  at: string;
}

function unwrap<T>({ data, error }: { data: unknown; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

export async function adminStats(sb: UsClient): Promise<AdminStats> {
  return unwrap(await sb.rpc('admin_stats'));
}

export async function adminPeople(sb: UsClient, opts: { status?: AccessStatus | null; search?: string } = {}): Promise<AdminPerson[]> {
  return unwrap(await sb.rpc('admin_list_people', { p_status: opts.status ?? null, p_search: opts.search?.trim() || null }));
}

/** Approve (with a plan or a hand-picked set), reject, suspend or reinstate. */
export async function adminDecide(
  sb: UsClient,
  userId: string,
  status: AccessStatus,
  opts: { plan?: string | null; features?: FeatureKey[] | null; reason?: string | null } = {},
): Promise<void> {
  unwrap(
    await sb.rpc('admin_decide', {
      p_user: userId,
      p_status: status,
      p_plan: opts.plan ?? null,
      p_features: opts.features ?? null,
      p_reason: opts.reason ?? null,
    }),
  );
}

/** One feature set for both partners. */
export async function adminSetCoupleFeatures(sb: UsClient, coupleId: string, opts: { plan?: string | null; features?: FeatureKey[] | null }) {
  unwrap(await sb.rpc('admin_set_couple_features', { p_couple: coupleId, p_plan: opts.plan ?? null, p_features: opts.features ?? null }));
}

export async function adminSetNote(sb: UsClient, userId: string, note: string) {
  unwrap(await sb.rpc('admin_set_note', { p_user: userId, p_note: note }));
}

export async function adminSetAdmin(sb: UsClient, userId: string, admin: boolean) {
  unwrap(await sb.rpc('admin_set_admin', { p_user: userId, p_admin: admin }));
}

/** Remove someone who never paired (spam, mistakes). Paired accounts can't be deleted from here. */
export async function adminDeleteUser(sb: UsClient, userId: string) {
  const { data, error } = await sb.functions.invoke('delete-account', { body: { userId } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

export async function adminFeatures(sb: UsClient): Promise<FeatureSwitch[]> {
  return unwrap(await sb.from('features').select('*').order('sort'));
}

export async function adminSetFeature(sb: UsClient, key: FeatureKey, enabled: boolean, message?: string | null) {
  unwrap(await sb.rpc('admin_set_feature', { p_key: key, p_enabled: enabled, p_message: message ?? null }));
}

export async function adminPlans(sb: UsClient): Promise<Plan[]> {
  return unwrap(await sb.from('plans').select('*').order('sort'));
}

export async function adminSavePlan(sb: UsClient, plan: Pick<Plan, 'id' | 'name' | 'features' | 'is_default' | 'price_note'>) {
  unwrap(
    await sb.rpc('admin_save_plan', {
      p_id: plan.id,
      p_name: plan.name,
      p_features: plan.features,
      p_default: plan.is_default,
      p_price_note: plan.price_note,
    }),
  );
}

export async function adminDeletePlan(sb: UsClient, id: string) {
  unwrap(await sb.rpc('admin_delete_plan', { p_id: id }));
}

export async function adminAnnouncements(sb: UsClient): Promise<AnnouncementRow[]> {
  return unwrap(await sb.from('announcements').select('id, body, tone, starts_at, ends_at').order('starts_at', { ascending: false }).limit(20));
}

export async function adminAnnounce(sb: UsClient, body: string, tone: 'note' | 'warning', endsAt: string | null) {
  unwrap(await sb.rpc('admin_post_announcement', { p_body: body, p_tone: tone, p_ends_at: endsAt }));
}

export async function adminEndAnnouncement(sb: UsClient, id: string) {
  unwrap(await sb.rpc('admin_end_announcement', { p_id: id }));
}

export async function adminAudit(sb: UsClient, limit = 100): Promise<AuditEntry[]> {
  return unwrap(await sb.rpc('admin_audit_log', { p_limit: limit }));
}

/** Calls back when anyone's access changes (a new sign-up, an approval). */
export function watchAccessQueue(sb: UsClient, onChange: () => void): () => void {
  const channel = sb
    .channel('admin:access')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_access' }, onChange)
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

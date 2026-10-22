import type { FeatureKey } from '../features';
import type { UsClient } from '../supabase';

export type AccessStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface Announcement {
  id: string;
  body: string;
  tone: 'note' | 'warning';
}

/** Whether I'm let in, and what we can use (see public.my_access()). */
export interface MyAccess {
  status: AccessStatus;
  /** Why I was turned away or suspended, if the admin said. */
  reason: string | null;
  is_admin: boolean;
  /** What I can use right now: granted to both of us, and not paused. */
  features: FeatureKey[];
  /** Features paused for everyone, with the message to show in their place. */
  paused: Partial<Record<FeatureKey, string>>;
  announcement: Announcement | null;
}

export async function getMyAccess(sb: UsClient): Promise<MyAccess> {
  const { data, error } = await sb.rpc('my_access');
  if (error) throw error;
  return data as unknown as MyAccess;
}

/**
 * Calls back whenever an admin changes my access or switches a feature, so the
 * app can re-read it. My own user_access row and the feature catalog are both
 * in the realtime publication.
 */
export function watchMyAccess(sb: UsClient, userId: string, onChange: () => void): () => void {
  const channel = sb
    .channel(`access:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_access', filter: `user_id=eq.${userId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'features' }, onChange)
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

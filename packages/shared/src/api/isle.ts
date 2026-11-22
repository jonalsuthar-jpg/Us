import type { Json } from '../database.types';
import { StaleIsleError, type IsleApi, type IsleGame } from '../isle/store';
import type { IsleState } from '../isle/rules';
import type { UsClient } from '../supabase';

/** Isle on the server: the game being played (isle_games), started and saved through start_isle / save_isle. */
export function isleApi(sb: UsClient, coupleId: string): IsleApi {
  return {
    async load(): Promise<IsleGame | null> {
      const { data, error } = await sb
        .from('isle_games')
        .select('id, state')
        .eq('couple_id', coupleId)
        .in('status', ['playing', 'over'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? { id: data.id, state: data.state as unknown as IsleState } : null;
    },
    async start(state) {
      const { data, error } = await sb.rpc('start_isle', { p_state: state as unknown as Json });
      if (error) throw error;
      return data;
    },
    async save(id, state) {
      const { data, error } = await sb.rpc('save_isle', { p_id: id, p_state: state as unknown as Json });
      if (error) {
        if (error.message?.includes('stale')) throw new StaleIsleError();
        throw error;
      }
      return data ?? 0;
    },
  };
}

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { decide, type Delivery, type NotifyPrefs } from './notify-rules.ts';

/** How a push in `category` should reach `userId`, from their settings and time zone (service-role client). */
export async function deliveryFor(admin: SupabaseClient, userId: string, category: string, now = new Date()): Promise<Delivery> {
  const [{ data: prefs }, { data: profile }] = await Promise.all([
    admin.from('notification_prefs').select('off, quiet_start, quiet_end, hide_preview').eq('user_id', userId).maybeSingle(),
    admin.from('profiles').select('timezone').eq('id', userId).maybeSingle(),
  ]);
  return decide((prefs as NotifyPrefs | null) ?? null, category, now, profile?.timezone ?? null);
}

/**
 * OneSignal fields for a push in quiet hours: no sound, no buzz, no
 * breaking through a focus mode. Null when there's no quiet Android channel
 * to send it on, in which case it isn't sent (Android plays a channel's sound
 * whatever the push asks).
 */
export function quietFields(): Record<string, unknown> | null {
  const channel = Deno.env.get('ONESIGNAL_ANDROID_CHANNEL_QUIET');
  if (!channel) return null;
  return { android_channel_id: channel, ios_sound: null, ios_interruption_level: 'passive', priority: 5 };
}

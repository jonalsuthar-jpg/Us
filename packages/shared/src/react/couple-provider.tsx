import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ackMessages } from '../api/messages';
import { PROFILE_TOPIC, profilePhotos, type CoupleContext } from '../api/pairing';
import { setMyTimezone } from '../api/plant';
import { CoupleChannel, type ChannelStatus } from '../realtime/couple-channel';
import type { UsClient } from '../supabase';
import type { PartnerSlot } from '../tokens';
import { ChatKeyProvider } from './chat-key-provider';
import { isForeground, onForegroundChange } from './use-foreground-tick';

export interface CoupleValue extends CoupleContext {
  sb: UsClient;
  channel: CoupleChannel;
  refreshUnread: () => void;
  /** Profile photo URL for whoever owns that colour slot, or null. */
  photoOf: (slot: PartnerSlot) => string | null;
  /** My photo's storage path, needed to replace or remove it. */
  myPhotoPath: string | null;
  /** Reload both photos and tell my partner's apps to do the same. */
  photosChanged: () => void;
}

const Ctx = createContext<CoupleValue | null>(null);

/**
 * What changes all the time (presence, the link, unread), kept apart from
 * the rest so a partner coming online re-renders only what shows it, not
 * every screen that reads the couple.
 */
export interface CoupleLive {
  partnerOnline: boolean;
  connection: ChannelStatus;
  /** Messages from my partner that I haven't read yet. */
  unread: number;
}

const LiveCtx = createContext<CoupleLive>({ partnerOnline: false, connection: 'connecting', unread: 0 });

export function useCoupleLive(): CoupleLive {
  return useContext(LiveCtx);
}

export function useCouple(): CoupleValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCouple must be used inside <CoupleProvider>');
  return v;
}

/** Same as useCouple but returns null outside a paired session. */
export function useOptionalCouple(): CoupleValue | null {
  return useContext(Ctx);
}

interface Props {
  sb: UsClient;
  context: CoupleContext;
  /** 'web' | 'ios' | 'android' — shown in presence for debugging. */
  platform: string;
  /** My partner unpaired or deleted their account while I had the app open. */
  onEnded?: () => void;
  /**
   * Phones: let the realtime link sleep while the app is in the background
   * (calls still ring by push). See CoupleChannel.sleepInBackground.
   */
  sleepInBackground?: boolean;
  children: ReactNode;
}

/** Topic my partner pings just before they unpair or delete their account. */
export const COUPLE_ENDED_TOPIC = 'couple:ended';

/**
 * Joins the couple's realtime channels for the lifetime of the signed-in,
 * paired session and owns app-wide concerns:
 *   - partner presence
 *   - delivery receipts (any open client marks incoming messages delivered)
 *   - unread count for navigation badges
 */
export function CoupleProvider({ sb, context, platform, onEnded, sleepInBackground, children }: Props) {
  const { couple, me, partner } = context;
  const channel = useMemo(
    () => new CoupleChannel(sb, couple.id, me.id, platform),
    [sb, couple.id, me.id, platform],
  );
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [connection, setConnection] = useState<ChannelStatus>('connecting');
  const [unread, setUnread] = useState(0);

  const unreadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshUnread = useMemo(
    () => () => {
      clearTimeout(unreadTimer.current);
      unreadTimer.current = setTimeout(async () => {
        const { count } = await sb
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('couple_id', couple.id)
          .neq('sender_id', me.id)
          .neq('status', 'read');
        setUnread(count ?? 0);
      }, 250);
    },
    [sb, couple.id, me.id],
  );

  // My time zone, for things timed to my day: quiet hours, reminders, "on this day".
  useEffect(() => {
    void setMyTimezone(sb, me).catch(() => {});
  }, [sb, me]);

  // Both profile photos, refreshed when either of us changes theirs.
  const [photos, setPhotos] = useState<Record<string, { path: string | null; url: string | null }>>({});
  const loadPhotos = useCallback(() => {
    void profilePhotos(sb, [me.id, partner.id])
      // Same photos and links: keep the old object, so nothing re-renders for it.
      .then((next) => setPhotos((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next)))
      .catch(() => {});
  }, [sb, me.id, partner.id]);
  useEffect(() => {
    loadPhotos();
    const offChanges = channel.changes.on((e) => e.topic === PROFILE_TOPIC && loadPhotos());
    // Back after a gap: a new photo, or links that have run out (a long gap or a new day).
    const offStatus = channel.resync.on((r) => (r === 'all' || r.topics.has(PROFILE_TOPIC)) && loadPhotos());
    return () => {
      offChanges();
      offStatus();
    };
  }, [channel, loadPhotos]);
  const photoOf = useCallback(
    (slot: PartnerSlot) => photos[slot === context.mySlot ? me.id : partner.id]?.url ?? null,
    [photos, context.mySlot, me.id, partner.id],
  );
  const photosChanged = useCallback(() => {
    channel.sendChanged(PROFILE_TOPIC);
    loadPhotos();
  }, [channel, loadPhotos]);

  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    const endChecks: ReturnType<typeof setTimeout>[] = [];
    let ended = false;
    const offs: (() => void)[] = [
      channel.presence.on((online) => setPartnerOnline(online.has(partner.id))),
      channel.status.on((s) => {
        setConnection(s);
        // Back online: anything that arrived while we were away is now delivered.
        if (s !== 'live') return;
        void ackMessages(sb, 'delivered').catch(() => {});
        refreshUnread();
      }),
      channel.changes.on((e) => {
        if (e.topic !== COUPLE_ENDED_TOPIC || e.from === me.id) return;
        // The ping comes first and their photos are removed before the couple
        // row goes, so check a few times before concluding it's over.
        for (const ms of [3_000, 10_000, 30_000]) {
          endChecks.push(
            setTimeout(async () => {
              const { data, error } = await sb.from('couples').select('id').eq('id', couple.id).maybeSingle();
              if (!error && !data && !ended) {
                ended = true;
                onEndedRef.current?.();
              }
            }, ms),
          );
        }
      }),
      channel.messages.on(({ type, row }) => {
        if (type === 'INSERT' && row.sender_id === partner.id && row.status === 'sent') {
          void ackMessages(sb, 'delivered', [row.id]).catch(() => {});
        }
        // Only my partner's messages count as unread; receipts and reactions on mine don't move it.
        if (row.sender_id === partner.id) refreshUnread();
      }),
    ];
    void channel.join();
    if (sleepInBackground) {
      channel.sleepInBackground();
      channel.setForeground(isForeground());
      offs.push(onForegroundChange((active) => channel.setForeground(active)));
    }
    void ackMessages(sb, 'delivered').catch(() => {});
    refreshUnread();
    return () => {
      offs.forEach((off) => off());
      endChecks.forEach(clearTimeout);
      clearTimeout(unreadTimer.current);
      void channel.leave();
    };
  }, [channel, sb, couple.id, me.id, partner.id, refreshUnread, sleepInBackground]);

  const value = useMemo<CoupleValue>(
    () => ({
      ...context,
      sb,
      channel,
      refreshUnread,
      photoOf,
      myPhotoPath: photos[me.id]?.path ?? null,
      photosChanged,
    }),
    [context, sb, channel, refreshUnread, photoOf, photos, me.id, photosChanged],
  );
  const live = useMemo<CoupleLive>(() => ({ partnerOnline, connection, unread }), [partnerOnline, connection, unread]);

  return (
    <Ctx.Provider value={value}>
      <LiveCtx.Provider value={live}>
        <ChatKeyProvider platform={platform}>{children}</ChatKeyProvider>
      </LiveCtx.Provider>
    </Ctx.Provider>
  );
}

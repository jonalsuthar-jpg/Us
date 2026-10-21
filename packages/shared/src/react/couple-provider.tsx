import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ackMessages } from '../api/messages';
import { PROFILE_TOPIC, profilePhotos, type CoupleContext } from '../api/pairing';
import { CoupleChannel, type ChannelStatus } from '../realtime/couple-channel';
import type { UsClient } from '../supabase';
import type { PartnerSlot } from '../tokens';

export interface CoupleValue extends CoupleContext {
  sb: UsClient;
  channel: CoupleChannel;
  partnerOnline: boolean;
  connection: ChannelStatus;
  /** Messages from my partner that I haven't read yet. */
  unread: number;
  refreshUnread: () => void;
  /** Profile photo URL for whoever owns that colour slot, or null. */
  photoOf: (slot: PartnerSlot) => string | null;
  /** My photo's storage path, needed to replace or remove it. */
  myPhotoPath: string | null;
  /** Reload both photos and tell my partner's apps to do the same. */
  photosChanged: () => void;
}

const Ctx = createContext<CoupleValue | null>(null);

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
export function CoupleProvider({ sb, context, platform, onEnded, children }: Props) {
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

  // Both profile photos, refreshed when either of us changes theirs.
  const [photos, setPhotos] = useState<Record<string, { path: string | null; url: string | null }>>({});
  const loadPhotos = useCallback(() => {
    void profilePhotos(sb, [me.id, partner.id])
      .then(setPhotos)
      .catch(() => {});
  }, [sb, me.id, partner.id]);
  useEffect(() => {
    loadPhotos();
    const offChanges = channel.changes.on((e) => e.topic === PROFILE_TOPIC && loadPhotos());
    // Signed URLs last an hour; a reconnect is a good moment to renew them.
    const offStatus = channel.status.on((s) => s === 'live' && loadPhotos());
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
    const offs = [
      channel.presence.on((online) => setPartnerOnline(online.has(partner.id))),
      channel.status.on((s) => {
        setConnection(s);
        // Back online: anything that arrived while we were away is now delivered.
        if (s === 'live') void ackMessages(sb, 'delivered').catch(() => {});
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
        refreshUnread();
      }),
    ];
    void channel.join();
    void ackMessages(sb, 'delivered').catch(() => {});
    refreshUnread();
    return () => {
      offs.forEach((off) => off());
      endChecks.forEach(clearTimeout);
      void channel.leave();
    };
  }, [channel, sb, couple.id, me.id, partner.id, refreshUnread]);

  const value = useMemo<CoupleValue>(
    () => ({
      ...context,
      sb,
      channel,
      partnerOnline,
      connection,
      unread,
      refreshUnread,
      photoOf,
      myPhotoPath: photos[me.id]?.path ?? null,
      photosChanged,
    }),
    [context, sb, channel, partnerOnline, connection, unread, refreshUnread, photoOf, photos, me.id, photosChanged],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

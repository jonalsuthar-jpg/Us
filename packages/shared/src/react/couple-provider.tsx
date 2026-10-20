import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ackMessages } from '../api/messages';
import type { CoupleContext } from '../api/pairing';
import { CoupleChannel, type ChannelStatus } from '../realtime/couple-channel';
import type { UsClient } from '../supabase';

export interface CoupleValue extends CoupleContext {
  sb: UsClient;
  channel: CoupleChannel;
  partnerOnline: boolean;
  connection: ChannelStatus;
  /** Messages from my partner that I haven't read yet. */
  unread: number;
  refreshUnread: () => void;
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
  children: ReactNode;
}

/**
 * Joins the couple's realtime channels for the lifetime of the signed-in,
 * paired session and owns app-wide concerns:
 *   - partner presence
 *   - delivery receipts (any open client marks incoming messages delivered)
 *   - unread count for navigation badges
 */
export function CoupleProvider({ sb, context, platform, children }: Props) {
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

  useEffect(() => {
    const offs = [
      channel.presence.on((online) => setPartnerOnline(online.has(partner.id))),
      channel.status.on((s) => {
        setConnection(s);
        // Back online: anything that arrived while we were away is now delivered.
        if (s === 'live') void ackMessages(sb, 'delivered').catch(() => {});
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
      void channel.leave();
    };
  }, [channel, sb, partner.id, refreshUnread]);

  const value = useMemo<CoupleValue>(
    () => ({ ...context, sb, channel, partnerOnline, connection, unread, refreshUnread }),
    [context, sb, channel, partnerOnline, connection, unread, refreshUnread],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { createCall, fetchIceServers, findRingingCallFor, getCall, setCallStatus } from '../api/calls';
import { notifyPartner } from '../api/push';
import { CallManager, type CallState, type RtcAdapter } from '../webrtc/call-manager';
import { useCouple } from './couple-provider';

const Ctx = createContext<CallManager | null>(null);

interface Props {
  rtc: RtcAdapter;
  forceRelay?: boolean;
  children: ReactNode;
}

/**
 * App-wide call manager. Mount once, inside <CoupleProvider>, so an incoming
 * call can ring on any screen.
 */
export function CallProvider({ rtc, forceRelay, children }: Props) {
  const { sb, couple, me, partner, channel } = useCouple();

  const manager = useMemo(
    () =>
      new CallManager({
        me: me.id,
        partnerId: partner.id,
        rtc,
        forceRelay,
        signaling: {
          send: (e) => channel.sendSignal(e),
          subscribe: (fn) => channel.signals.on(fn),
        },
        backend: {
          createCall: (media) =>
            createCall(sb, { coupleId: couple.id, callerId: me.id, calleeId: partner.id, media }),
          setStatus: (id, status) => setCallStatus(sb, id, status),
          getCall: (id) => getCall(sb, id),
          iceServers: () => fetchIceServers(sb),
          notify: (req) => void notifyPartner(sb, req),
        },
      }),
    [sb, couple.id, me.id, partner.id, channel, rtc, forceRelay],
  );

  useEffect(() => {
    // A call may already be ringing (opened from a push, or invite sent before we joined).
    const check = () =>
      void findRingingCallFor(sb, me.id)
        .then((call) => call && manager.presentIncoming(call))
        .catch(() => {});
    check();
    const offStatus = channel.status.on((s) => s === 'live' && check());
    // Caller gave up / call answered: the DB is the backstop if a broadcast was missed.
    const offCalls = channel.calls.on(({ row }) => manager.syncFromRow(row));
    return () => {
      offStatus();
      offCalls();
      manager.dispose();
    };
  }, [manager, sb, me.id, channel]);

  return <Ctx.Provider value={manager}>{children}</Ctx.Provider>;
}

export function useCallManager(): CallManager {
  const m = useContext(Ctx);
  if (!m) throw new Error('useCallManager must be used inside <CallProvider>');
  return m;
}

export function useCallState(): CallState {
  const m = useCallManager();
  return useSyncExternalStore(m.subscribe, m.getState, m.getState);
}

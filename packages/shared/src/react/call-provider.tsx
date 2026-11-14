import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createCall, fetchIceServers, findRingingCallFor, getCall, setCallStatus } from '../api/calls';
import { notifyPartner } from '../api/push';
import type { Call } from '../database.types';
import { CallManager, type CallBackend, type CallSignaling, type CallState, type RtcAdapter } from '../webrtc/call-manager';
import { useCouple } from './couple-provider';

const Ctx = createContext<CallManager | null>(null);

interface Props {
  rtc: RtcAdapter;
  forceRelay?: boolean;
  /**
   * Keep a call going when the app's screen goes away (Android: swiped out of
   * recents). The call is picked back up when the app opens again.
   */
  keepCallWhenClosed?: boolean;
  /** A call kept going with the app closed has ended: release what held it. */
  onClosedCallEnded?: () => void;
  children: ReactNode;
}

/** The manager on screen, if any. */
let mounted: CallManager | null = null;

/** A call still going with the app closed, waiting for the app to come back. */
let parked: { manager: CallManager; me: string; partnerId: string; release: () => void } | null = null;

/** The call on screen or carrying on with the app closed (for the notification's Hang up). */
export function currentCallManager(): CallManager | null {
  return mounted ?? parked?.manager ?? null;
}

function park(manager: CallManager, me: string, partnerId: string, getRow: (id: string) => Promise<Call | null>, onEnded?: () => void) {
  // The channel leaves with the screen; the media keeps flowing peer to peer.
  manager.detach();
  // Without the channel, the call row is how a hang-up from my partner reaches me.
  const callId = manager.getState().call?.id;
  const poll = setInterval(() => {
    if (callId) void getRow(callId).then((row) => row && manager.syncFromRow(row)).catch(() => {});
  }, 5_000);
  const off = manager.subscribe(() => {
    if (manager.isOnCall()) return;
    release();
    parked = null;
    manager.dispose();
    onEnded?.();
  });
  const release = () => {
    clearInterval(poll);
    off();
  };
  parked = { manager, me, partnerId, release };
}

/**
 * App-wide call manager. Mount once, inside <CoupleProvider>, so an incoming
 * call can ring on any screen.
 */
export function CallProvider({ rtc, forceRelay, keepCallWhenClosed, onClosedCallEnded, children }: Props) {
  const { sb, couple, me, partner, channel } = useCouple();

  const signaling = useMemo<CallSignaling>(
    () => ({
      send: (e) => channel.sendSignal(e),
      subscribe: (fn) => channel.signals.on(fn),
    }),
    [channel],
  );
  const backend = useMemo<CallBackend>(
    () => ({
      createCall: (media) => createCall(sb, { coupleId: couple.id, callerId: me.id, calleeId: partner.id, media }),
      setStatus: (id, status) => setCallStatus(sb, id, status),
      getCall: (id) => getCall(sb, id),
      iceServers: () => fetchIceServers(sb),
      notify: (req) => void notifyPartner(sb, req),
    }),
    [sb, couple.id, me.id, partner.id],
  );

  const manager = useMemo(() => {
    // The app reopened while a call carried on without it: pick that call back up.
    if (parked && parked.me === me.id && parked.partnerId === partner.id) return parked.manager;
    return new CallManager({ me: me.id, partnerId: partner.id, rtc, forceRelay, signaling, backend });
  }, [me.id, partner.id, rtc, forceRelay, signaling, backend]);

  const onClosedRef = useRef(onClosedCallEnded);
  onClosedRef.current = onClosedCallEnded;

  useEffect(() => {
    if (parked?.manager === manager) {
      parked.release();
      parked = null;
    }
    manager.rebind(signaling, backend);
    mounted = manager;
    // A call may already be ringing (opened from a push, or invite sent before we joined).
    const check = () =>
      void findRingingCallFor(sb, me.id)
        .then((call) => call && manager.presentIncoming(call))
        .catch(() => {});
    check();
    const offStatus = channel.status.on((s) => {
      if (s !== 'live') return;
      check();
      // Back on the channel mid-call (say the app reopened): my partner may have missed my mic and camera.
      manager.resendMediaState();
    });
    // Caller gave up / call answered: the DB is the backstop if a broadcast was missed.
    const offCalls = channel.calls.on(({ row }) => manager.syncFromRow(row));
    return () => {
      offStatus();
      offCalls();
      if (mounted === manager) mounted = null;
      if (keepCallWhenClosed && manager.isOnCall()) {
        park(manager, me.id, partner.id, (id) => getCall(sb, id), () => onClosedRef.current?.());
      } else {
        manager.dispose();
      }
    };
  }, [manager, signaling, backend, sb, me.id, partner.id, channel, keepCallWhenClosed]);

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

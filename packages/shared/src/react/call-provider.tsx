import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { answerCall, createCall, fetchIceServers, findRingingCallFor, getCall, setCallStatus } from '../api/calls';
import { notifyPartner } from '../api/push';
import type { Call } from '../database.types';
import { CallManager, type CallBackend, type CallSignaling, type CallState, type RtcAdapter } from '../webrtc/call-manager';
import { useCouple } from './couple-provider';
import { onForegroundChange } from './use-foreground-tick';
import { CoupleChannel } from '../realtime/couple-channel';
import type { UsClient } from '../supabase';

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

/** What a parked call needs to keep talking to my partner without the app's screen. */
interface ParkWith {
  sb: UsClient;
  coupleId: string;
  me: string;
  partnerId: string;
  platform: string;
  backend: CallBackend;
  onEnded?: () => void;
}

/** The call on screen or carrying on with the app closed (for the notification's Hang up). */
export function currentCallManager(): CallManager | null {
  return mounted ?? parked?.manager ?? null;
}

function park(manager: CallManager, w: ParkWith) {
  // The app's channel leaves with the screen; the media keeps flowing peer to
  // peer. A small channel of its own (no presence, no database changes) keeps
  // hang-ups and reconnects reaching both of us meanwhile.
  manager.detach();
  const channel = new CoupleChannel(w.sb, w.coupleId, w.me, w.platform);
  void channel.join({ presence: false, db: false }).then(() => {
    if (parked?.manager !== manager) return;
    manager.rebind({ send: (e) => channel.sendSignal(e), subscribe: (fn) => channel.signals.on(fn) }, w.backend);
  });
  // The call row backs that up, should a broadcast go missing.
  const callId = manager.getState().call?.id;
  const poll = setInterval(() => {
    if (callId) void w.backend.getCall(callId).then((row) => row && manager.syncFromRow(row)).catch(() => {});
  }, 15_000);
  const off = manager.subscribe(() => {
    if (manager.isOnCall()) return;
    release();
    parked = null;
    manager.dispose();
    w.onEnded?.();
  });
  const release = () => {
    clearInterval(poll);
    off();
    manager.detach();
    void channel.leave();
  };
  parked = { manager, me: w.me, partnerId: w.partnerId, release };
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
      answer: (id) => answerCall(sb, id),
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
    // Back in front: anything may have happened to the call while we were away
    // (answered on my laptop, given up on) without a broadcast reaching us.
    const offFront = onForegroundChange((active) => {
      if (!active) return;
      check();
      const id = manager.getState().call?.id;
      if (id) void getCall(sb, id).then((row) => row && manager.syncFromRow(row)).catch(() => {});
    });
    return () => {
      offStatus();
      offCalls();
      offFront();
      if (mounted === manager) mounted = null;
      if (keepCallWhenClosed && manager.isOnCall()) {
        park(manager, { sb, coupleId: couple.id, me: me.id, partnerId: partner.id, platform: channel.platform, backend, onEnded: () => onClosedRef.current?.() });
      } else {
        manager.dispose();
      }
    };
  }, [manager, signaling, backend, sb, couple.id, me.id, partner.id, channel, keepCallWhenClosed]);

  // While a call rings or is on, the realtime link stays awake in the background.
  useEffect(() => {
    let release: (() => void) | null = null;
    const follow = () => {
      const { phase } = manager.getState();
      const busy = phase !== 'idle' && phase !== 'ended';
      if (busy && !release) release = channel.hold();
      else if (!busy && release) {
        release();
        release = null;
      }
    };
    follow();
    const off = manager.subscribe(follow);
    return () => {
      off();
      release?.();
    };
  }, [manager, channel]);

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

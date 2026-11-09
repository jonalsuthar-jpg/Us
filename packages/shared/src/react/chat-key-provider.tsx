import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CHAT_KEY_VERSION,
  CHAT_KEYS_TOPIC,
  claimChatKey,
  ensureChatDevice,
  fetchChatKeyState,
  openMyWrap,
  partnerDevicesToShare,
  restoreChatKeyBackup,
  revokeChatDevice,
  saveChatKeyBackup,
  shareChatKey,
  waitingFor as whoToWaitFor,
  type ChatKeyState,
} from '../api/chat-keys';
import { encryptLegacyBatch, encryptLegacyStickers } from '../api/legacy-encryption';
import { ChatCipher } from '../crypto/chat-cipher';
import { fromBase64, toBase64 } from '../crypto/encoding';
import { shortCode } from '../crypto/keys';
import { loadChatKey, peekChatKey, saveChatKey, type StoredDevice } from '../crypto/keystore';
import type { ChatDevice } from '../database.types';
import { useCouple } from './couple-provider';
import { cacheKey, readCache, writeCache } from './data-cache';

/**
 *   loading      finding out
 *   ready        this device holds the chat key
 *   waiting      it doesn't yet: approve it from another of my devices, or use my PIN
 *   unavailable  no secure storage on this device, or the server couldn't be reached
 */
export type ChatKeyStatus = 'loading' | 'ready' | 'waiting' | 'unavailable';

export interface PendingDevice {
  device: ChatDevice;
  /** Shown on the new device too; the same code means it's really that one. */
  code: string;
}

export interface ChatKeyValue {
  status: ChatKeyStatus;
  /** Set while ready. */
  cipher: ChatCipher | null;
  /** My own code, shown while waiting for approval. */
  myCode: string | null;
  myDeviceId: string | null;
  /**
   * Whether I've saved a PIN backup (without one, losing my devices loses
   * the history). null until known: the last answer is remembered on the
   * device, so a fresh start doesn't flash "Set PIN" while the server answers.
   */
  hasBackup: boolean | null;
  /**
   * My partner has an app that reads encrypted chat. Until then messages go
   * as before, so they never receive something they can't open.
   */
  partnerReady: boolean;
  /** My new devices asking for the key. */
  pending: PendingDevice[];
  /** Both of our devices. */
  devices: ChatDevice[];
  approve: (deviceId: string) => Promise<void>;
  dismiss: (deviceId: string) => void;
  setPin: (pin: string) => Promise<void>;
  /** Throws "wrong_pin" or "no_backup". */
  unlockWithPin: (pin: string) => Promise<void>;
  revoke: (deviceId: string) => Promise<void>;
  refresh: () => void;
  /** Resolves once the first check is done. */
  settled: () => Promise<void>;
  /**
   * The cipher to encrypt with right now, or null to send as before (my
   * partner has no app that reads encrypted chat yet). Waits for the first check.
   */
  sealer: () => Promise<ChatCipher | null>;
  /** Messages from before encryption are being encrypted in the background. */
  migrating: boolean;
  /** Why the last check failed (shown with 'unavailable'), or null. */
  error: string | null;
  /** While waiting: one of my other devices can approve this one, or it's my partner's app that will share the key. */
  waitingFor: 'my-device' | 'partner' | null;
}

const Ctx = createContext<ChatKeyValue | null>(null);

export function useChatKey(): ChatKeyValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useChatKey must be used inside <CoupleProvider>');
  return v;
}

const LABELS: Record<string, string> = { web: 'Web browser', ios: 'iPhone', android: 'Android phone' };

/**
 * Gets this device the couple's chat key and keeps our devices' keys in step:
 * registers the device, makes the key if the couple has none, opens the copy
 * sealed to this device, and seals it to devices that are waiting — my own
 * once I approve them, my partner's very first one automatically.
 */
export function ChatKeyProvider({ platform, children }: { platform: string; children: ReactNode }) {
  const { sb, couple, me, partner, channel } = useCouple();
  // A key read at boot (or earlier this session) makes the first frame readable.
  const [key, setKey] = useState<Uint8Array | null>(() => peekChatKey(couple.id, CHAT_KEY_VERSION));
  const [status, setStatus] = useState<ChatKeyStatus>(() => (key ? 'ready' : 'loading'));
  const [device, setDevice] = useState<StoredDevice | null>(null);
  const [state, setState] = useState<ChatKeyState | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef<Promise<void> | null>(null);
  const firstLoad = useRef<Promise<void> | null>(null);
  // Once my partner could read encrypted chat, a slow or offline start never goes back to plaintext.
  const onKey = cacheKey(couple.id, 'chat:e2ee');
  const [partnerSeen, setPartnerSeen] = useState(() => readCache<boolean>(onKey) === true);
  const pinKey = cacheKey(couple.id, 'chat:pin');
  const partnerSeenRef = useRef(partnerSeen);
  const lastPing = useRef(0);
  const lastLoad = useRef(0);

  // The same key keeps the same cipher, so messages already opened stay opened.
  const adoptKey = useCallback((k: Uint8Array | null) => {
    setKey((prev) => (prev && k && toBase64(prev) === toBase64(k) ? prev : k));
  }, []);

  const load = useCallback(() => {
    loadingRef.current ??= (async () => {
      try {
        lastLoad.current = Date.now();
        // The saved key first: the thread opens without waiting for the network.
        const saved = await loadChatKey(couple.id, CHAT_KEY_VERSION).catch(() => null);
        if (saved) {
          adoptKey(saved);
          setStatus('ready');
        }
        const { device: mine, created } = await ensureChatDevice(sb, me.id, LABELS[platform] ?? platform);
        setDevice(mine);
        let current = await fetchChatKeyState(sb, couple.id);
        let k = (await loadChatKey(couple.id, CHAT_KEY_VERSION)) ?? (current.exists ? openMyWrap(mine, current.wraps) : null);
        if (!current.exists) {
          k = await claimChatKey(sb, mine);
          current = await fetchChatKeyState(sb, couple.id);
          k ??= openMyWrap(mine, current.wraps);
          channel.sendChanged(CHAT_KEYS_TOPIC);
        }
        if (k) {
          await saveChatKey(couple.id, CHAT_KEY_VERSION, k);
          // My partner's first device has nobody of theirs to approve it.
          const share = partnerDevicesToShare(current, partner.id);
          if (share.length) {
            for (const to of share) await shareChatKey(sb, { coupleId: couple.id, key: k, from: mine, to });
            current = await fetchChatKeyState(sb, couple.id);
            channel.sendChanged(CHAT_KEYS_TOPIC);
          }
        }
        if (current.devices.some((d) => d.user_id === partner.id)) partnerSeenRef.current = true;
        // Tell our other devices about this one: a new device, or one still
        // waiting (now and then), so whoever can share the key does it now.
        if (created || (!k && Date.now() - lastPing.current > 60_000)) {
          lastPing.current = Date.now();
          channel.sendChanged(CHAT_KEYS_TOPIC);
        }
        setState(current);
        adoptKey(k);
        setStatus(k ? 'ready' : 'waiting');
        setError(null);
      } catch (e) {
        // No key store, no secure random numbers, or offline: a saved key still works.
        console.warn('[chat-key]', e);
        setError((e as Error)?.message ?? String(e));
        const k = await loadChatKey(couple.id, CHAT_KEY_VERSION).catch(() => null);
        if (k) {
          adoptKey(k);
          setStatus('ready');
        } else {
          setStatus((s) => (s === 'loading' ? 'unavailable' : s));
        }
      } finally {
        loadingRef.current = null;
      }
    })();
    firstLoad.current ??= loadingRef.current;
    return loadingRef.current;
  }, [sb, couple.id, me.id, partner.id, platform, channel, adoptKey]);

  const settled = useCallback(() => firstLoad.current ?? load(), [load]);

  useEffect(() => {
    if (state) writeCache(pinKey, state.hasBackup);
  }, [state, pinKey]);

  const partnerReady = partnerSeen || !!state?.devices.some((d) => d.user_id === partner.id);
  useEffect(() => {
    if (partnerReady && !partnerSeen) {
      writeCache(onKey, true);
      setPartnerSeen(true);
    }
  }, [partnerReady, partnerSeen, onKey]);

  useEffect(() => {
    void load();
    const offChanges = channel.changes.on((e) => e.topic === CHAT_KEYS_TOPIC && e.from !== me.id && void load());
    const offStatus = channel.status.on((s) => s === 'live' && void load());
    return () => {
      offChanges();
      offStatus();
    };
  }, [channel, me.id, load]);

  const cipher = useMemo(() => (key ? new ChatCipher(CHAT_KEY_VERSION, key) : null), [key]);
  const cipherRef = useRef(cipher);
  cipherRef.current = cipher;
  partnerSeenRef.current ||= partnerReady;

  // Read at send time, after `settled()`, so it never lags a render behind.
  const sealer = useCallback(async () => {
    await settled();
    // No partner device seen yet: check again (now and then) rather than send plaintext on old news.
    if (!partnerSeenRef.current && Date.now() - lastLoad.current > 30_000) await load();
    // The key state set by that load lands on the next render.
    await new Promise((r) => setTimeout(r, 0));
    return partnerSeenRef.current ? cipherRef.current : null;
  }, [settled, load]);

  // Once both of us can read encrypted chat, everything from before gets encrypted too.
  const [migrating, setMigrating] = useState(false);
  useEffect(() => {
    if (status !== 'ready' || !cipher || !partnerReady) return;
    let stopped = false;
    void (async () => {
      let wait = 5_000;
      for (let attempt = 0; !stopped && attempt < 6; attempt++) {
        try {
          while (!stopped && (await encryptLegacyBatch(sb, couple.id, cipher)) > 0) setMigrating(true);
          if (!stopped) await encryptLegacyStickers(sb, couple.id, cipher);
          break;
        } catch {
          await new Promise((r) => setTimeout(r, wait));
          wait *= 2;
        }
      }
      if (!stopped) setMigrating(false);
    })();
    return () => {
      stopped = true;
    };
  }, [status, cipher, partnerReady, sb, couple.id]);

  const pending = useMemo<PendingDevice[]>(() => {
    if (!state || !key) return [];
    const holders = new Set(state.wraps.map((w) => w.device_id));
    return state.devices
      .filter((d) => d.user_id === me.id && !holders.has(d.id) && !dismissed.has(d.id))
      .map((d) => ({ device: d, code: shortCode(fromBase64(d.public_key)) }));
  }, [state, key, me.id, dismissed]);

  const approve = useCallback(
    async (deviceId: string) => {
      const to = state?.devices.find((d) => d.id === deviceId);
      if (!to || !key || !device) return;
      await shareChatKey(sb, { coupleId: couple.id, key, from: device, to });
      channel.sendChanged(CHAT_KEYS_TOPIC);
      await load();
    },
    [sb, couple.id, state, key, device, channel, load],
  );

  const dismiss = useCallback((deviceId: string) => setDismissed((prev) => new Set(prev).add(deviceId)), []);

  const setPin = useCallback(
    async (pin: string) => {
      if (!key) throw new Error('no_key');
      await saveChatKeyBackup(sb, couple.id, key, pin);
      setState((s) => (s ? { ...s, hasBackup: true } : s));
    },
    [sb, couple.id, key],
  );

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const k = await restoreChatKeyBackup(sb, couple.id, pin);
      await saveChatKey(couple.id, CHAT_KEY_VERSION, k);
      // So this device doesn't need the PIN again.
      if (device) {
        const self = state?.devices.find((d) => d.id === device.id);
        if (self) await shareChatKey(sb, { coupleId: couple.id, key: k, from: device, to: self }).catch(() => {});
      }
      adoptKey(k);
      setStatus('ready');
      channel.sendChanged(CHAT_KEYS_TOPIC);
      void load();
    },
    [sb, couple.id, device, state, channel, load, adoptKey],
  );

  const revoke = useCallback(
    async (deviceId: string) => {
      await revokeChatDevice(sb, deviceId);
      channel.sendChanged(CHAT_KEYS_TOPIC);
      await load();
    },
    [sb, channel, load],
  );

  const refresh = useCallback(() => void load(), [load]);

  const value = useMemo<ChatKeyValue>(
    () => ({
      status,
      cipher,
      myCode: device ? shortCode(device.publicKey) : null,
      myDeviceId: device?.id ?? null,
      hasBackup: state?.hasBackup ?? readCache<boolean>(pinKey) ?? null,
      partnerReady,
      pending,
      devices: state?.devices ?? [],
      approve,
      dismiss,
      setPin,
      unlockWithPin,
      revoke,
      refresh,
      settled,
      sealer,
      migrating,
      error,
      waitingFor: status === 'waiting' && state ? whoToWaitFor(state, me.id) : null,
    }),
    [status, cipher, device, state, partnerReady, pending, approve, dismiss, setPin, unlockWithPin, revoke, refresh, settled, sealer, migrating, error, me.id, pinKey],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

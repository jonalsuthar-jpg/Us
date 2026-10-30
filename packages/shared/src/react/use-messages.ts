import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ackMessages,
  draftMessage,
  dropDeleted,
  fetchMessage,
  fetchMessages,
  mergeMessages,
  PAGE_SIZE,
  pinMessage,
  reactToMessage,
  sendMessage,
  type DraftExtras,
} from '../api/messages';
import { notifyPartner } from '../api/push';
import type { Message } from '../database.types';
import { useCouple } from './couple-provider';
import { cacheKey, readCache, writeCache } from './data-cache';

/** How much of the thread is kept on the device for an instant open. */
const KEEP = 60;

interface Options {
  /** True while the thread is on screen and the app/tab is in the foreground. */
  viewing: boolean;
}

/**
 * The chat thread: initial page, older pages, live inserts and receipt
 * updates, optimistic sends with retry, and read receipts while viewing.
 * Messages are kept oldest → newest. The newest page is cached, so the
 * thread draws at once and the server's copy merges in behind it. Messages
 * that couldn't be sent are kept too, and go again once we're back online.
 */
export function useMessages({ viewing }: Options) {
  const { sb, couple, me, partner, channel, refreshUnread } = useCouple();
  const key = cacheKey(couple.id, 'chat:messages');
  const unsentKey = cacheKey(couple.id, 'chat:unsent');
  const [messages, setMessages] = useState<Message[]>(() => {
    const unsent = (readCache<Message[]>(unsentKey) ?? []).map((m) => ({ ...m, pending: false, failed: true }));
    return mergeMessages(readCache<Message[]>(key) ?? [], unsent);
  });
  const [loading, setLoading] = useState(() => !readCache(key));
  const [hasOlder, setHasOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderFailed, setOlderFailed] = useState(false);
  const viewingRef = useRef(viewing);
  viewingRef.current = viewing;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const hasOlderRef = useRef(hasOlder);
  hasOlderRef.current = hasOlder;
  const fetchingOlder = useRef(false);
  const delivering = useRef(new Set<string>());
  // What came from the device hasn't been checked against the server yet.
  const checked = useRef(false);

  const upsert = useCallback((incoming: Message | Message[]) => {
    setMessages((prev) => mergeMessages(prev, Array.isArray(incoming) ? incoming : [incoming]));
  }, []);

  const markRead = useCallback(() => {
    let changed = false;
    setMessages((prev) => {
      if (!prev.some((m) => m.sender_id === partner.id && m.status !== 'read')) return prev;
      changed = true;
      return prev.map((m) => (m.sender_id === partner.id && m.status !== 'read' ? { ...m, status: 'read' } : m));
    });
    // Fire regardless of local state — cheap, idempotent, and catches rows not loaded yet.
    void ackMessages(sb, 'read')
      .then(() => refreshUnread())
      .catch(() => {});
    return changed;
  }, [sb, partner.id, refreshUnread]);

  const deliver = useCallback(
    async (draft: Message) => {
      if (delivering.current.has(draft.id)) return;
      delivering.current.add(draft.id);
      try {
        const saved = await sendMessage(sb, draft);
        upsert({ ...saved, pending: false, failed: false });
        void notifyPartner(sb, { category: 'new_message', messageId: saved.id });
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === draft.id ? { ...m, pending: false, failed: true } : m)));
      } finally {
        delivering.current.delete(draft.id);
      }
    },
    [sb, upsert],
  );

  const retry = useCallback(
    (id: string) => {
      const m = messagesRef.current.find((x) => x.id === id);
      if (!m || !m.failed) return Promise.resolve();
      const again = { ...m, failed: false, pending: true };
      setMessages((prev) => prev.map((x) => (x.id === id ? again : x)));
      return deliver(again);
    },
    [deliver],
  );

  // Initial load + resync after reconnects, then anything still waiting to go, in order.
  const loadLatest = useCallback(async () => {
    const page = await fetchMessages(sb, couple.id);
    const wholeThread = !checked.current || page.length < PAGE_SIZE;
    checked.current = true;
    setMessages((prev) => mergeMessages(dropDeleted(prev, page, wholeThread), page));
    setHasOlder(page.length === PAGE_SIZE);
    setOlderFailed(false);
    setLoading(false);
    for (const m of messagesRef.current.filter((x) => x.failed)) await retry(m.id);
  }, [sb, couple.id, retry]);

  useEffect(() => {
    void loadLatest().catch(() => setLoading(false));
    const offStatus = channel.status.on((s) => {
      if (s === 'live') void loadLatest().catch(() => {});
    });
    const offMessages = channel.messages.on(async ({ type, row }) => {
      if (type === 'DELETE') {
        setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev.filter((m) => m.id !== row.id) : prev));
        return;
      }
      if (row.kind === 'call') {
        const full = await fetchMessage(sb, row.id).catch(() => null);
        upsert(full ?? row);
      } else {
        upsert(row);
      }
      if (type === 'INSERT' && row.sender_id === partner.id && viewingRef.current) markRead();
    });
    const offCalls = channel.calls.on(({ row }) => {
      // Keep embedded call info on call-log entries fresh.
      setMessages((prev) => (prev.some((m) => m.call_id === row.id) ? prev.map((m) => (m.call_id === row.id ? { ...m, call: row } : m)) : prev));
    });
    return () => {
      offStatus();
      offMessages();
      offCalls();
    };
  }, [sb, channel, partner.id, loadLatest, upsert, markRead]);

  useEffect(() => {
    if (viewing && !loading) markRead();
  }, [viewing, loading, markRead]);

  // Keep the newest settled messages for next time (no drafts, no on-device files),
  // and anything unsent, unless it has a file to upload: those bytes only live in memory.
  useEffect(() => {
    if (loading) return;
    const settled: Message[] = [];
    const unsent: Message[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const { localUri: _l, upload, ...m } = messages[i]!;
      if (m.pending || m.failed) {
        if (!upload) unsent.unshift(m);
      } else if (settled.length < KEEP) settled.unshift(m);
    }
    writeCache(key, settled);
    writeCache(unsentKey, unsent);
  }, [key, unsentKey, loading, messages]);

  /** Safe to call as often as you like: it does nothing while a page is on its way or once there's nothing older. */
  const loadOlder = useCallback(async () => {
    // Cursor from a row the server has: an old unsent draft could skip everything after it.
    const oldest = messagesRef.current.find((m) => !m.pending && !m.failed);
    if (!oldest || !checked.current || !hasOlderRef.current || fetchingOlder.current) return;
    fetchingOlder.current = true;
    setLoadingOlder(true);
    setOlderFailed(false);
    try {
      const page = await fetchMessages(sb, couple.id, oldest.created_at);
      upsert(page);
      setHasOlder(page.length === PAGE_SIZE);
    } catch {
      setOlderFailed(true);
    } finally {
      fetchingOlder.current = false;
      setLoadingOlder(false);
    }
  }, [sb, couple.id, upsert]);

  /** Send text, optionally replying to a message and/or with a photo or voice note. */
  const send = useCallback(
    (body: string, extras: DraftExtras = {}) => {
      const text = body.trim();
      if (!text && !extras.media) return;
      const draft = draftMessage(couple.id, me.id, text || null, extras);
      upsert(draft);
      void deliver(draft);
    },
    [couple.id, me.id, upsert, deliver],
  );

  /** Patch a message locally; server state arrives over Postgres Changes. */
  const patch = useCallback((id: string, change: (m: Message) => Partial<Message>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...change(m) } : m)));
  }, []);

  /** Set (or with null, clear) my reaction. Optimistic, rolled back on failure. */
  const react = useCallback(
    async (id: string, emoji: string | null) => {
      const before = messagesRef.current.find((m) => m.id === id)?.reactions ?? {};
      patch(id, (m) => {
        const next = { ...m.reactions };
        if (emoji) next[me.id] = emoji;
        else delete next[me.id];
        return { reactions: next };
      });
      try {
        upsert(await reactToMessage(sb, id, emoji));
      } catch (e) {
        patch(id, () => ({ reactions: before }));
        throw e;
      }
    },
    [sb, me.id, patch, upsert],
  );

  const pin = useCallback(
    async (id: string, pinned: boolean) => {
      const saved = await pinMessage(sb, id, pinned);
      upsert(saved);
      channel.sendChanged('chat:pins');
    },
    [sb, channel, upsert],
  );

  return { messages, loading, hasOlder, loadingOlder, olderFailed, loadOlder, send, retry, markRead, react, pin };
}

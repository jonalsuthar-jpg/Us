import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ackMessages,
  draftMessage,
  fetchMessage,
  fetchMessages,
  mergeMessage,
  PAGE_SIZE,
  sendMessage,
} from '../api/messages';
import { notifyPartner } from '../api/push';
import type { Message } from '../database.types';
import { useCouple } from './couple-provider';

interface Options {
  /** True while the thread is on screen and the app/tab is in the foreground. */
  viewing: boolean;
}

/**
 * The chat thread: initial page, older pages, live inserts and receipt
 * updates, optimistic sends with retry, and read receipts while viewing.
 * Messages are kept oldest → newest.
 */
export function useMessages({ viewing }: Options) {
  const { sb, couple, me, partner, channel, refreshUnread } = useCouple();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasOlder, setHasOlder] = useState(true);
  const viewingRef = useRef(viewing);
  viewingRef.current = viewing;

  const upsert = useCallback((incoming: Message | Message[]) => {
    const list = Array.isArray(incoming) ? incoming : [incoming];
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of list) byId.set(m.id, mergeMessage(byId.get(m.id), m));
      return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  const markRead = useCallback(() => {
    let changed = false;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.sender_id === partner.id && m.status !== 'read') {
          changed = true;
          return { ...m, status: 'read' };
        }
        return m;
      }),
    );
    // Fire regardless of local state — cheap, idempotent, and catches rows not loaded yet.
    void ackMessages(sb, 'read')
      .then(() => refreshUnread())
      .catch(() => {});
    return changed;
  }, [sb, partner.id, refreshUnread]);

  // Initial load + resync after reconnects.
  const loadLatest = useCallback(async () => {
    const page = await fetchMessages(sb, couple.id);
    upsert(page);
    setHasOlder(page.length === PAGE_SIZE);
    setLoading(false);
  }, [sb, couple.id, upsert]);

  useEffect(() => {
    void loadLatest().catch(() => setLoading(false));
    const offStatus = channel.status.on((s) => {
      if (s === 'live') void loadLatest().catch(() => {});
    });
    const offMessages = channel.messages.on(async ({ type, row }) => {
      if (type === 'DELETE') return;
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
      setMessages((prev) => prev.map((m) => (m.call_id === row.id ? { ...m, call: row } : m)));
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

  const loadOlder = useCallback(async () => {
    const oldest = messages[0];
    if (!oldest || !hasOlder) return;
    const page = await fetchMessages(sb, couple.id, oldest.created_at);
    upsert(page);
    setHasOlder(page.length === PAGE_SIZE);
  }, [sb, couple.id, messages, hasOlder, upsert]);

  const deliver = useCallback(
    async (draft: Message) => {
      try {
        const saved = await sendMessage(sb, draft);
        upsert({ ...saved, pending: false, failed: false });
        void notifyPartner(sb, { category: 'new_message', messageId: saved.id });
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === draft.id ? { ...m, pending: false, failed: true } : m)));
      }
    },
    [sb, upsert],
  );

  const send = useCallback(
    (body: string) => {
      const text = body.trim();
      if (!text) return;
      const draft = draftMessage(couple.id, me.id, text);
      upsert(draft);
      void deliver(draft);
    },
    [couple.id, me.id, upsert, deliver],
  );

  const retry = useCallback(
    (id: string) => {
      const m = messages.find((x) => x.id === id);
      if (!m || !m.failed) return;
      const again = { ...m, failed: false, pending: true };
      setMessages((prev) => prev.map((x) => (x.id === id ? again : x)));
      void deliver(again);
    },
    [messages, deliver],
  );

  return { messages, loading, hasOlder, loadOlder, send, retry, markRead };
}

"use client";

import {
  canEdit,
  chatBackground,
  CHAT_THEME_TOPIC,
  getChatTheme,
  getNickname,
  SAVED_TOPIC,
  savedIds,
  setSaved,
  clusters,
  formatDay,
  groupByDay,
  hiddenFor,
  isStickerMime,
  keepSticker,
  listPinned,
  messagePreview,
  searchMessages,
  snapReplyQuote,
  stickerPath,
  STICKERS_TOPIC,
  uuid,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_MS,
  VideoTooBigError,
  VideoTooLongError,
  type Message,
  type Sticker,
} from "@us/shared";
import {
  useCallManager,
  useChatKey,
  useChatMedia,
  useCouple,
  useCoupleData,
  useCoupleLive,
  useFeature,
  useMessages,
  useSnaps,
  useTyping,
} from "@us/shared/react";
import { ChatKeyBanner } from "@/components/chat/chat-key";
import { ChevronsDown, Phone, Pin, Search, Video } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MobileSettingsLink } from "@/components/app/app-shell";
import { FeatureOff } from "@/components/app/feature-off";
import { Bubble, type ReplyQuote } from "@/components/chat/bubble";
import { CallEntry } from "@/components/chat/call-entry";
import { Composer } from "@/components/chat/composer";
import type { ExpressionTab } from "@/components/chat/expression-panel";
import {
  PastedMediaDialog,
  type PastedSendAs,
} from "@/components/chat/pasted-media-dialog";
import { TypingBubble } from "@/components/chat/typing-bubble";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { Lightbox } from "@/components/ui/lightbox";
import { Button, Spinner } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { PrivacyBadge } from "@/components/ui/privacy";
import { useOpenedOnce, usePageActive } from "@/lib/hooks";
import Link from "next/link";
import { CapsuleDialog } from "@/components/chat/capsule-dialog";
import { waveformOf } from "@/lib/voice";
import { posterFrom } from "@/lib/video";
import dynamic from "next/dynamic";

// Drawing, sticker cut-out and GIF search are big and rarely open: each loads the first time it's opened.
const DoodleDialog = dynamic(() => import("@/components/draw/doodle-dialog").then((m) => m.DoodleDialog), { ssr: false });
const StickerMaker = dynamic(() => import("@/components/stickers/maker").then((m) => m.StickerMaker), { ssr: false });
const ExpressionPanel = dynamic(() => import("@/components/chat/expression-panel").then((m) => m.ExpressionPanel), { ssr: false });
import { shrinkPhoto } from "@/lib/image";

export default function TalkPage() {
  const chat = useFeature("chat");
  if (!chat) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-10 sm:py-14">
        <FeatureOff />
      </div>
    );
  }
  return <Thread />;
}

function Thread() {
  const {
    sb,
    couple,
    me,
    partner,
    mySlot,
    partnerSlot,
    photoOf,
    channel,
  } = useCouple();
  const { partnerOnline } = useCoupleLive();
  const partnerPhoto = photoOf(partnerSlot);
  const active = usePageActive();
  const {
    messages,
    loading,
    hasOlder,
    loadOlder,
    send,
    retry,
    react,
    pin,
    remove,
    edit,
  } = useMessages({ viewing: active });
  const media = useChatMedia(messages);
  const { cipher } = useChatKey();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [dropping, setDropping] = useState(false);
  const [capsule, setCapsule] = useState(false);
  // My private nickname for my partner, the theme we share, and what I saved.
  const nickname = useCoupleData("chat:nickname", () => getNickname(sb, me.id), [sb, me.id]);
  const theme = useCoupleData(CHAT_THEME_TOPIC, () => getChatTheme(sb, couple.id), [sb, couple.id]);
  const saved = useCoupleData(SAVED_TOPIC, () => savedIds(sb, me.id), [sb, me.id], undefined, "memory");
  const shownName = nickname.data || partner.display_name;
  // The page's light or dark mode, as set on <html> (see lib/theme).
  const scheme = typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const chatBg = theme.data && theme.data !== "paper" ? chatBackground(theme.data, scheme) : undefined;
  const [photo, setPhoto] = useState<string | null>(null);
  /** The chat message open in the lightbox (not a profile photo). */
  const [viewed, setViewed] = useState<Message | null>(null);
  /** Asking "for me or for everyone?" about this one. */
  const [deleting, setDeleting] = useState<Message | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [panel, setPanel] = useState<"search" | "pins" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const draw = useFeature("draw");
  const [doodle, setDoodle] = useState(false);
  const stickersOn = useFeature("stickers");
  /** The sticker / GIF panel, open on this tab. */
  const [expressions, setExpressions] = useState<ExpressionTab | null>(null);
  const [stickerMaker, setStickerMaker] = useState(false);
  const makerOpened = useOpenedOnce(stickerMaker);
  const doodleOpened = useOpenedOnce(doodle);
  const expressionsOpened = useOpenedOnce(expressions !== null);
  const sendSticker = (st: Sticker, url?: string) =>
    sendWithReply("", {
      media: {
        kind: "sticker",
        path: st.path,
        meta: { width: st.width, height: st.height },
        localUri: url,
      },
    });

  // Pinned messages (any age). Refreshes on a partner's pin ping and when a loaded message's pin changes.
  // Opened pins hold message text: kept in memory only.
  const pins = useCoupleData(
    "chat:pins",
    async () =>
      (await listPinned(sb, couple.id, cipher)).filter(
        (m) => !hiddenFor(m, me.id),
      ),
    [sb, couple.id, me.id, cipher],
    undefined,
    "memory",
  );
  const pinSignature = messages.map((m) => (m.pinned_at ? m.id : "")).join("");
  useEffect(() => {
    void pins.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinSignature]);

  const byId = useMemo(
    () => new Map(messages.map((m) => [m.id, m])),
    [messages],
  );
  const authorOf = (m: Pick<Message, "sender_id">) =>
    m.sender_id === me.id ? "You" : partner.display_name;
  const snaps = useSnaps();
  const quoteFor = (m: Message): ReplyQuote | null => {
    const snap = snapReplyQuote(m, me.id, partner.display_name, [
      ...(snaps.data?.mine ?? []),
      ...(snaps.data?.partner ?? []),
    ]);
    if (snap) return { id: `snap-${m.snap_id}`, ...snap };
    if (!m.reply_to) return null;
    const r = byId.get(m.reply_to);
    return r
      ? { id: r.id, author: authorOf(r), text: messagePreview(r) }
      : {
          id: m.reply_to,
          author: "Earlier message",
          text: "Scroll up to see it",
        };
  };

  function jumpTo(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return false;
    stick.current = false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(id);
    setTimeout(() => setHighlight(null), 1600);
    return true;
  }

  // From the info page: ?jump=<id> (older pages load until it's found), or ?search=1.
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  const jumpTries = useRef(0);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("jump")) setPendingJump(q.get("jump"));
    if (q.get("search") === "1") setPanel("search");
  }, []);
  useEffect(() => {
    if (!pendingJump || loading) return;
    if (jumpTo(pendingJump)) {
      setPendingJump(null);
      window.history.replaceState(null, "", "/talk");
    } else if (hasOlder && jumpTries.current < 30) {
      jumpTries.current++;
      void loadOlder();
    } else {
      setPendingJump(null);
      fail(new Error("Couldn’t find that message any more."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJump, messages.length, loading, hasOlder]);
  useEffect(
    () =>
      channel.changes.on((e) => {
        if (e.topic === CHAT_THEME_TOPIC && e.from !== me.id) fail(new Error(`${partner.display_name} changed the chat theme`));
      }),
    [channel, me.id, partner.display_name],
  );

  function sendWithReply(
    text: string,
    extras: Parameters<typeof send>[1] = {},
  ) {
    stick.current = true;
    send(text, { ...extras, replyTo: replyTo?.id ?? null });
    setReplyTo(null);
  }

  async function sendPhoto(file: File, caption: string) {
    if (file.type.startsWith("video/")) return sendVideo(file, caption);
    const { blob, type } = await shrinkPhoto(file);
    let meta: { width: number; height: number } | null = null;
    try {
      const bmp = await createImageBitmap(blob);
      meta = { width: bmp.width, height: bmp.height };
      bmp.close();
    } catch {
      // size is only a layout hint
    }
    sendWithReply(caption, {
      media: {
        kind: "image",
        meta,
        localUri: URL.createObjectURL(blob),
        upload: { body: blob, contentType: type },
      },
    });
  }

  /** Up to a minute; it's encrypted and sent to R2. */
  async function sendVideo(file: File, caption: string) {
    if (file.size > VIDEO_MAX_BYTES) throw new VideoTooBigError();
    const localUri = URL.createObjectURL(file);
    const meta = await new Promise<{
      width: number;
      height: number;
      duration_ms: number;
      poster?: string;
    } | null>((resolve) => {
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;
      v.onloadeddata = async () => {
        const info = {
          width: v.videoWidth,
          height: v.videoHeight,
          duration_ms: Math.round(v.duration * 1000),
        };
        // A still to show before it plays (kept inside the encryption).
        const poster = await posterFrom(v);
        resolve(poster ? { ...info, poster } : info);
      };
      v.onerror = () => resolve(null);
      v.src = localUri;
    });
    if (meta && meta.duration_ms > VIDEO_MAX_MS + 1000) {
      URL.revokeObjectURL(localUri);
      throw new VideoTooLongError();
    }
    sendWithReply(caption, {
      media: {
        kind: "video",
        meta,
        localUri,
        upload: { body: file, contentType: file.type || "video/mp4" },
      },
    });
  }

  /** Pasted: sent as it is (a GIF keeps moving), or kept in Ours and sent as a sticker. */
  const [pasted, setPasted] = useState<File | null>(null);
  async function sendPasted(file: File, as: PastedSendAs) {
    setPasted(null);
    if (as === "video") return sendVideo(file, "");
    let meta = { width: 320, height: 320 };
    try {
      const bmp = await createImageBitmap(file);
      meta = { width: bmp.width, height: bmp.height };
      bmp.close();
    } catch {
      // size is only a layout hint
    }
    // On screen at once; the file uploads as it sends, and the sticker joins Ours after.
    if (as === "sticker" && isStickerMime(file.type)) {
      return sendWithReply("", {
        media: {
          kind: "sticker",
          path: stickerPath(couple.id, uuid(), file.type),
          meta,
          localUri: URL.createObjectURL(file),
          upload: { body: file, contentType: file.type },
          keep: true,
        },
      });
    }
    sendWithReply("", {
      media: {
        kind: "image",
        meta,
        localUri: URL.createObjectURL(file),
        upload: { body: file, contentType: file.type },
      },
    });
  }

  /** Save a photo, video, GIF or sticker as a file, named by when it was sent. */
  async function download(m: Message) {
    const src = m.media_path
      ? (media[m.media_path] ?? m.localUri)
      : (m.media_meta?.url ?? m.localUri);
    if (!src) throw new Error("Still opening. Try again in a moment.");
    const blob = await (await fetch(src)).blob();
    const ext =
      (m.mime ?? blob.type)
        .split("/")[1]
        ?.split(";")[0]
        ?.replace("jpeg", "jpg")
        .replace("quicktime", "mov") ||
      (m.media_kind === "video" ? "mp4" : "jpg");
    const d = new Date(m.created_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Us-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  async function sendVoice(blob: Blob, durationMs: number) {
    const waveform = await waveformOf(blob);
    sendWithReply("", {
      media: {
        kind: "audio",
        meta: waveform ? { duration_ms: Math.round(durationMs), waveform } : { duration_ms: Math.round(durationMs) },
        localUri: URL.createObjectURL(blob),
        upload: { body: blob, contentType: blob.type },
      },
    });
  }

  const fail = (e: unknown) => {
    setActionError((e as Error).message ?? "That didn’t work. Try again.");
    setTimeout(() => setActionError(null), 4000);
  };
  const { partnerTyping, onComposerChange, onComposerSent } = useTyping();
  const calls = useCallManager();

  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // Scrolled well up: a button back to the latest, counting what arrived meanwhile.
  const [away, setAway] = useState(false);
  const [newBelow, setNewBelow] = useState(0);
  const newest = messages[messages.length - 1];
  const seenNewest = useRef(newest?.id);
  useEffect(() => {
    if (!newest || newest.id === seenNewest.current) return;
    seenNewest.current = newest.id;
    if (!away) return;
    if (newest.sender_id === me.id) toLatest();
    else setNewBelow((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newest, away, me.id]);
  function toLatest() {
    const el = scroller.current;
    el?.scrollTo({
      top: el.scrollHeight,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    setNewBelow(0);
  }

  // Stay pinned to the bottom unless the reader has scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, partnerTyping, loading]);

  useEffect(() => {
    document.title = `${partner.display_name} · Us`;
  }, [partner.display_name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setActiveId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const latestPin = pins.data?.[0];

  // The thread itself, rebuilt only when what it shows changes: a typing dot or
  // my partner coming online re-renders the page, not every bubble in it.
  const h = useRef({ retry, react, pin, download, jumpTo, fail, quoteFor, calls });
  h.current = { retry, react, pin, download, jumpTo, fail, quoteFor, calls };
  const thread = useMemo(
    () =>
      groupByDay(messages).map((group) => (
      <section key={group.key} aria-label={group.day}>
        <DayDivider label={group.day} />
        <ol>
          {group.items.map((m, i) =>
            m.kind === "call" ? (
              <CallEntry
                key={m.id}
                message={m}
                myId={me.id}
                onCallBack={(media) => void h.current.calls.startCall(media)}
              />
            ) : (
              <Bubble
                key={m.id}
                message={m}
                mine={m.sender_id === me.id}
                slot={m.sender_id === me.id ? mySlot : partnerSlot}
                authorName={partner.display_name}
                myId={me.id}
                first={!clusters(group.items[i - 1], m)}
                last={!clusters(m, group.items[i + 1])}
                mediaUrl={
                  m.media_path ? media[m.media_path] : undefined
                }
                quote={h.current.quoteFor(m)}
                active={activeId === m.id}
                highlighted={highlight === m.id}
                onToggleActive={() =>
                  setActiveId((id) => (id === m.id ? null : m.id))
                }
                onRetry={() => h.current.retry(m.id)}
                onReact={(emoji) => {
                  setActiveId(null);
                  void h.current.react(m.id, emoji).catch(fail);
                }}
                onReply={() => {
                  setActiveId(null);
                  setReplyTo(m);
                }}
                onPin={(p) => {
                  setActiveId(null);
                  void h.current.pin(m.id, p).catch(fail);
                }}
                onKeepSticker={
                  stickersOn
                    ? () => {
                        setActiveId(null);
                        void keepSticker(
                          sb,
                          couple.id,
                          me.id,
                          m.media_path!,
                          {
                            width: m.media_meta?.width,
                            height: m.media_meta?.height,
                          },
                        )
                          .then(() =>
                            channel.sendChanged(STICKERS_TOPIC),
                          )
                          .catch(fail);
                      }
                    : undefined
                }
                onOpenPhoto={(url) => {
                  setPhoto(url);
                  setViewed(m);
                }}
                onDownload={() => {
                  setActiveId(null);
                  void h.current.download(m).catch(fail);
                }}
                onDelete={() => {
                  setActiveId(null);
                  setDeleting(m);
                }}
                saved={!!saved.data?.has(m.id)}
                onStar={(on) => {
                  setActiveId(null);
                  void saved.mutate(() => setSaved(sb, me.id, m.id, on)).catch(fail);
                }}
                onEdit={
                  canEdit(m, me.id)
                    ? () => {
                        setActiveId(null);
                        setReplyTo(null);
                        setEditing(m);
                      }
                    : undefined
                }
                onJumpTo={(id) => void h.current.jumpTo(id)}
              />
            ),
          )}
        </ol>
      </section>
    )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, media, activeId, highlight, stickersOn, snaps.data, saved.data, me.id, mySlot, partnerSlot, partner.display_name, sb, couple.id, channel],
  );

  const status = partnerTyping ? "typing…" : partnerOnline ? "online" : "away";

  return (
    <div className="flex h-[calc(100dvh-64px-env(safe-area-inset-bottom))] flex-col bg-chat lg:h-dvh" style={chatBg ? { backgroundColor: chatBg } : undefined}>
      <header className="flex items-center gap-3 border-b border-paper-edge bg-paper-raised px-4 py-2.5 sm:px-8">
        <Link
          href="/talk/info"
          aria-label={`${shownName}. Chat info, media and more`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          <Avatar name={partner.display_name} slot={partnerSlot} online={partnerOnline} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-lead text-ink">{shownName}</span>
            <span className={partnerTyping || partnerOnline ? "block text-micro font-medium text-teal-700" : "block text-micro text-ink-muted"}>{status}</span>
          </span>
        </Link>
        <PrivacyBadge
          privacy="shared"
          partnerName={partner.display_name}
          compact
          className="hidden sm:inline-flex"
        />
        <IconButton label="Search messages" onClick={() => setPanel("search")}>
          <Search className="h-5 w-5" />
        </IconButton>
        <IconButton
          label={`Voice call ${partner.display_name}`}
          onClick={() => void calls.startCall("audio")}
        >
          <Phone className="h-5 w-5" />
        </IconButton>
        <IconButton
          label={`Video call ${partner.display_name}`}
          onClick={() => void calls.startCall("video")}
        >
          <Video className="h-[22px] w-[22px]" />
        </IconButton>
        <MobileSettingsLink />
      </header>

      <ChatKeyBanner />

      {latestPin ? (
        <button
          type="button"
          onClick={() => setPanel("pins")}
          className="flex items-center gap-3 border-b border-paper-edge/80 bg-gold-50/60 px-4 py-2 text-left hover:bg-gold-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400 sm:px-8"
        >
          <Pin className="h-4 w-4 shrink-0 text-gold-700" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-micro font-medium text-gold-700">
              Pinned{pins.data!.length > 1 ? ` · ${pins.data!.length}` : ""}
            </span>
            <span className="block truncate text-small text-ink">
              {messagePreview(latestPin)}
            </span>
          </span>
        </button>
      ) : null}

      <div
        className="relative flex min-h-0 flex-1 flex-col"
        // Photos and videos dragged in from the desktop are sent as they land.
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDropping(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDropping(false);
          const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
          if (!files.length) return fail(new Error("Only photos and videos can be dropped here."));
          void (async () => {
            for (const f of files.slice(0, 10)) await sendPhoto(f, "").catch(fail);
          })();
        }}
      >
        {dropping ? (
          <div aria-hidden className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-[24px] border-2 border-dashed border-rose-400 bg-paper/80 font-display text-heading text-rose-700">
            Drop to send to {partner.display_name}
          </div>
        ) : null}
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            const below = el.scrollHeight - el.scrollTop - el.clientHeight;
            stick.current = below < 80;
            const up = below > 400;
            if (up !== away) {
              setAway(up);
              if (!up) setNewBelow(0);
            }
          }}
          className="scrollbar-quiet flex-1 overflow-y-auto px-4 sm:px-8"
        >
          <div className="mx-auto max-w-3xl pb-2 pt-6">
            {loading ? (
              <div className="flex justify-center py-20">
                <Spinner className="h-5 w-5 text-rose-400" />
              </div>
            ) : messages.length === 0 ? (
              <EmptyThread name={partner.display_name} />
            ) : (
              <>
                {hasOlder && (
                  <div className="mb-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        stick.current = false;
                        void loadOlder();
                      }}
                      className="rounded-full px-3 py-1 text-small text-ink-muted hover:bg-paper-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                    >
                      Earlier messages
                    </button>
                  </div>
                )}
                {thread}
              </>
            )}
            <TypingBubble
              visible={partnerTyping}
              name={partner.display_name}
              slot={partnerSlot}
            />
          </div>
        </div>
        {away ? (
          <button
            type="button"
            onClick={toLatest}
            aria-label={
              newBelow ? `Go to latest, ${newBelow} new` : "Go to latest"
            }
            className="absolute bottom-3 right-4 flex h-11 w-11 items-center justify-center rounded-full border border-paper-edge bg-paper-raised text-ink-soft shadow-[0_8px_24px_-12px_rgba(36,25,51,0.5)] transition-colors hover:bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 sm:right-8"
          >
            <ChevronsDown className="h-5 w-5" />
            {newBelow ? (
              <span className="absolute -top-2 min-w-[20px] rounded-full bg-rose-600 px-1.5 text-center text-[11px] font-semibold leading-[18px] text-white">
                {newBelow > 99 ? "99+" : newBelow}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>


      <Dialog
        open={panel === "search"}
        onOpenChange={(o) => !o && setPanel(null)}
        title="Search messages"
      >
        {panel === "search" ? (
          <SearchPanel
            authorOf={authorOf}
            onPick={(m) => {
              setPanel(null);
              if (!jumpTo(m.id))
                fail(
                  new Error(
                    `That one is from ${formatDay(m.created_at)}. Tap “Earlier messages” to load it.`,
                  ),
                );
            }}
          />
        ) : null}
      </Dialog>
      <Dialog
        open={panel === "pins"}
        onOpenChange={(o) => !o && setPanel(null)}
        title="Pinned"
        description="Either of you can pin or unpin."
      >
        <MessageList
          items={pins.data ?? []}
          empty="Nothing pinned."
          authorOf={authorOf}
          onPick={(m) => {
            setPanel(null);
            if (!jumpTo(m.id))
              fail(
                new Error(
                  `That one is from ${formatDay(m.created_at)}. Tap “Earlier messages” to load it.`,
                ),
              );
          }}
        />
      </Dialog>
      <Lightbox
        src={photo}
        label="Photo"
        onClose={() => {
          setPhoto(null);
          setViewed(null);
        }}
        onDownload={
          viewed ? () => void download(viewed).catch(fail) : undefined
        }
        onDelete={viewed ? () => setDeleting(viewed) : undefined}
      />

      <div className="px-3 pb-3 pt-1 sm:px-8 sm:pb-6">
        <div className="mx-auto max-w-3xl">
          {actionError ? (
            <p role="alert" className="mb-2 px-2 text-small text-rose-700">
              {actionError}
            </p>
          ) : null}
          <Composer
            partnerName={partner.display_name}
            onChange={onComposerChange}
            replyTo={
              replyTo
                ? {
                    id: replyTo.id,
                    author: authorOf(replyTo),
                    text: messagePreview(replyTo),
                  }
                : null
            }
            onCancelReply={() => setReplyTo(null)}
            editing={editing ? { id: editing.id, text: editing.body ?? "" } : null}
            onCancelEdit={() => setEditing(null)}
            onSaveEdit={(t) => {
              const id = editing?.id;
              setEditing(null);
              if (id) void edit(id, t).catch(fail);
            }}
            onSend={(t) => {
              onComposerSent();
              sendWithReply(t);
            }}
            onPhoto={(f, caption) => void sendPhoto(f, caption).catch(fail)}
            onVoice={(blob, ms) => void sendVoice(blob, ms).catch(fail)}
            onGif={() => setExpressions("gif")}
            onDoodle={draw ? () => setDoodle(true) : undefined}
            onSticker={() => setExpressions("sticker")}
            onCapsule={() => setCapsule(true)}
            onPasteMedia={setPasted}
          />
          <CapsuleDialog
            open={capsule}
            onOpenChange={setCapsule}
            onDone={(when) => {
              setCapsule(false);
              fail(new Error(`Sealed. It opens ${when}.`));
            }}
          />
          <PastedMediaDialog
            file={pasted}
            stickers={stickersOn}
            onClose={() => setPasted(null)}
            onSend={(f, as) => void sendPasted(f, as).catch(fail)}
          />
          {stickersOn && makerOpened ? (
            <StickerMaker
              open={stickerMaker}
              onOpenChange={setStickerMaker}
              onSaved={(st, send) => send && sendSticker(st)}
            />
          ) : null}
          {draw && doodleOpened ? (
            <DoodleDialog
              open={doodle}
              onOpenChange={setDoodle}
              mode="chat"
              onChatPhoto={(f) => void sendPhoto(f, "").catch(fail)}
            />
          ) : null}
          {expressionsOpened ? (
          <ExpressionPanel
            open={expressions !== null}
            initialTab={expressions ?? "sticker"}
            stickers={stickersOn}
            onOpenChange={(o) => !o && setExpressions(null)}
            onPick={(kind, gif) => {
              setExpressions(null);
              sendWithReply("", {
                media: {
                  kind,
                  meta: {
                    url: gif.url,
                    still: gif.still,
                    width: gif.width,
                    height: gif.height,
                  },
                  localUri: gif.previewUrl,
                },
              });
            }}
            onSendOurs={(st, url) => {
              setExpressions(null);
              sendSticker(st, url);
            }}
            onMake={() => {
              setExpressions(null);
              setStickerMaker(true);
            }}
          />
          ) : null}
          <DeleteDialog
            message={deleting}
            mine={
              !!deleting &&
              deleting.sender_id === me.id &&
              !deleting.deleted_at &&
              !deleting.pending &&
              !deleting.failed
            }
            onClose={() => setDeleting(null)}
            onDelete={(m, forEveryone) => {
              setDeleting(null);
              if (viewed?.id === m.id) setPhoto(null);
              void remove(m.id, forEveryone).catch(fail);
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** WhatsApp's choice: for everyone (mine), or just for me. */
function DeleteDialog({
  message,
  mine,
  onClose,
  onDelete,
}: {
  message: Message | null;
  mine: boolean;
  onClose: () => void;
  onDelete: (m: Message, forEveryone: boolean) => void;
}) {
  return (
    <Dialog
      open={!!message}
      onOpenChange={(o) => !o && onClose()}
      title="Delete message?"
      description={
        mine ? undefined : "It goes from this chat on your devices only."
      }
    >
      <div className="flex flex-col gap-2">
        {mine ? (
          <Button block onClick={() => message && onDelete(message, true)}>
            Delete for everyone
          </Button>
        ) : null}
        <Button
          block
          variant={mine ? "secondary" : "primary"}
          onClick={() => message && onDelete(message, false)}
        >
          Delete for me
        </Button>
        <Button block variant="quiet" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}

function MessageList({
  items,
  empty,
  onPick,
  authorOf,
}: {
  items: Message[];
  empty: string;
  onPick: (m: Message) => void;
  authorOf: (m: Message) => string;
}) {
  if (!items.length)
    return (
      <p className="py-6 text-center text-small text-ink-muted">{empty}</p>
    );
  return (
    <ul className="-mx-2 max-h-[60vh] space-y-1 overflow-y-auto">
      {items.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onPick(m)}
            className="w-full rounded-control px-2 py-2 text-left hover:bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            <span className="block text-micro text-ink-muted">
              {authorOf(m)} · {formatDay(m.created_at)}
            </span>
            <span className="line-clamp-2 text-small text-ink">
              {messagePreview(m)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SearchPanel({
  onPick,
  authorOf,
}: {
  onPick: (m: Message) => void;
  authorOf: (m: Message) => string;
}) {
  const { sb, couple, me } = useCouple();
  const { cipher } = useChatKey();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Message[] | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) {
      setSearching(false);
      return setResults(null);
    }
    // Messages are encrypted, so the search reads back through the thread here in the browser.
    const signal = { aborted: false };
    const t = setTimeout(() => {
      setSearching(true);
      void searchMessages(sb, couple.id, q, cipher, {
        signal,
        onProgress: (found, done) => {
          if (signal.aborted) return;
          setResults(
            found.filter((m) => !hiddenFor(m, me.id) && !m.deleted_at),
          );
          if (done) setSearching(false);
        },
      }).catch(() => {
        if (signal.aborted) return;
        setResults((r) => r ?? []);
        setSearching(false);
      });
    }, 300);
    return () => {
      signal.aborted = true;
      clearTimeout(t);
    };
  }, [q, sb, couple.id, me.id, cipher]);
  return (
    <div className="space-y-3">
      <input
        autoFocus
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Words you remember…"
        aria-label="Search messages"
        className="h-11 w-full rounded-control border border-paper-edge bg-paper px-4 text-body text-ink placeholder:text-ink-muted/70 focus:border-rose-300 focus:outline-none"
      />
      {searching ? (
        <p className="text-micro text-ink-muted">Searching older messages…</p>
      ) : null}
      {results ? (
        <MessageList
          items={results}
          empty={searching ? "Nothing yet…" : "Nothing found."}
          onPick={onPick}
          authorOf={authorOf}
        />
      ) : null}
    </div>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div
      className="my-4 flex justify-center"
      role="separator"
      aria-label={label}
    >
      <span className="rounded-lg bg-paper-raised px-3 py-1 text-micro font-medium text-ink-soft shadow-[0_1px_0.5px_rgba(20,14,28,0.08)]">
        {label}
      </span>
    </div>
  );
}

function EmptyThread({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <p className="font-serif text-title font-light italic text-ink">
        Say the first thing.
      </p>
      <p className="mt-2 max-w-xs text-small text-ink-muted">
        Only you and {name} can ever read this thread.
      </p>
    </div>
  );
}

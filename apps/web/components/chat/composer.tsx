'use client';

import { formatVoiceLength } from '@us/shared';
import { ArrowUp, ImagePlus, Mic, PenLine, Square, Trash2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import type { ReplyQuote } from './bubble';

/** Longest voice note. */
const MAX_VOICE_MS = 5 * 60_000;

interface ComposerProps {
  partnerName: string;
  onSend: (text: string) => void;
  onChange: (text: string) => void;
  replyTo?: ReplyQuote | null;
  onCancelReply?: () => void;
  onPhoto?: (file: File, caption: string) => void;
  onVoice?: (blob: Blob, durationMs: number) => void;
  /** Open the GIF and sticker picker. */
  onGif?: () => void;
  /** Draw a doodle and send it as a picture. */
  onDoodle?: () => void;
}

function pickAudioType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t));
}

/** Auto-growing textarea. Enter sends; Shift+Enter is a new line. Photos and voice notes too. */
export function Composer({ partnerName, onSend, onChange, replyTo, onCancelReply, onPhoto, onVoice, onGif, onDoodle }: ComposerProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Voice recording
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const keep = useRef(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  useEffect(() => {
    if (replyTo) ref.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      if (ms >= MAX_VOICE_MS) stopRecording(true);
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  function send() {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
    ref.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
    if (e.key === 'Escape' && replyTo) onCancelReply?.();
  }

  async function startRecording() {
    setError(null);
    const type = pickAudioType();
    if (!type || !navigator.mediaDevices?.getUserMedia) return setError('This browser can’t record voice notes.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const r = new MediaRecorder(stream, { mimeType: type });
      chunks.current = [];
      keep.current = true;
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const ms = Date.now() - startedAt.current;
        if (keep.current && ms > 600) onVoice?.(new Blob(chunks.current, { type }), ms);
        recorder.current = null;
      };
      recorder.current = r;
      startedAt.current = Date.now();
      setElapsed(0);
      r.start(250);
      setRecording(true);
    } catch {
      setError('Allow the microphone to record a voice note.');
    }
  }

  function stopRecording(sendIt: boolean) {
    keep.current = sendIt;
    recorder.current?.stop();
    setRecording(false);
  }

  const canRecord = !!onVoice && !text.trim();

  return (
    <div className="space-y-2">
      {replyTo ? (
        <div className="flex items-center gap-3 rounded-[18px] border border-paper-edge bg-paper-sunken px-4 py-2">
          <div className="min-w-0 flex-1 border-l-[3px] border-rose-400 pl-2.5">
            <p className="text-micro font-medium text-ink">Replying to {replyTo.author}</p>
            <p className="truncate text-small text-ink-soft">{replyTo.text}</p>
          </div>
          <button type="button" aria-label="Cancel reply" onClick={onCancelReply} className="rounded-full p-1.5 text-ink-muted hover:bg-paper-raised hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="px-2 text-small text-rose-700">
          {error}
        </p>
      ) : null}

      {recording ? (
        <div className="flex items-center gap-3 rounded-[26px] border border-rose-300 bg-paper-raised p-1.5 pl-4">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-600" aria-hidden />
          <span className="flex-1 text-body tabular-nums text-ink" role="timer" aria-live="off">
            Recording {formatVoiceLength(elapsed)}
          </span>
          <button type="button" aria-label="Discard voice note" onClick={() => stopRecording(false)} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-paper-sunken">
            <Trash2 className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Send voice note"
            onClick={() => stopRecording(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        </div>
      ) : (
        <form
          className="flex items-end gap-1.5 rounded-[26px] border border-paper-edge bg-paper-raised p-1.5 pl-2 shadow-[0_8px_24px_-16px_rgba(36,25,51,0.35)] focus-within:border-rose-300"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {onPhoto ? (
            <>
              <button
                type="button"
                aria-label="Send a photo"
                onClick={() => fileInput.current?.click()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-paper-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  onPhoto(f, text.trim());
                  setText('');
                }}
              />
            </>
          ) : null}
          {onGif ? (
            <button
              type="button"
              aria-label="Send a GIF or sticker"
              onClick={onGif}
              className="flex h-10 shrink-0 items-center justify-center rounded-full px-1.5 text-ink-soft hover:bg-paper-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              <span className="rounded-md border-[1.5px] border-current px-1 text-[11px] font-bold leading-[14px]">GIF</span>
            </button>
          ) : null}
          {onDoodle ? (
            <button
              type="button"
              aria-label="Draw a doodle"
              onClick={onDoodle}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-paper-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              <PenLine className="h-5 w-5" />
            </button>
          ) : null}
          <label htmlFor="composer" className="sr-only">
            Message {partnerName}
          </label>
          <textarea
            id="composer"
            ref={ref}
            rows={1}
            value={text}
            maxLength={4000}
            placeholder={`Message ${partnerName}…`}
            onChange={(e) => {
              setText(e.target.value);
              onChange(e.target.value);
            }}
            onKeyDown={onKeyDown}
            className="scrollbar-quiet max-h-[180px] flex-1 resize-none bg-transparent py-2.5 text-body text-ink placeholder:text-ink-muted/70 focus:outline-none"
          />
          {canRecord ? (
            <button
              type="button"
              aria-label="Record a voice note"
              onClick={() => void startRecording()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              <Mic className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              disabled={!text.trim()}
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white transition-[opacity,transform] duration-quick',
                'hover:bg-rose-700 active:scale-95 disabled:opacity-30',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2',
              )}
            >
              <ArrowUp className="h-5 w-5" strokeWidth={2.25} />
            </button>
          )}
        </form>
      )}
    </div>
  );
}

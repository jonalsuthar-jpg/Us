'use client';

import { ArrowUp } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

interface ComposerProps {
  partnerName: string;
  onSend: (text: string) => void;
  onChange: (text: string) => void;
}

/** Auto-growing textarea. Enter sends; Shift+Enter is a new line. */
export function Composer({ partnerName, onSend, onChange }: ComposerProps) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

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
  }

  return (
    <form
      className="flex items-end gap-2 rounded-[26px] border border-paper-edge bg-paper-raised p-1.5 pl-4 shadow-[0_8px_24px_-16px_rgba(42,31,45,0.35)] focus-within:border-rose-300"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
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
    </form>
  );
}

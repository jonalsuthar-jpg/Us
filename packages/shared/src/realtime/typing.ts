/**
 * Typing indicator timing. Ephemeral — sent over broadcast, never stored.
 *
 * Sender: emits `true` on the first keystroke, refreshes every HEARTBEAT_MS
 * while typing continues, and emits `false` after IDLE_MS without input (or
 * immediately on send / clear).
 *
 * Receiver: shows the indicator on `true`, hides on `false`, and also hides on
 * its own after EXPIRE_MS in case the `false` was lost.
 */
export const TYPING_IDLE_MS = 3000;
export const TYPING_HEARTBEAT_MS = 2000;
export const TYPING_EXPIRE_MS = TYPING_IDLE_MS + 1500;

export class TypingSender {
  private active = false;
  private lastSent = 0;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly send: (typing: boolean) => void,
    private readonly now: () => number = Date.now,
  ) {}

  /** Call on every composer change with the current text. */
  input(text: string) {
    if (!text.trim()) {
      this.stop();
      return;
    }
    const t = this.now();
    if (!this.active || t - this.lastSent >= TYPING_HEARTBEAT_MS) {
      this.active = true;
      this.lastSent = t;
      this.send(true);
    }
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.stop(), TYPING_IDLE_MS);
  }

  stop() {
    clearTimeout(this.idleTimer);
    if (this.active) {
      this.active = false;
      this.send(false);
    }
  }
}

export class TypingReceiver {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private typing = false;

  constructor(private readonly onChange: (typing: boolean) => void) {}

  receive(typing: boolean) {
    clearTimeout(this.timer);
    if (typing) this.timer = setTimeout(() => this.set(false), TYPING_EXPIRE_MS);
    this.set(typing);
  }

  /** A message arrived from them — they're clearly done typing it. */
  clear() {
    this.receive(false);
  }

  dispose() {
    clearTimeout(this.timer);
  }

  private set(v: boolean) {
    if (v === this.typing) return;
    this.typing = v;
    this.onChange(v);
  }
}

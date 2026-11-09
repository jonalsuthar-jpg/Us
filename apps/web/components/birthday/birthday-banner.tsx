"use client";

import { birthdaySplashKey, setDeviceFlag } from "@us/shared";
import type { BirthdayView } from "@us/shared/react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Confetti } from "@/components/games/confetti";
import { Sheet } from "@/components/ui/sheet";

/**
 * The birthday on Home: a preview card for the maker before the day, the
 * festive banner on the day, and a way back into the room after.
 */
export function BirthdayBanner({ b }: { b: BirthdayView }) {
  const { room, phase, maker } = b;
  if (!room || !phase) return null;

  if (phase === "before") {
    if (!maker) return null;
    const drafts = room.content.drafts.length;
    const day = new Date(room.unlock_at).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
    return (
      <div className="space-y-2">
        <Link
          href="/birthday"
          className="block rounded-sheet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          <Sheet
            tone="note"
            accent="gold"
            pad="sm"
            className="flex items-center gap-3 transition-transform hover:-translate-y-0.5"
          >
            <span className="text-[28px] leading-none">🎂</span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold text-ink">{`Preview ${room.name}’s birthday`}</span>
              <span className="block text-small text-ink-soft">
                {`Only you can see this. She gets it at midnight on ${day}.${drafts ? ` ${drafts} ${drafts === 1 ? "part is" : "parts are"} still drafts.` : ""}`}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-ink-muted" />
          </Sheet>
        </Link>
        <PreviewLook b={b} />
      </div>
    );
  }

  if (phase === "after") {
    if (!maker && !room.memory_id) return null;
    return (
      <Link
        href="/birthday"
        className="inline-flex items-center gap-2 rounded-full bg-paper-raised px-4 py-2 text-small font-medium text-ink hover:bg-paper-sunken"
      >
        🎂 {maker ? `${room.name}’s birthday room` : "Your birthday room"}
      </Link>
    );
  }

  // The day itself.
  return (
    <>
      <Link
        href="/birthday"
        aria-label={maker ? "Open the birthday room" : "Open your celebration"}
        className="relative block overflow-hidden rounded-[28px] bg-plum-900 px-7 pb-7 pt-8 text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -left-10 -top-12 h-44 w-44 rounded-full bg-rose-500 opacity-40 blur-xl"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-16 -right-8 h-48 w-48 rounded-full bg-teal-500 opacity-30 blur-xl"
        />
        <Balloon emoji="🎈" left="72%" delay={0} />
        <Balloon emoji="🎈" left="86%" delay={0.7} />
        <Balloon emoji="🎉" left="60%" delay={1.3} />
        <span className="relative block font-display text-[30px] leading-[1.2] sm:text-[38px]">
          {maker
            ? `It’s ${room.name}’s birthday 🎂`
            : `Happy Birthday, ${room.name} ✨`}
        </span>
        <span className="relative mt-1 block text-small text-plum-200">
          {maker
            ? room.opened_at
              ? "She’s opened her celebration 💛"
              : "She hasn’t opened it yet"
            : "Something’s waiting for you…"}
        </span>
        <motion.span
          animate={{
            scale: [1, 1.04, 1],
            boxShadow: [
              "0 0 10px rgba(252,194,79,0.35)",
              "0 0 28px rgba(252,194,79,0.8)",
              "0 0 10px rgba(252,194,79,0.35)",
            ],
          }}
          transition={{ duration: 2.2, repeat: Infinity }}
          className="relative mt-5 inline-flex items-center gap-2 rounded-full bg-gold-300 px-5 py-3 font-semibold text-plum-900"
        >
          {maker ? "Open the room" : "Open your celebration"}
          <ChevronRight className="h-4 w-4" />
        </motion.span>
      </Link>
      {!maker ? <Confetti pieces={50} /> : null}
    </>
  );
}

function Balloon({
  emoji,
  left,
  delay,
}: {
  emoji: string;
  left: string;
  delay: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-4 text-[32px] leading-none"
      style={{ left }}
      animate={reduced ? undefined : { y: [0, -10, 0], rotate: [-4, 4, -4] }}
      transition={{ duration: 3.6, repeat: Infinity, delay, ease: "easeInOut" }}
    >
      {emoji}
    </motion.span>
  );
}

/** The maker tries the birthday look (balloons, bunting, her welcome) on this device before the day. */
function PreviewLook({ b }: { b: BirthdayView }) {
  const { room, preview, setPreview } = b;
  if (!room) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-small">
      <label className="inline-flex cursor-pointer items-center gap-2 text-ink-soft">
        <input
          type="checkbox"
          checked={preview}
          onChange={(e) => setPreview(e.target.checked)}
          className="h-4 w-4 accent-rose-500"
        />
        Preview the birthday look on this device
      </label>
      {preview ? (
        <button
          type="button"
          onClick={() => {
            setDeviceFlag(birthdaySplashKey(room.id) + ":preview", false);
            setPreview(false);
            setTimeout(() => setPreview(true), 50);
          }}
          className="rounded-full text-rose-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          Replay her welcome
        </button>
      ) : null}
    </div>
  );
}

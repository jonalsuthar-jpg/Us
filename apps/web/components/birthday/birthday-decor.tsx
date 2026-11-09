"use client";

import { birthdaySplashKey, getDeviceFlag, setDeviceFlag } from "@us/shared";
import { useBirthday } from "@us/shared/react";
import { motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Confetti } from "@/components/games/confetti";

const COLOURS = ["#E46B8A", "#F3B33D", "#3FA6A0", "#8E6BB8", "#7FB069"];

/**
 * The birthday look over the whole app, on the day only (or while the maker
 * previews it on this device): bunting along the top, balloons drifting up
 * now and then, and a welcome the first time the birthday person opens the
 * app. None of it takes a tap away from what's underneath.
 */
export function BirthdayDecor() {
  const b = useBirthday();
  if (!b.festive || !b.room) return null;
  return (
    <>
      <Bunting />
      <RisingBalloons />
      {!b.maker || b.preview ? (
        <Welcome
          name={b.room.name}
          splashKey={
            birthdaySplashKey(b.room.id) + (b.preview ? ":preview" : "")
          }
        />
      ) : null}
    </>
  );
}

function Bunting() {
  const reduced = useReducedMotion();
  const flags = 28;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-30 h-7 overflow-hidden"
    >
      <svg
        className="h-full w-full"
        viewBox={`0 0 ${flags * 40} 28`}
        preserveAspectRatio="none"
      >
        <path
          d={`M0 3 Q ${flags * 20} 12 ${flags * 40} 3`}
          stroke="#B9A4C9"
          strokeWidth="1.2"
          fill="none"
        />
      </svg>
      <div className="absolute inset-0 flex justify-between px-1">
        {Array.from({ length: flags }, (_, i) => {
          // The string sags in the middle, so the flags do too.
          const sag = Math.sin((i / (flags - 1)) * Math.PI) * 6;
          return (
            <motion.span
              key={i}
              className="block"
              style={{
                marginTop: 2 + sag,
                width: 0,
                height: 0,
                borderLeft: "7px solid transparent",
                borderRight: "7px solid transparent",
                borderTop: `14px solid ${COLOURS[i % COLOURS.length]}`,
                transformOrigin: "top center",
              }}
              animate={reduced ? undefined : { rotate: [-5, 5, -5] }}
              transition={{
                duration: 3 + (i % 3) * 0.4,
                repeat: Infinity,
                ease: "easeInOut",
                delay: (i % 5) * 0.2,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

interface Rising {
  id: number;
  x: number;
  colour: string;
  size: number;
  duration: number;
}

function RisingBalloons() {
  const reduced = useReducedMotion();
  const [balloons, setBalloons] = useState<Rising[]>([]);
  useEffect(() => {
    if (reduced) return;
    let n = 0;
    const launch = (count: number) =>
      setBalloons((prev) => [
        ...prev.slice(-6),
        ...Array.from({ length: count }, () => ({
          id: n++,
          x: 4 + Math.random() * 88,
          colour: COLOURS[Math.floor(Math.random() * COLOURS.length)]!,
          size: 34 + Math.random() * 22,
          duration: 11 + Math.random() * 6,
        })),
      ]);
    launch(3);
    const t = setInterval(() => launch(1 + Math.round(Math.random())), 25_000);
    return () => clearInterval(t);
  }, [reduced]);
  if (reduced) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-30 overflow-hidden"
    >
      {balloons.map((b) => (
        <motion.div
          key={b.id}
          className="absolute bottom-0"
          style={{ left: `${b.x}%` }}
          initial={{ y: "20vh", x: 0, opacity: 0.9 }}
          animate={{ y: "-115vh", x: [0, 14, -10, 8, 0] }}
          transition={{
            duration: b.duration,
            ease: "linear",
            x: { duration: b.duration, ease: "easeInOut" },
          }}
        >
          <Balloon colour={b.colour} size={b.size} />
        </motion.div>
      ))}
    </div>
  );
}

export function Balloon({ colour, size }: { colour: string; size: number }) {
  return (
    <svg
      width={size}
      height={size * 2.1}
      viewBox="0 0 40 84"
      className="opacity-90 drop-shadow-sm"
    >
      <ellipse cx="20" cy="20" rx="16" ry="19" fill={colour} />
      <ellipse cx="14" cy="13" rx="4" ry="6" fill="white" opacity="0.35" />
      <path d="M17 38 L23 38 L20 42 Z" fill={colour} />
      <path
        d="M20 42 C 15 52, 25 60, 20 70 S 18 80, 20 84"
        stroke="#9A8AA8"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}

/** The first time she opens the app on the day, once per device. */
function Welcome({ name, splashKey }: { name: string; splashKey: string }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  useEffect(() => setShow(!getDeviceFlag(splashKey)), [splashKey]);
  if (!show) return null;
  const close = () => {
    setDeviceFlag(splashKey, true);
    setShow(false);
  };
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Happy Birthday, ${name}`}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-plum-900 px-6 text-center text-paper"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-20 h-72 w-72 rounded-full bg-rose-500 opacity-40 blur-3xl"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-teal-500 opacity-30 blur-3xl"
      />
      {COLOURS.concat(COLOURS).map((c, i) => (
        <motion.div
          key={i}
          aria-hidden
          className="pointer-events-none absolute bottom-0"
          style={{ left: `${6 + i * 9.5}%` }}
          initial={{ y: "30vh" }}
          animate={{ y: "-120vh", x: [0, i % 2 ? 12 : -12, 0] }}
          transition={{
            duration: 6 + (i % 4),
            delay: i * 0.25,
            ease: "easeOut",
          }}
        >
          <Balloon colour={c} size={44 + (i % 3) * 10} />
        </motion.div>
      ))}
      <motion.p
        className="relative text-[56px] leading-none"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", delay: 0.4 }}
      >
        🎂
      </motion.p>
      <motion.h2
        className="relative mt-5 font-display text-[40px] leading-[1.15] sm:text-[52px]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.6 }}
      >
        Happy Birthday, {name} ✨
      </motion.h2>
      <motion.p
        className="relative mt-3 max-w-sm text-body text-plum-200"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
      >
        Today the whole app is dressed up for you. Something’s waiting inside…
      </motion.p>
      <motion.div
        className="relative mt-8 flex flex-col items-center gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8 }}
      >
        <button
          type="button"
          onClick={() => {
            close();
            router.push("/birthday");
          }}
          className="rounded-full bg-gold-300 px-6 py-3 font-semibold text-plum-900 shadow-[0_0_28px_rgba(252,194,79,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper"
        >
          Open your celebration
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-full px-4 py-2 text-small text-plum-200 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper"
        >
          Later
        </button>
      </motion.div>
      <Confetti pieces={90} />
    </motion.div>
  );
}

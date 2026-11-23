'use client';

/**
 * Isle's look on the web, piece by piece: carved wood and old parchment, the
 * painted cards (whole, frame and all, 2:3), gold coins and buttons, the
 * players' medallions. The table and its panels are built from these.
 */
import { DEV_INFO, RES_INFO, RESOURCES, type Dev, type Hand, type Res, type SeatView } from '@us/shared/isle';
import { Bot, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Dark carved wood with a fine grain and a gold hairline inside its edge. */
export const WOOD =
  'bg-[linear-gradient(180deg,rgba(255,220,170,0.07),transparent_40%),repeating-linear-gradient(97deg,rgba(255,235,200,0.035)_0_2px,transparent_2px_9px),linear-gradient(180deg,#6B4527,#3F2615)] border border-[#2A180B] shadow-[0_12px_26px_-10px_rgba(0,0,0,0.7),inset_0_0_0_1px_rgba(232,184,74,0.35),inset_0_1px_0_rgba(255,230,190,0.3)]';
/** Old paper: warm in the middle, darker towards its edges, in a gold-edged wooden border. */
export const PARCHMENT =
  'bg-[radial-gradient(ellipse_at_center,#FFF7E2_0%,#F6E6C0_60%,#E6CE98_100%)] border-[3px] border-[#8A6420] text-[#3B2A1E] shadow-[0_22px_48px_-16px_rgba(0,0,0,0.7),inset_0_0_0_2px_#F6DE9C,inset_0_0_30px_rgba(150,100,40,0.25)]';
/** A small gold caption over wood. */
export const CAPTION = 'font-serif text-[11px] font-bold uppercase tracking-[0.18em] text-[#E8B84A]/85';

export const resArt = (r: Res) => `/isle/art/card_${r}.jpg`;
export const devArt = (d: Dev) => `/isle/art/dev_${d}.jpg`;

export const handCount = (h: Partial<Hand>) => RESOURCES.reduce((n, r) => n + (h[r] ?? 0), 0);

export function ResIcon({ r, size = 20, className }: { r: Res; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <path d={RES_INFO[r].icon} fill="currentColor" />
    </svg>
  );
}

export function Dots() {
  return (
    <span className="ml-0.5 inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

/** Card sizes: 2:3, as painted. */
export const CARD = {
  xs: 'h-[42px] w-[28px] rounded-[4px]',
  sm: 'h-[72px] w-[48px] rounded-[6px]',
  dock: 'h-[96px] w-[64px] rounded-[8px]',
  md: 'h-[114px] w-[76px] rounded-[9px]',
  lg: 'h-[330px] w-[220px] rounded-[18px]',
} as const;
export type CardSize = keyof typeof CARD;

/** A gold coin with a count on it, pinned to a card's corner. */
export function Coin({ n, size = 'md', className }: { n: number | string; size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      className={cn(
        'absolute -right-2 -top-2 z-[1] flex items-center justify-center rounded-full border-2 border-[#FFF3CF] bg-[radial-gradient(circle_at_35%_30%,#FCE39A,#E0A93A_60%,#B57E1E)] font-serif font-bold text-[#3B2A1E] shadow-[0_2px_4px_rgba(0,0,0,0.45)]',
        size === 'sm' ? 'h-5 min-w-5 px-1 text-[11px]' : 'h-7 min-w-7 px-1 text-[14px]',
        className,
      )}
    >
      {n}
    </span>
  );
}

/**
 * A painted card, shown whole: never stretched or cropped (the pictures are
 * already 2:3). A count sits on a gold coin; picked cards lift and glow.
 */
export function CardFace({
  art,
  size = 'md',
  n,
  label,
  dim,
  picked,
  glow,
  title,
  onClick,
  disabled,
  className,
}: {
  art: string;
  size?: CardSize;
  n?: number;
  /** Written on the card's empty banner at the bottom. */
  label?: string;
  dim?: boolean;
  picked?: boolean;
  glow?: boolean;
  title?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      title={title}
      aria-label={title}
      className={cn(
        'relative shrink-0 transition duration-200 ease-out',
        CARD[size],
        dim ? 'opacity-40 saturate-[0.4]' : 'shadow-[0_10px_18px_-8px_rgba(0,0,0,0.75)]',
        onClick && !disabled && 'cursor-pointer hover:-translate-y-2 hover:shadow-[0_18px_26px_-10px_rgba(0,0,0,0.8)] active:scale-95',
        picked && '-translate-y-2 shadow-[0_0_0_3px_#F6CF62,0_14px_24px_-8px_rgba(0,0,0,0.8)]',
        glow && !picked && 'shadow-[0_0_0_2px_#E8B84A,0_0_18px_2px_rgba(232,184,74,0.75)]',
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={art} alt="" draggable={false} className={cn('absolute inset-0 h-full w-full object-contain', CARD[size])} />
      {label && (size === 'md' || size === 'lg' || size === 'dock') ? (
        <span
          className={cn(
            'absolute inset-x-[14%] flex items-center justify-center font-serif font-bold leading-none text-[#4A2E14]',
            size === 'lg' ? 'bottom-[5.5%] h-[10%] text-[20px]' : size === 'dock' ? 'bottom-[5.5%] h-[10%] text-[9.5px]' : 'bottom-[5.5%] h-[10%] text-[11px]',
          )}
        >
          {label}
        </span>
      ) : null}
      {n != null && n > 0 ? <Coin n={n} size={size === 'sm' || size === 'xs' ? 'sm' : 'md'} /> : null}
    </Tag>
  );
}

export function ResCard({ r, ...rest }: { r: Res } & Omit<Parameters<typeof CardFace>[0], 'art'>) {
  return <CardFace art={resArt(r)} label={rest.size === 'lg' || rest.size == null || rest.size === 'md' || rest.size === 'dock' ? RES_INFO[r].label : undefined} title={rest.title ?? RES_INFO[r].label} {...rest} />;
}

export function DevCard({ d, ...rest }: { d: Dev } & Omit<Parameters<typeof CardFace>[0], 'art'>) {
  return <CardFace art={devArt(d)} title={rest.title ?? DEV_INFO[d].label} {...rest} />;
}

/** The back of a card: dark wood, a gold border and the island's mark. */
export function CardBack({ size = 'md', n, className }: { size?: CardSize; n?: number; className?: string }) {
  return (
    <div
      className={cn(
        'relative shrink-0 border-2 border-[#C99A42] bg-[radial-gradient(circle_at_50%_45%,#7A4C2A,#4A2C16_70%,#2E1A0C)] shadow-[0_10px_18px_-8px_rgba(0,0,0,0.75),inset_0_0_0_3px_#3A2312,inset_0_0_0_4px_rgba(232,184,74,0.5)]',
        CARD[size],
        className,
      )}
    >
      <span className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 40 46" className="w-[46%] text-[#E8B84A]" aria-hidden>
          <path d="M20 1 39 12v22L20 45 1 34V12z" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <path d="M20 10 31 16.5v13L20 36 9 29.5v-13z" fill="currentColor" opacity="0.35" />
        </svg>
      </span>
      {n != null ? <Coin n={n} size={size === 'sm' || size === 'xs' ? 'sm' : 'md'} /> : null}
    </div>
  );
}

/**
 * What something costs: a tiny card for each one it takes. Cards I'm short
 * of are faded with a red edge, so it's plain what's missing.
 */
export function CostChips({ cost, missing, size = 'xs' }: { cost: Partial<Hand>; missing?: Partial<Hand>; size?: 'xs' | 'sm' }) {
  return (
    <span className="flex items-center gap-[3px]">
      {RESOURCES.flatMap((r) => {
        const need = cost[r] ?? 0;
        const short = missing?.[r] ?? 0;
        return Array.from({ length: need }, (_, i) => {
          const lacking = i >= need - short;
          return (
            <span
              key={`${r}${i}`}
              title={`${RES_INFO[r].label}${lacking ? ' (missing)' : ''}`}
              className={cn(
                'relative overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.5)]',
                size === 'xs' ? 'h-[27px] w-[18px] rounded-[3px]' : 'h-[36px] w-[24px] rounded-[4px]',
                lacking ? 'opacity-45 ring-2 ring-[#E2553B]' : 'ring-1 ring-[#F1DDAE]/80',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resArt(r)} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
            </span>
          );
        });
      })}
    </span>
  );
}

export function GoldButton({ children, onClick, disabled, className, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; className?: string; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'flex items-center justify-center gap-2 rounded-[10px] border-2 border-[#FFF6E0] bg-gradient-to-b from-[#F6CF62] to-[#C88E1E] px-5 py-2.5 font-serif text-[15px] font-bold text-[#3B2A1E] shadow-[0_6px_14px_-6px_rgba(0,0,0,0.6)] transition hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function PlainButton({ children, onClick, disabled, className }: { children: ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center gap-2 rounded-[10px] border-2 border-[#8A5E36] px-4 py-2 font-serif text-[14px] font-bold text-[#5A3A22] transition hover:bg-[#8A5E36]/10 active:scale-95 disabled:opacity-35',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A round wooden button for the top bar. */
export function RoundButton({ label, onClick, children, active }: { label: string; onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn('flex h-10 w-10 items-center justify-center rounded-full text-[#FBEFD5] transition hover:brightness-125 active:scale-95', WOOD, active && 'ring-2 ring-[#E8B84A]')}
    >
      {children}
    </button>
  );
}

/** A parchment panel over the board, with a dimmed table behind it. */
export function Panel({ title, children, onClose, width = 460, z = 'z-30' }: { title: ReactNode; children: ReactNode; onClose?: () => void; width?: number; z?: string }) {
  return (
    <div className={cn('absolute inset-0 flex items-center justify-center bg-[#140C05]/45 p-4 animate-[isle-fade_0.2s_ease-out]', z)}>
      <div className={cn('relative max-h-full overflow-auto rounded-[16px] p-5 animate-[isle-rise-in_0.25s_ease-out]', PARCHMENT)} style={{ width }}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-serif text-[22px] font-bold">{title}</h2>
          {onClose ? (
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-black/5">
              <X size={20} />
            </button>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}

/** A player's medallion: their colour inside a gold rim, their initial (or a robot for a bot). */
export function Avatar({ s, size = 40 }: { s: Pick<SeatView, 'color' | 'bot' | 'real'>; size?: number }) {
  return (
    <span className="shrink-0 rounded-full bg-gradient-to-b from-[#F6DE9C] via-[#C99A42] to-[#8A6420] p-[2px] shadow-[0_3px_6px_rgba(0,0,0,0.5)]">
      <span
        className="flex items-center justify-center rounded-full font-serif font-bold shadow-[inset_0_2px_3px_rgba(255,255,255,0.35),inset_0_-3px_5px_rgba(0,0,0,0.3)]"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.42,
          background: `radial-gradient(circle at 35% 30%, ${s.color}, ${s.color} 45%, #00000055)`,
          color: s.color === '#EFE8D8' ? '#3B2A1E' : '#fff',
        }}
      >
        {s.bot ? <Bot size={size * 0.48} /> : s.real.slice(0, 1).toUpperCase()}
      </span>
    </span>
  );
}

/** Points on a small gold shield. */
export function PointsShield({ n, size = 'md' }: { n: number; size?: 'sm' | 'md' }) {
  return (
    <span className={cn('relative flex shrink-0 flex-col items-center justify-center', size === 'sm' ? 'h-9 w-8' : 'h-11 w-10')} title={`${n} points`}>
      <span className="absolute inset-0 bg-gradient-to-b from-[#F6DE9C] via-[#D9A846] to-[#9A6E22] [clip-path:polygon(0_0,100%_0,100%_62%,50%_100%,0_62%)]" />
      <span className="absolute inset-[2px] bg-gradient-to-b from-[#4A2E18] to-[#2E1C0E] [clip-path:polygon(0_0,100%_0,100%_62%,50%_100%,0_62%)]" />
      <span className={cn('relative -mt-1 font-serif font-bold leading-none text-[#F4D27A]', size === 'sm' ? 'text-[16px]' : 'text-[20px]')}>{n}</span>
    </span>
  );
}

/** The table's keyframes, once. */
export function IsleKeyframes() {
  return (
    <style>{`
      @keyframes isle-fade { from { opacity: 0 } to { opacity: 1 } }
      @keyframes isle-rise-in { from { opacity: 0; transform: translateY(12px) scale(0.97) } to { opacity: 1; transform: none } }
      @keyframes isle-pop { 0% { transform: translateY(0) scale(1) } 35% { transform: translateY(-14px) scale(1.08) } 100% { transform: translateY(0) scale(1) } }
      @keyframes isle-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(246,207,98,0), 0 10px 20px -8px rgba(0,0,0,0.7) } 50% { box-shadow: 0 0 0 10px rgba(246,207,98,0.32), 0 10px 20px -8px rgba(0,0,0,0.7) } }
      @keyframes isle-banner { 0% { opacity: 0; transform: translate(-50%, -16px) scale(0.96) } 12% { opacity: 1; transform: translate(-50%, 0) scale(1) } 85% { opacity: 1; transform: translate(-50%, 0) } 100% { opacity: 0; transform: translate(-50%, -8px) } }
      @keyframes isle-toast { 0% { opacity: 0; transform: translateX(24px) } 8% { opacity: 1; transform: none } 88% { opacity: 1 } 100% { opacity: 0; transform: translateY(-6px) } }
      @keyframes isle-tumble { 0% { transform: translate(-60px, -40px) rotate(-200deg) } 55% { transform: translate(0, -18px) rotate(40deg) } 75% { transform: translate(0, 0) rotate(-8deg) } 88% { transform: translate(0, -5px) rotate(3deg) } 100% { transform: none } }
      @keyframes isle-shake { 0%,100% { transform: none } 25% { transform: translateX(-4px) } 75% { transform: translateX(4px) } }
    `}</style>
  );
}

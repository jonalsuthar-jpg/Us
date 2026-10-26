/**
 * Colouring pages: line art drawn over the ink (so colouring in never hides
 * the lines), as SVG path strings in board units. Both apps stroke them the
 * same way: PAGE_INK, PAGE_LINE wide, round caps.
 */
import { BOARD_H, BOARD_W } from './strokes';

export const PAGE_INK = '#2A2230';
export const PAGE_LINE = 14;

export interface ColouringPage {
  id: string;
  name: string;
  paths: string[];
}

const cx = BOARD_W / 2;
const r = (n: number) => Math.round(n * 10) / 10;

function circle(x: number, y: number, rad: number) {
  return `M${r(x - rad)} ${r(y)}A${rad} ${rad} 0 1 0 ${r(x + rad)} ${r(y)}A${rad} ${rad} 0 1 0 ${r(x - rad)} ${r(y)}Z`;
}

/** A petal from the centre outwards at `angle`, between radii a and b. */
function petal(x: number, y: number, angle: number, a: number, b: number, width: number) {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const px = (d: number, s: number) => r(x + ca * d - sa * s);
  const py = (d: number, s: number) => r(y + sa * d + ca * s);
  const mid = (a + b) / 2;
  return `M${px(a, 0)} ${py(a, 0)}Q${px(mid, width)} ${py(mid, width)} ${px(b, 0)} ${py(b, 0)}Q${px(mid, -width)} ${py(mid, -width)} ${px(a, 0)} ${py(a, 0)}Z`;
}

function ring(x: number, y: number, count: number, a: number, b: number, width: number, offset = 0) {
  return Array.from({ length: count }, (_, i) => petal(x, y, offset + (i / count) * Math.PI * 2, a, b, width));
}

function dots(x: number, y: number, count: number, at: number, size: number, offset = 0) {
  return Array.from({ length: count }, (_, i) => {
    const t = offset + (i / count) * Math.PI * 2;
    return circle(x + Math.cos(t) * at, y + Math.sin(t) * at, size);
  });
}

function mandala(): string[] {
  const y = BOARD_H / 2;
  return [
    circle(cx, y, 120),
    ...ring(cx, y, 8, 140, 420, 120),
    circle(cx, y, 470),
    ...ring(cx, y, 16, 480, 820, 110, Math.PI / 16),
    ...dots(cx, y, 16, 900, 40),
    circle(cx, y, 980),
    ...ring(cx, y, 24, 990, 1300, 80),
    ...dots(cx, y, 24, 1360, 28, Math.PI / 24),
  ];
}

function rangoli(): string[] {
  const y = BOARD_H / 2;
  const diamond = (s: number) => `M${cx} ${y - s}L${cx + s} ${y}L${cx} ${y + s}L${cx - s} ${y}Z`;
  const lamps = Array.from({ length: 4 }, (_, i) => {
    const t = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const lx = cx + Math.cos(t) * 1150;
    const ly = y + Math.sin(t) * 1150;
    return `M${r(lx - 130)} ${r(ly)}Q${r(lx)} ${r(ly + 150)} ${r(lx + 130)} ${r(ly)}Z` + petal(lx, ly - 10, -Math.PI / 2, 0, 170, 55);
  });
  return [
    diamond(1250),
    diamond(950),
    circle(cx, y, 700),
    ...ring(cx, y, 12, 260, 650, 150),
    circle(cx, y, 230),
    ...ring(cx, y, 6, 40, 220, 70, Math.PI / 6),
    ...dots(cx, y, 12, 820, 45, Math.PI / 12),
    ...lamps,
  ];
}

/** Two of us under a sun, holding hands, a heart between. */
function couple(): string[] {
  const s = (d: string) => d.replace(/-?\d+(\.\d+)?/g, (n) => String(Math.round(Number(n) * 10)));
  return [
    circle(2360, 720, 300),
    s('M236 26V36M236 108V118M190 72H200M272 72H282M203 39L210 46M262 98L269 105M269 39L262 46M210 98L203 105'),
    s('M0 330Q70 280 150 312T300 302'),
    circle(1120, 1940, 220),
    s('M112 216V272M112 272L94 310M112 272L130 310M112 236L88 258M112 236L150 250'),
    s('M98 216Q112 300 74 300H150Q112 300 126 216'),
    circle(1880, 1940, 220),
    s('M188 216V272M188 272L172 310M188 272L204 310M188 236L212 258M188 236L150 250'),
    s('M150 172C128 156 120 140 132 130C140 124 148 128 150 136C152 128 160 124 168 130C180 140 172 156 150 172Z'),
    s('M40 90Q55 70 75 85Q90 65 110 80Q125 95 110 105H45Q30 100 40 90Z'),
    s('M30 360Q40 340 50 360M60 372Q70 352 80 372M230 362Q240 342 250 362M262 374Q272 354 282 374'),
  ];
}

export const COLOURING_PAGES: ColouringPage[] = [
  { id: 'mandala', name: 'Mandala', paths: mandala() },
  { id: 'rangoli', name: 'Rangoli', paths: rangoli() },
  { id: 'couple', name: 'The two of us', paths: couple() },
];

export const pageById = (id: string) => COLOURING_PAGES.find((p) => p.id === id) ?? null;

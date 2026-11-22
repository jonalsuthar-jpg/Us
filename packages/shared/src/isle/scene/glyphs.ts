import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Numbers for the board drawn as rounded strokes, so they work on phones
 * (there's no canvas there to draw text into a texture) and stay sharp up
 * close. Each glyph is a few strokes on a box 0.6 wide and 1 tall; a stroke
 * is a run of points, drawn as thin bars with round joints.
 */

type Pt = [number, number];
type Stroke = Pt[];

function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number, n = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

const GLYPHS: Record<string, Stroke[]> = {
  '0': [arc(0.3, 0.5, 0.26, 0.48, 0, 360, 20)],
  '1': [[[0.12, 0.78], [0.34, 0.98], [0.34, 0.02]], [[0.12, 0.02], [0.54, 0.02]]],
  '2': [[...arc(0.3, 0.72, 0.25, 0.26, 160, -20, 10), [0.06, 0.03], [0.56, 0.03]]],
  '3': [arc(0.29, 0.75, 0.23, 0.23, 150, -90, 10), arc(0.29, 0.27, 0.27, 0.25, 90, -150, 12)],
  '4': [[[0.44, 0.02], [0.44, 0.98], [0.04, 0.32], [0.58, 0.32]]],
  '5': [[[0.54, 0.97], [0.12, 0.97], [0.08, 0.56], ...arc(0.3, 0.33, 0.26, 0.31, 120, -150, 12)]],
  '6': [[...arc(0.3, 0.5, 0.26, 0.48, 60, 180, 8), ...arc(0.3, 0.3, 0.26, 0.28, 180, 540, 18)]],
  '8': [arc(0.3, 0.76, 0.21, 0.22, 0, 360, 16), arc(0.3, 0.27, 0.26, 0.26, 0, 360, 18)],
  '9': [[...arc(0.3, 0.7, 0.26, 0.28, 0, 360, 18), ...arc(0.3, 0.5, 0.26, 0.48, 0, -120, 8)]],
  ':': [[[0.3, 0.72], [0.3, 0.73]], [[0.3, 0.27], [0.3, 0.28]]],
};

const ADVANCE: Record<string, number> = { ':': 0.45, '1': 0.6 };

/**
 * A string of glyphs lying flat (facing up), centred on the origin, `size`
 * tall, its top towards -z so it reads from the south. Stroke width is a
 * share of the size.
 */
export function textGeometry(text: string, size: number, width = 0.13, depth = 0.02): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const w = width * size;
  let x = 0;
  const glyphs = [...text];
  const total = glyphs.reduce((n, ch) => n + (ADVANCE[ch] ?? 0.72), 0) - 0.12;
  for (const ch of glyphs) {
    const strokes = GLYPHS[ch];
    const adv = ADVANCE[ch] ?? 0.72;
    const shift = ch === ':' ? -0.08 : 0;
    for (const stroke of strokes ?? []) {
      const pts = stroke.map(([gx, gy]) => new THREE.Vector2((x + shift + gx - total / 2) * size, (0.5 - gy) * size));
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const joint = new THREE.CylinderGeometry(w / 2, w / 2, depth, 10);
        joint.translate(a.x, depth / 2, a.y);
        parts.push(joint.toNonIndexed());
        const b = pts[i + 1];
        if (!b) continue;
        const len = a.distanceTo(b);
        if (len < 1e-4) continue;
        const bar = new THREE.BoxGeometry(len, depth, w);
        bar.rotateY(-Math.atan2(b.y - a.y, b.x - a.x));
        bar.translate((a.x + b.x) / 2, depth / 2, (a.y + b.y) / 2);
        parts.push(bar.toNonIndexed());
      }
    }
    x += adv;
  }
  const out = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return out;
}

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { walletRef } from '../../api/wallet';
import { BALL_S, cricketShot } from '../fun';
import { PITCH } from '../village';
import { colour, funSphere, Near } from './fun-models';
import type { FunHost } from './fun';

/**
 * Park cricket for two: one picks up the bat and stands at the crease, the
 * other bowls from the far end. The ball takes the same path on both phones
 * (from when it was bowled); the batter taps "Hit!" as it arrives, and the
 * timing makes it a six, a four, a couple, a single, or bowled.
 */

const KEY = 'cricket';
export const BAT = 'cricket_bat';
export const BALL = 'cricket_ball';

interface Innings {
  batter: string;
  runs: number;
  balls: number;
  best: number;
  /** A ball on its way (when it was bowled), or none. */
  ball: string | null;
  /** The last ball's result (shown a moment, and the ball flying off). */
  last: { runs: number; out: boolean; at: string } | null;
}

interface Ctx {
  h: FunHost;
  raw: (k: string) => Record<string, unknown> | null;
  set: (k: string, v: Record<string, unknown> | null) => void;
  partnerHere: () => boolean;
}

const near = (a: THREE.Vector3, x: number, z: number, r: number) => Math.hypot(a.x - x, a.z - z) < r;
const atCrease = (p: { x: number; z: number }) => Math.hypot(p.x - PITCH.x, p.z - PITCH.bat) < 1.6;
const atEnd = (p: { x: number; z: number }) => Math.hypot(p.x - PITCH.x, p.z - PITCH.bowl) < 2;

/** The ball, t seconds after it was bowled: from the bowler's hand, one bounce, to the bat. */
export function ballAt(t: number): [number, number, number] {
  const k = Math.min(1, Math.max(0, t / BALL_S));
  const z = PITCH.bowl - 0.6 + (PITCH.bat + 0.35 - (PITCH.bowl - 0.6)) * k;
  // Down to a bounce two-thirds of the way, then up to the bat.
  const y = k < 0.66 ? 2.0 - (2.0 - 0.05) * (k / 0.66) ** 2 : 0.05 + Math.sin(((k - 0.66) / 0.34) * Math.PI * 0.5) * 0.85;
  return [PITCH.x + 0.1, y, z];
}

export function useCricket({ h, raw, set, partnerHere }: Ctx) {
  const { meId, partnerId, partnerName } = h;
  const st = useRef({ told: '' }).current;

  const read = (): Innings | null => {
    const v = raw(KEY);
    if (!v || typeof v.batter !== 'string') return null;
    return {
      batter: v.batter,
      runs: Number(v.runs) || 0,
      balls: Number(v.balls) || 0,
      best: Number(v.best) || 0,
      ball: typeof v.ball === 'string' ? v.ball : null,
      last: v.last && typeof v.last === 'object' ? (v.last as Innings['last']) : null,
    };
  };
  const flying = (g: Innings | null) => (g?.ball ? (Date.now() - Date.parse(g.ball)) / 1000 : null);

  /** The ball's result, decided on the batter's phone. */
  function result(g: Innings, err: number) {
    const shot = cricketShot(err);
    const at = new Date().toISOString();
    const runs = shot.out ? 0 : g.runs + shot.runs;
    const next: Innings = { ...g, ball: null, balls: shot.out ? 0 : g.balls + 1, runs, best: Math.max(g.best, g.runs + shot.runs), last: { ...shot, at } };
    set(KEY, next as unknown as Record<string, unknown>);
    if (shot.out) {
      h.sound?.play('pop', 0.6);
      h.moment(`out:${at}`, `Bowled! ${g.runs} ${g.runs === 1 ? 'run' : 'runs'} 🏏`, false);
      if (g.runs > 0) h.wallet?.earn('game', walletRef('cricket', g.batter, at));
    } else {
      h.sound?.play('splash', 0.25);
      h.say(shot.runs === 6 ? 'SIX! 🏏' : shot.runs === 4 ? 'FOUR! 🏏' : `${shot.runs} ${shot.runs === 1 ? 'run' : 'runs'}`);
      if (shot.runs === 6) h.moment(`six:${at}`, 'A six! 🏏');
    }
  }

  function focus(): { label: string; run: () => void } | null {
    const me = h.me;
    const g = read();
    const t = flying(g);
    // Batting: wait for it, then hit.
    if (me.hold?.key === BAT && atCrease(me.pos)) {
      if (g && t !== null && g.batter === meId) {
        if (t < BALL_S - 0.45) return { label: 'Wait for it…', run: () => {} };
        return {
          label: 'Hit!',
          run: () => {
            h.emote('feed');
            result(g, t - BALL_S);
          },
        };
      }
      return null;
    }
    // Bowling, to my partner at the crease with the bat.
    if (me.hold?.key === BALL && atEnd(me.pos)) {
      const p = h.them.pose;
      if (!partnerHere() || !p || p.hk !== BAT || !atCrease(p)) return { label: `${partnerName} bats: bat at the far stumps`, run: () => h.say(`${partnerName} picks up the bat and stands at the stumps`) };
      if (t !== null) return { label: 'Bowling…', run: () => {} };
      return {
        label: `Bowl to ${partnerName}`,
        run: () => {
          me.heading = Math.PI;
          h.emote('wave');
          const cur = g && g.batter === partnerId ? g : { batter: partnerId, runs: 0, balls: 0, best: g?.batter === partnerId ? g.best : 0, last: null };
          set(KEY, { ...cur, ball: new Date().toISOString() } as unknown as Record<string, unknown>);
        },
      };
    }
    return null;
  }

  function frame(): { banner?: string } {
    const g = read();
    if (!g) return {};
    const t = flying(g);
    // Not hit in time: bowled (the batter's phone says so; the bowler's, if the batter's gone).
    if (t !== null && t > BALL_S + 0.2 && st.told !== g.ball) {
      if (g.batter === meId) {
        st.told = g.ball!;
        result(g, t - BALL_S);
      } else if (t > BALL_S + 3) {
        st.told = g.ball!;
        set(KEY, { ...g, ball: null } as unknown as Record<string, unknown>);
      }
    }
    if (!near(h.me.pos, PITCH.x, (PITCH.bat + PITCH.bowl) / 2, 14)) return {};
    const who = g.batter === meId ? 'You' : partnerName;
    return { banner: `🏏 ${who}: ${g.runs} ${g.runs === 1 ? 'run' : 'runs'} · ${g.balls} ${g.balls === 1 ? 'ball' : 'balls'}${g.best ? ` · best ${g.best}` : ''}` };
  }

  const scene = (
    <Near near={h.me.pos} x={PITCH.x} z={(PITCH.bat + PITCH.bowl) / 2} r={45}>
      <Pitch read={read} />
    </Near>
  );

  return { focus, frame, scene };
}

const box = new THREE.BoxGeometry(1, 1, 1);

/** The stumps (they fall when bowled), the crease, and the ball: bowled, or hit away. */
function Pitch({ read }: { read: () => Innings | null }) {
  const stumps = useRef<THREE.Group>(null);
  const ball = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const g = read();
    const b = ball.current;
    if (!b) return;
    const t = g?.ball ? (Date.now() - Date.parse(g.ball)) / 1000 : null;
    const since = g?.last ? (Date.now() - Date.parse(g.last.at)) / 1000 : Infinity;
    if (stumps.current) stumps.current.rotation.x = g?.last?.out && since < 4 ? -1.2 : 0;
    if (t !== null && t <= BALL_S + 0.4) {
      b.visible = true;
      b.position.set(...ballAt(t));
    } else if (g?.last && !g.last.out && since < 2.5) {
      // Hit away: higher and further for the bigger shots.
      b.visible = true;
      const k = since / 2.5;
      const far = g.last.runs * 6;
      b.position.set(PITCH.x + Math.sin(g.last.runs) * far * k, 0.9 + Math.sin(k * Math.PI) * g.last.runs * 1.6, PITCH.bat + 0.35 + far * k);
    } else b.visible = false;
  });
  const wood = colour('#E9D8B8');
  return (
    <group>
      <group ref={stumps} position={[PITCH.x, 0, PITCH.stumps]}>
        {[-0.11, 0, 0.11].map((x) => (
          <mesh key={x} geometry={box} material={wood} position={[x, 0.36, 0]} scale={[0.035, 0.72, 0.035]} />
        ))}
        <mesh geometry={box} material={wood} position={[0, 0.73, 0]} scale={[0.26, 0.02, 0.03]} />
      </group>
      <mesh geometry={box} material={colour('#F4F1EA')} position={[PITCH.x, 0.01, PITCH.bat - 0.2]} scale={[1.4, 0.01, 0.05]} />
      <mesh geometry={box} material={colour('#C9B98F')} position={[PITCH.x, 0.005, (PITCH.stumps + PITCH.bowl) / 2]} scale={[1.6, 0.01, PITCH.bowl - PITCH.stumps + 1]} />
      <mesh ref={ball} geometry={funSphere} material={colour('#B22222')} scale={0.045} visible={false} />
    </group>
  );
}

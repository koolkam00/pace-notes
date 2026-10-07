/**
 * A stylised running gait for the geometric runner illustrations.
 *
 * Angles are degrees from straight down; positive values swing forward (+x).
 * The cycle t ∈ [0, 1) is one full stride (two steps) starting at foot strike
 * of the near leg. Keyframes approximate published sagittal-plane running
 * kinematics closely enough to read as a relaxed distance-running stride.
 */

type Key = readonly [number, number];

function periodic(keys: readonly Key[]) {
  const n = keys.length;
  const at = (j: number): Key => {
    const m = ((j % n) + n) % n;
    const wrap = Math.floor(j / n);
    return [keys[m][0] + wrap, keys[m][1]];
  };
  return (raw: number) => {
    const t = ((raw % 1) + 1) % 1;
    let i = 0;
    while (i < n - 1 && keys[i + 1][0] <= t) i += 1;
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const span = p2[0] - p1[0];
    const u = (t - p1[0]) / span;
    const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0])) * span;
    const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0])) * span;
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[1] + (u3 - u2) * m2;
  };
}

const HIP = periodic([[0, 24], [0.18, 6], [0.4, -22], [0.62, 14], [0.82, 36], [0.92, 30]]);
const KNEE = periodic([[0, 14], [0.14, 38], [0.4, 16], [0.6, 112], [0.8, 70], [0.93, 22]]);
const SHOULDER = periodic([[0, -30], [0.25, 0], [0.5, 32], [0.75, 0]]);
const ELBOW = periodic([[0, 70], [0.25, 88], [0.5, 104], [0.75, 88]]);
const BOUNCE = periodic([[0, 1.5], [0.15, 3.2], [0.4, -1.5], [0.5, 1.5], [0.65, 3.2], [0.9, -1.5]]);

export type Point = [number, number];

export interface RunnerPose {
  hip: Point;
  shoulder: Point;
  head: Point;
  nearLeg: Point[];
  farLeg: Point[];
  nearArm: Point[];
  farArm: Point[];
  nearShorts: Point[];
  farShorts: Point[];
  bib: { x: number; y: number; angle: number };
  shadow: number;
}

function step([x, y]: Point, angle: number, length: number): Point {
  const r = (angle * Math.PI) / 180;
  return [x + length * Math.sin(r), y + length * Math.cos(r)];
}

/**
 * Joint positions in a 100 × 110 viewBox. `effort` (0..1) adds lean and a
 * shorter, heavier stride for runners who are struggling late in a race.
 */
export function runnerPose(t: number, effort = 0): RunnerPose {
  const lean = 12 + effort * 8;
  const stride = 1 - effort * 0.35;
  const bounce = BOUNCE(t) * (1 - effort * 0.5);
  const hip: Point = [46, 56 + bounce + effort * 2];
  const shoulder = step(hip, 180 - lean, 28);
  const head = step(shoulder, 180 - lean + 6, 12);
  const leg = (p: number) => {
    const thigh = HIP(p) * stride + effort * 4;
    const knee = thigh - KNEE(p) * (0.75 + 0.25 * stride);
    const k = step(hip, thigh, 21);
    const a = step(k, knee, 21);
    const toe = step(a, knee + 100, 7);
    return { points: [hip, k, a, toe], thigh };
  };
  const arm = (p: number) => {
    const upper = SHOULDER(p) * stride - effort * 6;
    const fore = upper + ELBOW(p) - effort * 10;
    const e = step(shoulder, upper, 14);
    const h = step(e, fore, 13);
    return [shoulder, e, h];
  };
  const near = leg(t);
  const far = leg(t + 0.5);
  const mid: Point = [(hip[0] + shoulder[0]) / 2, (hip[1] + shoulder[1]) / 2];
  return {
    hip,
    shoulder,
    head,
    nearLeg: near.points,
    farLeg: far.points,
    nearArm: arm(t + 0.5),
    farArm: arm(t),
    nearShorts: [hip, step(hip, near.thigh, 7.5)],
    farShorts: [hip, step(hip, far.thigh, 7.5)],
    bib: { x: mid[0], y: mid[1], angle: lean },
    shadow: 16 - bounce,
  };
}

export function polyline(points: Point[]): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
}

/** Strides per second for a given running speed (m/s), roughly matching observed distance-running cadence. */
export function strideRate(metresPerSecond: number): number {
  const stepsPerMinute = Math.max(150, Math.min(195, 140 + metresPerSecond * 12));
  return stepsPerMinute / 120;
}

export const SKIN_TONES = ['#2B1D14', '#5A3825', '#8D5524', '#C68642', '#E0AC69', '#F1C27D'] as const;
export const KIT_COLOURS = ['#FF5B2E', '#2F5BFF', '#F4B23E', '#17A673', '#E2416B', '#7A4DFF', '#0FA3A3'] as const;

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * (1 - amount))));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

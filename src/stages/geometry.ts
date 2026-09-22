/**
 * 自然物の形（円柱・傾いた板・丸い塊）の計算。
 * 描画・物理のモジュールに依存しない（検算スクリプトとゲーム本体の両方から同じ計算を使うため）。
 */
import type { BeamDef, ClumpDef, CylinderDef, SolidDef } from './stageTypes.ts';

export type Vec3 = [number, number, number];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => scale(a, 1 / len(a));
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** 傾いた板（枝・倒木）の姿勢 */
export interface BeamFrame {
  /** 箱の中心 */
  center: Vec3;
  /** 箱の軸：x = 幅方向（水平）、y = 厚み方向（上）、z = 長さ方向（p1 → p2） */
  axisX: Vec3;
  axisY: Vec3;
  axisZ: Vec3;
  /** 各軸の半分の長さ */
  half: Vec3;
  /** 水平からの傾き [度] */
  slopeDeg: number;
}

/**
 * 傾いた板：p1・p2 は「上面の中心線」の両端。
 * 上面が p1 → p2 の線に乗るよう、箱の中心は厚みの半分だけ下（箱の上方向の逆）にずらす。
 */
export function beamFrame(b: BeamDef): BeamFrame {
  const axisZ = norm(sub(b.p2, b.p1));
  const axisX = norm(cross([0, 1, 0], axisZ));
  const axisY = cross(axisZ, axisX);
  const mid = scale(add(b.p1, b.p2), 0.5);
  const center = sub(mid, scale(axisY, b.thickness / 2));
  const length = len(sub(b.p2, b.p1));
  const horizontal = Math.hypot(b.p2[0] - b.p1[0], b.p2[2] - b.p1[2]);
  return {
    center,
    axisX,
    axisY,
    axisZ,
    half: [b.width / 2, b.thickness / 2, length / 2],
    slopeDeg: (Math.atan2(Math.abs(b.p2[1] - b.p1[1]), horizontal) * 180) / Math.PI,
  };
}

/** 傾いた板の8つの角 */
export function beamCorners(b: BeamDef): Vec3[] {
  const f = beamFrame(b);
  const out: Vec3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    out.push(add(add(add(f.center, scale(f.axisX, sx * f.half[0])), scale(f.axisY, sy * f.half[1])), scale(f.axisZ, sz * f.half[2])));
  }
  return out;
}

/** 名前から決まる疑似乱数（毎回同じ形にするため） */
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** 丸い塊の角の数（周方向） */
const CLUMP_SEGMENTS = 8;

/**
 * 丸い塊（葉の塊・岩）の頂点。この点の凸包を、見た目と当たり判定の両方に使う（ずれない）。
 * - 上の輪：高さ y + ry、半径 R × topRatio（平らな上面＝乗れる所）
 * - 中の輪：高さ y、半径 R（名前から決まる ±8% のでこぼこ）
 * - 下の輪：高さ y − ry、半径 R × bottomRatio
 */
export function clumpPoints(c: ClumpDef): Vec3[] {
  const rand = seededRandom(c.name);
  const pts: Vec3[] = [];
  const top = c.topRatio ?? 0.6;
  const bottom = c.bottomRatio ?? 0.5;
  for (let i = 0; i < CLUMP_SEGMENTS; i++) {
    const a = (i / CLUMP_SEGMENTS) * Math.PI * 2;
    const am = a + Math.PI / CLUMP_SEGMENTS; // 中の輪は半分ずらして自然に見せる
    const jitter = 0.92 + rand() * 0.16;
    pts.push([c.x + Math.cos(a) * c.r * top, c.y + c.ry, c.z + Math.sin(a) * c.r * top]);
    pts.push([c.x + Math.cos(am) * c.r * jitter, c.y, c.z + Math.sin(am) * c.r * jitter]);
    pts.push([c.x + Math.cos(a) * c.r * bottom, c.y - c.ry, c.z + Math.sin(a) * c.r * bottom]);
  }
  return pts;
}

/** 丸い塊の平らな上面に内接する円の半径（乗れる範囲の目安） */
export function clumpTopRadius(c: ClumpDef): number {
  return c.r * (c.topRatio ?? 0.6) * Math.cos(Math.PI / CLUMP_SEGMENTS);
}

/** 丸い塊の側面（上の輪 → 中の輪）の傾き [度] */
export function clumpSideSlopeDeg(c: ClumpDef): number {
  return (Math.atan2(c.ry, c.r * (1 - (c.topRatio ?? 0.6))) * 180) / Math.PI;
}

export interface Aabb3 {
  minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
}

function aabbOfPoints(pts: Vec3[]): Aabb3 {
  const r: Aabb3 = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const p of pts) {
    r.minX = Math.min(r.minX, p[0]); r.maxX = Math.max(r.maxX, p[0]);
    r.minY = Math.min(r.minY, p[1]); r.maxY = Math.max(r.maxY, p[1]);
    r.minZ = Math.min(r.minZ, p[2]); r.maxZ = Math.max(r.maxZ, p[2]);
  }
  return r;
}

export function cylinderAabb(c: CylinderDef): Aabb3 {
  return { minX: c.x - c.r, maxX: c.x + c.r, minY: c.bottom, maxY: c.top, minZ: c.z - c.r, maxZ: c.z + c.r };
}

/** 形を囲む軸にそろった箱 */
export function solidAabb(s: SolidDef): Aabb3 {
  switch (s.kind) {
    case 'cylinder': return cylinderAabb(s);
    case 'beam': return aabbOfPoints(beamCorners(s));
    case 'clump': return aabbOfPoints(clumpPoints(s));
  }
}

/** 点が形の中（または表面から tol 以内）にあるか（塊は楕円体で近似） */
export function pointInSolid(p: Vec3, s: SolidDef, tol = 0.02): boolean {
  switch (s.kind) {
    case 'cylinder':
      return Math.hypot(p[0] - s.x, p[2] - s.z) <= s.r + tol && p[1] >= s.bottom - tol && p[1] <= s.top + tol;
    case 'clump': {
      const dy = (p[1] - s.y) / (s.ry + tol);
      const dr = Math.hypot(p[0] - s.x, p[2] - s.z) / (s.r + tol);
      return dr * dr + dy * dy <= 1;
    }
    case 'beam': {
      const f = beamFrame(s);
      const d = sub(p, f.center);
      const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      return Math.abs(dot(d, f.axisX)) <= f.half[0] + tol
        && Math.abs(dot(d, f.axisY)) <= f.half[1] + tol
        && Math.abs(dot(d, f.axisZ)) <= f.half[2] + tol;
    }
  }
}

/**
 * 向きのある箱（傾いた板）と、軸にそろった箱が重なるか（分離軸判定）。
 * 軸にそろった箱は、中心と半分の長さで渡す。
 */
export function beamOverlapsBox(b: BeamDef, boxCenter: Vec3, boxHalf: Vec3, margin = 0): boolean {
  const f = beamFrame(b);
  const A: Vec3[] = [f.axisX, f.axisY, f.axisZ];
  const B: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const d = sub(boxCenter, f.center);
  const dot = (a: Vec3, c: Vec3) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
  const axes: Vec3[] = [...A, ...B];
  for (const a of A) for (const c of B) {
    const x = cross(a, c);
    if (len(x) > 1e-9) axes.push(norm(x));
  }
  for (const axis of axes) {
    const ra = A.reduce((s, a, i) => s + Math.abs(dot(a, axis)) * f.half[i], 0);
    const rb = B.reduce((s, c, i) => s + Math.abs(dot(c, axis)) * boxHalf[i], 0);
    if (Math.abs(dot(d, axis)) > ra + rb + margin) return false;
  }
  return true;
}

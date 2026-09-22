/**
 * ステージの寸法・高さ・接地の検算（npm run verify:course）。
 *
 * 全ステージ共通：
 *  1. 地面より下に潜っている箱がないか
 *  2. 宙に浮いている箱がないか（底面が地面 y=0、または他の箱の上面に接し XZ で重なる。
 *     横から支えられる物（枝など）は attachedTo の箱の側面に接していること）
 *  3. 箱同士がめり込んでいないか（接しているのは可）
 *  4. 地面の範囲からはみ出していないか
 *  5. 開始地点で猫が箱と重ならないか（どの向きでも重ならないよう、回転の外接円で判定）
 * 自然物（幹・傾いた枝・丸い塊）：
 *  6. 宙に浮いていないか（地面に着く、または attachedTo の物に刺さる／載る）
 *  7. 地面の範囲・開始地点・歩ける傾き（枝 30° 以下）、軸にそろった箱（塀など）にめり込まないか
 * 検証コース：隙間・トンネル・通路・机・ドアの開閉
 * 森：3つのルート（ツタ／倒木／岩）で、跳ぶ距離と高さが猫のジャンプで届くか、塀に当たらないか、樹冠に頭が当たらないか
 *   （実際に通れるかは、ブラウザでのルート自動テストで確かめる）
 *
 * 登れる面・ゴールの段ボール・ご飯皿も、動かない箱として 1〜5 に含める（当たり判定の無い登れる範囲は除く）。
 */
import { CAT_WIDTH, CAT_HEIGHT, CAT_LENGTH } from '../src/greybox/protoCourseData.ts';
import { PROTO_STAGE } from '../src/greybox/protoStage.ts';
import { FOREST_STAGE } from '../src/stages/forest/forestData.ts';
import { cardboardParts, type BoxDef, type DoorDef, type StageDef, type SolidDef, type ClumpDef, type BeamDef, type CylinderDef } from '../src/stages/stageTypes.ts';
import { solidAabb, pointInSolid, beamFrame, beamCorners, beamOverlapsBox, clumpTopRadius, clumpSideSlopeDeg, type Vec3 } from '../src/stages/geometry.ts';

/** 歩ける枝の傾きの上限 [度]（CatParams の滑り始める角度 30°） */
const MAX_WALK_SLOPE = 30;

const EPS = 1e-6;
/** 猫の能力（CatParams の初期値と同じ） */
const JUMP_HEIGHT = 1.0;
const GRAVITY = 20;
const MOVE_SPEED = 3.0;

interface Aabb {
  minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
}

function aabb(b: BoxDef): Aabb {
  return {
    minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
    minY: b.top - b.h, maxY: b.top,
    minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
  };
}

/** 区間の重なり量（負なら離れている、0 なら接している） */
function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

const fmt = (v: number) => Number(v.toFixed(4)).toString();

const catTurnDiameter = Math.hypot(CAT_WIDTH, CAT_LENGTH);

/** 重なってよい組（埋め込み） */
function allowedOverlap(stage: StageDef, a: string, b: string): boolean {
  return stage.interactables.some((d) => d.kind === 'climbable' && d.embeddedIn
    && ((d.name === a && d.embeddedIn === b) || (d.name === b && d.embeddedIn === a)));
}

/** 箱として検算する物すべて（配置の箱＋登れる面＋段ボール＋ご飯皿） */
function allBoxes(stage: StageDef): BoxDef[] {
  const list: BoxDef[] = [...stage.boxes];
  for (const d of stage.interactables) {
    if (d.kind === 'climbable' && !d.sensor) list.push({ name: d.name, x: d.x, z: d.z, w: d.w, d: d.d, top: d.top, h: d.h, color: 'fence' });
    if (d.kind === 'goal') list.push(...cardboardParts(d));
    if (d.kind === 'dish') list.push({ name: d.name, x: d.x, z: d.z, w: d.radius * 2, d: d.radius * 2, top: d.height, h: d.height, color: 'metal' });
  }
  return list;
}

function verifyStage(stage: StageDef, extra: (ctx: Ctx) => void): boolean {
  const boxes = allBoxes(stage);
  const errors: string[] = [];
  const infos: string[] = [];
  const byName = (n: string): Aabb => {
    const b = boxes.find((o) => o.name === n);
    if (!b) throw new Error(`箱が見つからない: ${n}`);
    return aabb(b);
  };
  const ground = boxes.find((b) => b.isGround);
  if (!ground) throw new Error(`${stage.name}: 地面が無い`);
  const g = aabb(ground);

  // 1〜2. 潜り込み・支持
  for (const b of boxes) {
    if (b.w <= 0 || b.d <= 0 || b.h <= 0) errors.push(`${b.name}: 寸法が0以下`);
    if (b.isGround) continue;
    const a = aabb(b);
    if (a.minY < -EPS) {
      errors.push(`${b.name}: 底面 ${fmt(a.minY)} が地面(0)より下`);
      continue;
    }
    if (b.attachedTo) {
      for (const n of b.attachedTo) {
        const c = byName(n);
        const ox = overlap(a.minX, a.maxX, c.minX, c.maxX);
        const oy = overlap(a.minY, a.maxY, c.minY, c.maxY);
        const oz = overlap(a.minZ, a.maxZ, c.minZ, c.maxZ);
        // ちょうど1軸で接し（重なり 0）、残り2軸で重なっていること
        const touching = [ox, oy, oz].filter((o) => Math.abs(o) < EPS).length === 1
          && [ox, oy, oz].filter((o) => o > EPS).length === 2;
        if (!touching) errors.push(`${b.name}: ${n} の側面に接していない（横からの支持が無い）`);
      }
      infos.push(`${b.name}: ${b.attachedTo.join('・')} から張り出し（底面 ${fmt(a.minY)}）`);
      continue;
    }
    if (Math.abs(a.minY) < EPS) continue; // 地面に接地
    const supporters = boxes.filter((o) => {
      if (o === b) return false;
      const c = aabb(o);
      return Math.abs(c.maxY - a.minY) < EPS
        && overlap(a.minX, a.maxX, c.minX, c.maxX) > EPS
        && overlap(a.minZ, a.maxZ, c.minZ, c.maxZ) > EPS;
    });
    if (supporters.length === 0) errors.push(`${b.name}: 底面 ${fmt(a.minY)} を支える箱がない（宙に浮いている）`);
  }

  // 3. めり込み
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = aabb(boxes[i]);
      const c = aabb(boxes[j]);
      const ox = overlap(a.minX, a.maxX, c.minX, c.maxX);
      const oy = overlap(a.minY, a.maxY, c.minY, c.maxY);
      const oz = overlap(a.minZ, a.maxZ, c.minZ, c.maxZ);
      if (ox > EPS && oy > EPS && oz > EPS && !allowedOverlap(stage, boxes[i].name, boxes[j].name)) {
        errors.push(`${boxes[i].name} と ${boxes[j].name} がめり込んでいる（${fmt(ox)} × ${fmt(oy)} × ${fmt(oz)}）`);
      }
    }
  }

  // 4. 地面の範囲
  for (const b of boxes) {
    const a = aabb(b);
    if (a.minX < g.minX - EPS || a.maxX > g.maxX + EPS || a.minZ < g.minZ - EPS || a.maxZ > g.maxZ + EPS) {
      errors.push(`${b.name}: 地面の範囲からはみ出している`);
    }
  }

  // 5. 開始地点
  const s = stage.start;
  const r = catTurnDiameter / 2;
  for (const b of boxes) {
    if (b.isGround) continue;
    const a = aabb(b);
    if (overlap(a.minX, a.maxX, s.x - r, s.x + r) > EPS
      && overlap(a.minY, a.maxY, s.y, s.y + CAT_HEIGHT) > EPS
      && overlap(a.minZ, a.maxZ, s.z - r, s.z + r) > EPS) {
      errors.push(`開始地点の猫が ${b.name} と重なっている`);
    }
  }

  // 当たり判定の無い登れる範囲（センサー）：丸い幹の表面にかかっていること
  for (const d of stage.interactables) {
    if (d.kind !== 'climbable' || !d.sensor) continue;
    const host = stage.solids?.find((o) => o.name === d.embeddedIn);
    if (!host || host.kind !== 'cylinder') { errors.push(`${d.name}：埋め込み先の幹（円柱）が無い`); continue; }
    // 範囲の手前の面（幹の外側）までの距離が、幹の半径〜半径+3cm にあること
    const dirX = d.x - host.x, dirZ = d.z - host.z;
    const dirLen = Math.hypot(dirX, dirZ);
    const front = dirLen + (Math.abs(dirZ) >= Math.abs(dirX) ? d.d : d.w) / 2;
    const ok = front >= host.r - EPS && front <= host.r + 0.03 && Math.abs(d.top - host.top) < EPS && d.w <= host.r * 2;
    if (!ok) errors.push(`${d.name}：幹の表面にかかっていない（手前の面まで ${fmt(front)}、幹の半径 ${host.r}）`);
    else infos.push(`${d.name}：${host.name} の表面に登れる範囲（手前の面まで ${fmt(front)}、半径 ${host.r}、上端 = 股 ${host.top}）`);
  }

  // 埋め込んだ登れる面：埋め込み先の中に収まり、どれか1面が埋め込み先の表面とそろう（はみ出し・段差なし）
  for (const d of stage.interactables) {
    if (d.kind !== 'climbable' || !d.embeddedIn || d.sensor) continue;
    const a = byName(d.name);
    const h = byName(d.embeddedIn);
    const inside = a.minX >= h.minX - EPS && a.maxX <= h.maxX + EPS && a.minY >= h.minY - EPS
      && a.maxY <= h.maxY + EPS && a.minZ >= h.minZ - EPS && a.maxZ <= h.maxZ + EPS;
    const flush = [a.minX - h.minX, a.maxX - h.maxX, a.minZ - h.minZ, a.maxZ - h.maxZ].some((v) => Math.abs(v) < EPS);
    if (!inside) errors.push(`${d.name}：${d.embeddedIn} からはみ出している（歩くと段差に引っかかる）`);
    else if (!flush) errors.push(`${d.name}：${d.embeddedIn} の表面とそろっていない（爪が届かない）`);
    else infos.push(`${d.name}：${d.embeddedIn} に埋め込み、表面がそろっている（段差なし）`);
  }

  checkSolids(stage, boxes, errors, infos);

  extra({ stage, boxes, byName, errors, infos });

  console.log(`\n=== ${stage.name}（箱 ${boxes.length} 個）===`);
  for (const i of infos) console.log('  ' + i);
  if (errors.length > 0) {
    for (const e of errors) console.error('  ✗ ' + e);
    return false;
  }
  console.log('  ✓ 潜り込み・浮き・めり込み・はみ出しなし');
  return true;
}

/** 自然物（幹・傾いた枝・丸い塊）の共通チェック */
function checkSolids(stage: StageDef, boxes: BoxDef[], errors: string[], infos: string[]): void {
  const solids = stage.solids ?? [];
  if (solids.length === 0) return;
  const find = (n: string): SolidDef | undefined => solids.find((o) => o.name === n);
  const ground = boxes.find((b) => b.isGround)!;
  const g = aabb(ground);

  for (const s of solids) {
    const a = solidAabb(s);
    // 地面の範囲・地面より下
    if (a.minX < g.minX - EPS || a.maxX > g.maxX + EPS || a.minZ < g.minZ - EPS || a.maxZ > g.maxZ + EPS) {
      errors.push(`${s.name}: 地面の範囲からはみ出している`);
    }
    if (a.minY < -0.02) errors.push(`${s.name}: 地面より下に潜っている（最下点 ${fmt(a.minY)}）`);

    // 支え
    const hosts = (s.attachedTo ?? []).map((n) => {
      const h = find(n);
      if (!h) errors.push(`${s.name}: 支えの ${n} が見つからない`);
      return h;
    }).filter((h): h is SolidDef => !!h);
    if (s.kind === 'cylinder') {
      if (Math.abs(s.bottom) > EPS) {
        // 下の幹の上面に載る：自分の中心が下の幹の上面の円の中
        const ok = hosts.some((h) => h.kind === 'cylinder' && Math.abs(h.top - s.bottom) < EPS && Math.hypot(h.x - s.x, h.z - s.z) < h.r);
        if (!ok) errors.push(`${s.name}: 底 ${s.bottom} を支える幹が無い（宙に浮いている）`);
      }
    } else if (s.kind === 'clump') {
      const onGround = Math.abs(s.y - s.ry) < 0.01;
      const held = hosts.some((h) => {
        if (h.kind === 'cylinder') return pointInSolid([h.x, h.top, h.z], s);
        if (h.kind === 'beam') return pointInSolid(h.p1, s) || pointInSolid(h.p2, s);
        return false;
      });
      if (!onGround && !held) errors.push(`${s.name}: 地面にも支えにも着いていない（宙に浮いている）`);
    } else {
      // 傾いた枝：各端が地面に着く（上面の高さ = 厚み程度）か、支えの中にある
      const f = beamFrame(s);
      for (const [label, end] of [['始点', s.p1], ['終点', s.p2]] as Array<[string, Vec3]>) {
        const onGround = end[1] - s.thickness < 0.02;
        const inHost = hosts.some((h) => pointInSolid(end, h, 0.03));
        if (!onGround && !inHost) {
          // 片持ち（片方の端だけ支えられた枝）は、もう片方の端が支えの中にあれば可
          const other = end === s.p1 ? s.p2 : s.p1;
          const otherHeld = hosts.some((h) => pointInSolid(other, h, 0.03));
          if (!otherHeld) errors.push(`${s.name}: ${label}が宙に浮いている`);
        }
      }
      if (f.slopeDeg > MAX_WALK_SLOPE) errors.push(`${s.name}: 傾き ${fmt(f.slopeDeg)}° は歩けない（上限 ${MAX_WALK_SLOPE}°）`);
    }

    // 開始地点の猫と重ならない
    const st = stage.start;
    const r = catTurnDiameter / 2;
    if (overlap(a.minX, a.maxX, st.x - r, st.x + r) > EPS && overlap(a.minY, a.maxY, st.y, st.y + CAT_HEIGHT) > EPS
      && overlap(a.minZ, a.maxZ, st.z - r, st.z + r) > EPS) {
      errors.push(`開始地点の猫が ${s.name} と重なっている`);
    }

    // 軸にそろった箱（塀・壁など）にめり込まない
    for (const b of boxes) {
      if (b.isGround) continue;
      const bb = aabb(b);
      let hit: boolean;
      if (s.kind === 'beam') {
        hit = beamOverlapsBox(s, [b.x, b.top - b.h / 2, b.z], [b.w / 2, b.h / 2, b.d / 2]);
      } else {
        hit = overlap(a.minX, a.maxX, bb.minX, bb.maxX) > EPS && overlap(a.minY, a.maxY, bb.minY, bb.maxY) > EPS
          && overlap(a.minZ, a.maxZ, bb.minZ, bb.maxZ) > EPS;
      }
      if (hit) errors.push(`${s.name} が ${b.name} にめり込んでいる`);
    }
  }
  infos.push(`自然物 ${solids.length} 個：浮き・はみ出し・塀などへのめり込みなし、枝の傾きは ${MAX_WALK_SLOPE}° 以下`);
}

interface Ctx {
  stage: StageDef;
  boxes: BoxDef[];
  byName: (n: string) => Aabb;
  errors: string[];
  infos: string[];
}

// ---------------------------------------------------------------
// 検証コース固有
// ---------------------------------------------------------------
function protoChecks({ stage, boxes, byName, errors, infos }: Ctx): void {
  const gap1 = byName('隙間塀2').minX - byName('隙間塀1').maxX;
  const gap2 = byName('隙間塀3').minX - byName('隙間塀2').maxX;
  infos.push(`猫：幅 ${fmt(CAT_WIDTH)}、高さ ${fmt(CAT_HEIGHT)}、長さ ${fmt(CAT_LENGTH)}（振り向くのに必要な幅 ${fmt(catTurnDiameter)}）`);
  infos.push(`隙間1：幅 ${fmt(gap1)} → ${gap1 > CAT_WIDTH ? '通れる' : '通れない'}`);
  infos.push(`隙間2：幅 ${fmt(gap2)} → ${gap2 > CAT_WIDTH ? '通れる' : '通れない'}`);
  if (!(gap1 > CAT_WIDTH)) errors.push('隙間1は通れる想定だが猫の幅以下');
  if (!(gap2 < CAT_WIDTH)) errors.push('隙間2は通れない想定だが猫の幅以上');

  const tunnelWidth = byName('トンネル右壁').minX - byName('トンネル左壁').maxX;
  const tunnelHeight = byName('トンネル天井').minY;
  const tunnelPass = tunnelWidth > CAT_WIDTH && tunnelHeight > CAT_HEIGHT;
  infos.push(`トンネル：内寸 幅 ${fmt(tunnelWidth)} × 高さ ${fmt(tunnelHeight)} → ${tunnelPass ? '通れる' : '通れない'}、中で${tunnelWidth > catTurnDiameter ? '振り向ける' : '振り向けない'}`);
  if (!tunnelPass) errors.push('トンネルを猫が通れない');

  const cw = byName('通路東壁').minX - byName('通路西壁').maxX;
  const cw2 = byName('通路北壁').minZ - byName('通路南壁').maxZ;
  infos.push(`L字通路：幅 ${fmt(cw)} / ${fmt(cw2)} → 中で${Math.min(cw, cw2) > catTurnDiameter ? '振り向ける' : '振り向けない'}`);

  const tableUnder = byName('机・天板').minY;
  infos.push(`机：天板の下 ${fmt(tableUnder)} → ${tableUnder > CAT_HEIGHT ? 'くぐれる' : 'くぐれない'}`);

  // ドア：閉 → ±90° の開閉で壁に当たらないか（板の輪郭を細かく分けた点で判定）
  for (const door of stage.interactables.filter((d): d is DoorDef => d.kind === 'door')) {
    const bottom = door.bottomGap;
    const top = door.bottomGap + door.height;
    const corners = (angle: number) => {
      const yaw = door.baseYaw + angle;
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      const pts: Array<[number, number]> = [];
      for (const lx of [0, door.width]) for (const lz of [-door.thickness / 2, door.thickness / 2]) {
        // Y軸回りの回転：x' = x cos + z sin、z' = -x sin + z cos
        pts.push([door.hingeX + lx * c + lz * sn, door.hingeZ - lx * sn + lz * c]);
      }
      return pts;
    };
    const hitsBox = (angle: number): string | null => {
      const cs = corners(angle);
      const order = [0, 1, 3, 2, 0];
      for (let e = 0; e < 4; e++) {
        const [ax, az] = cs[order[e]], [bx, bz] = cs[order[e + 1]];
        for (let t = 0; t <= 1.0001; t += 0.05) {
          const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
          for (const b of boxes) {
            if (b.isGround) continue;
            const a = aabb(b);
            if (px > a.minX + EPS && px < a.maxX - EPS && pz > a.minZ + EPS && pz < a.maxZ - EPS
              && top > a.minY + EPS && bottom < a.maxY - EPS) return b.name;
          }
        }
      }
      return null;
    };
    let blocked: string | null = null;
    for (let deg = -90; deg <= 90; deg += 2) {
      const hit = hitsBox((deg * Math.PI) / 180);
      if (hit) { blocked = `${deg}° で ${hit}`; break; }
    }
    if (blocked) errors.push(`${door.name}：開閉の途中で壁に当たる（${blocked}）`);
    else infos.push(`${door.name}：閉 → ±90° の開閉で壁に当たらない`);
  }
}

// ---------------------------------------------------------------
// 森固有：ルートと近道
// ---------------------------------------------------------------
/** 高さ rise だけ上の足場へ跳び移るとき、空中で進める水平距離（走りながらのジャンプ） */
function jumpReach(rise: number): number {
  const v = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
  // rise + ½gt² − vt = 0 の大きい方の解（上昇して下りてくる途中で rise の高さを通る時刻）
  const disc = v * v - 2 * GRAVITY * rise;
  if (disc < 0) return 0;
  const t = (v + Math.sqrt(disc)) / GRAVITY;
  return MOVE_SPEED * t;
}

/** 丸い塊の、高さ y での横の半径（上の輪・中の輪・下の輪の間を直線でつなぐ） */
function clumpRadiusAt(c: ClumpDef, y: number): number {
  const top = c.r * (c.topRatio ?? 0.6);
  const bottom = c.r * (c.bottomRatio ?? 0.5);
  if (y >= c.y + c.ry) return top;
  if (y <= c.y - c.ry) return bottom;
  if (y >= c.y) return c.r + (top - c.r) * ((y - c.y) / c.ry);
  return c.r + (bottom - c.r) * ((c.y - y) / c.ry);
}

function forestChecks({ stage, byName, errors, infos }: Ctx): void {
  const solids = stage.solids ?? [];
  const get = <K extends SolidDef['kind']>(name: string, kind: K): Extract<SolidDef, { kind: K }> => {
    const s = solids.find((o) => o.name === name);
    if (!s || s.kind !== kind) throw new Error(`${name}（${kind}）が見つからない`);
    return s as Extract<SolidDef, { kind: K }>;
  };
  const fence = byName('板塀');
  /** 跳ぶ：水平の隙間 gap、高さの差 rise（上がる向きが正）。届けば true */
  const jump = (label: string, gap: number, rise: number): void => {
    const reach = jumpReach(rise);
    const ok = rise < JUMP_HEIGHT - 0.1 && reach > gap + 0.25;
    infos.push(`${label}：隙間 ${fmt(gap)}、段差 ${rise >= 0 ? '+' : ''}${fmt(rise)} → 空中で進める距離 ${fmt(reach)} ${ok ? '✓' : '✗'}`);
    if (!ok) errors.push(`${label}：届かない`);
  };
  const horiz = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // ---------------- ルート A：ツタ → ① → ② → ③ → 塀の上の葉 ----------------
  const t1 = get('①の木・幹', 'cylinder');
  const t2 = get('②の木・幹', 'cylinder');
  const t3 = get('③の木・幹', 'cylinder');
  const vine = stage.interactables.find((d) => d.kind === 'climbable');
  if (vine && vine.kind === 'climbable') {
    const nose = stage.start.z - CAT_LENGTH / 2;
    const face = vine.z + vine.d / 2;
    infos.push(`A：スタート → ツタ：鼻先から ${fmt(nose - face)} m（正面）`);
    if (Math.abs(vine.top - t1.top) > EPS) errors.push('ツタの上端が①の股と一致しない');
  }
  const b1 = get('①の枝', 'beam');
  if (Math.abs(b1.p1[1] - t1.top) > EPS) errors.push('①の枝の根元が①の股とそろっていない（段差）');
  jump('A：①の枝先 → ②の股', horiz([b1.p2[0], b1.p2[2]], [t2.x, t2.z]) - t2.r, t2.top - b1.p2[1]);
  const b23 = get('②→③の枝', 'beam');
  if (Math.abs(b23.p1[1] - t2.top) > EPS || Math.abs(b23.p2[1] - t3.top) > EPS) errors.push('②→③の枝の両端が股とそろっていない（段差）');
  const bOver = get('③の張り出し枝', 'beam');
  if (Math.abs(bOver.p1[1] - t3.top) > EPS) errors.push('張り出し枝の根元が③の股とそろっていない');
  const leaf = get('塀の上の葉', 'clump');
  const leafTop = leaf.y + leaf.ry;
  const leafFlat = clumpTopRadius(leaf);
  // 張り出し枝の上を歩くと葉の横腹に当たって止まる。止まった所（猫の頭の高さでの葉の半径）から平らな上面の縁まで跳ぶ
  const stopRadius = clumpRadiusAt(leaf, bOver.p2[1] + CAT_HEIGHT);
  jump('A：張り出し枝 → 塀の上の葉', stopRadius - leafFlat, leafTop - bOver.p2[1]);
  infos.push(`A：塀の上の葉：上面 ${fmt(leafTop)}、平らな所の半径 ${fmt(leafFlat)}（塀の線まで ${fmt(Math.abs(leaf.z - (fence.minZ + fence.maxZ) / 2))}）、下端 ${fmt(leaf.y - leaf.ry)}（塀 ${fmt(fence.maxY)}）、側面の傾き ${fmt(clumpSideSlopeDeg(leaf))}°`);
  if (!(leaf.y - leaf.ry > fence.maxY)) errors.push('塀の上の葉が塀に当たる');
  if (!(Math.abs(leaf.z - (fence.minZ + fence.maxZ) / 2) < leafFlat - 0.2)) errors.push('塀の上の葉の平らな所が塀をまたいでいない');

  // ---------------- ルート B：倒木 → ④の横枝 → 塀を跳び越える ----------------
  const log = get('倒木', 'beam');
  const t4 = get('④の木・幹', 'cylinder');
  const side = get('④の横枝', 'beam');
  infos.push(`B：倒木：下の端の上面 ${fmt(log.p1[1])}（地面から跳び乗る）、傾き ${fmt(beamFrame(log).slopeDeg)}°、上の端 ${fmt(log.p2[1])}`);
  if (!(log.p1[1] < JUMP_HEIGHT - 0.3)) errors.push('倒木の下の端が高すぎる');
  // 横枝の、幹から出た所（幹の中心から半径 + 猫の半幅）
  const sf = beamFrame(side);
  const exitDist = t4.r + CAT_WIDTH / 2;
  const tExit = (() => {
    // 横枝の中心線上で、幹の中心から水平距離 exitDist になる点を探す
    for (let t = 0; t <= 1; t += 0.01) {
      const x = side.p1[0] + (side.p2[0] - side.p1[0]) * t;
      const z = side.p1[2] + (side.p2[2] - side.p1[2]) * t;
      if (Math.hypot(x - t4.x, z - t4.z) >= exitDist) return t;
    }
    return 1;
  })();
  const exit: Vec3 = [
    side.p1[0] + (side.p2[0] - side.p1[0]) * tExit,
    side.p1[1] + (side.p2[1] - side.p1[1]) * tExit,
    side.p1[2] + (side.p2[2] - side.p1[2]) * tExit,
  ];
  // 倒木の上の端に立った猫は幹に当たって止まる（中心は幹から 半径 + 半長）。そこから横枝の出口へ
  const logDir = [log.p2[0] - log.p1[0], log.p2[2] - log.p1[2]];
  const logDirLen = Math.hypot(logDir[0], logDir[1]);
  const catAtLogTop: [number, number] = [log.p2[0] - (logDir[0] / logDirLen) * CAT_LENGTH / 2, log.p2[2] - (logDir[1] / logDirLen) * CAT_LENGTH / 2];
  jump('B：倒木の上 → ④の横枝', Math.max(0, horiz(catAtLogTop, [exit[0], exit[2]]) - CAT_LENGTH / 2), exit[1] - log.p2[1]);
  void sf;
  // 横枝の先から塀を跳び越える：塀の向こう面を越えるときの猫の底の高さ
  const tipToFar = Math.abs(side.p2[2] - fence.minZ);
  const tipToNear = Math.abs(side.p2[2] - fence.maxZ);
  const v = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
  const tFar = tipToFar / MOVE_SPEED;
  const yJump = side.p2[1] + v * tFar - 0.5 * GRAVITY * tFar * tFar;
  const tNear = tipToNear / MOVE_SPEED;
  const yWalk = side.p2[1] - 0.5 * GRAVITY * tNear * tNear;
  infos.push(`B：横枝の先 → 塀：跳ぶと塀の向こう面で底の高さ ${fmt(yJump)}（塀 ${fmt(fence.maxY)}）、跳ばずに落ちると塀の手前で ${fmt(yWalk)}（跳ぶ必要がある）`);
  if (!(yJump > fence.maxY + 0.1)) errors.push('B：横枝の先から塀を跳び越えられない');

  // ---------------- ルート C：岩 → 塀の上 ----------------
  const rocks = ['岩①', '岩②', '岩③'].map((n) => get(n, 'clump'));
  infos.push(`C：地面 → 岩①：上面 ${fmt(rocks[0].y + rocks[0].ry)}`);
  if (!(rocks[0].y + rocks[0].ry < JUMP_HEIGHT - 0.2)) errors.push('岩①が高すぎる');
  for (let i = 0; i + 1 < rocks.length; i++) {
    const a = rocks[i], b = rocks[i + 1];
    jump(`C：${a.name} → ${b.name}`, horiz([a.x, a.z], [b.x, b.z]) - clumpTopRadius(a) - clumpTopRadius(b), b.y + b.ry - (a.y + a.ry));
  }
  const r3 = rocks[2];
  jump('C：岩③ → 塀の上', Math.abs(r3.z - fence.maxZ) - clumpTopRadius(r3), fence.maxY - (r3.y + r3.ry));

  // ---------------- 近道が無いか ----------------
  // 地面から跳んで届く高さ 1.0 より、木の股・枝・葉はすべて高い（ツタ・倒木・岩を使わないと上がれない）
  const lowest = Math.min(t1.top, t2.top, t3.top, side.p1[1], leaf.y - leaf.ry);
  infos.push(`地面から跳んで届く高さ ${JUMP_HEIGHT} < 木の股・枝・葉の最低 ${fmt(lowest)}`);
  if (!(lowest > JUMP_HEIGHT + 0.2)) errors.push('地面から直接、木の上へ跳び乗れてしまう');
  // 岩③（上面 1.7）から届くのは塀だけ（木の足場は遠い）
  const r3Reach: [number, number] = [r3.x, r3.z];
  const nearest = Math.min(...[t1, t2, t3, t4].map((t) => horiz(r3Reach, [t.x, t.z]) - t.r));
  infos.push(`C：岩③から一番近い木まで ${fmt(nearest)} m（届かない）`);
  if (!(nearest > 2.0)) errors.push('岩③から木の足場へ跳び移れてしまう');

  // ---------------- 樹冠に頭が当たらない ----------------
  const canopies = solids.filter((o): o is ClumpDef => o.kind === 'clump' && o.name.includes('樹冠'));
  const canopyBottom = Math.min(...canopies.map((c) => c.y - c.ry));
  const highestPerch = Math.max(t1.top, t2.top, t3.top, side.p2[1], bOver.p2[1]);
  const headMax = highestPerch + JUMP_HEIGHT + CAT_HEIGHT;
  infos.push(`樹冠の下端 ${fmt(canopyBottom)}、木の上から跳んだ頭の最高点 ${fmt(headMax)}`);
  if (!(canopyBottom > headMax)) errors.push('木の上で跳ぶと樹冠に頭が当たる');

  // ---------------- ゴール ----------------
  const goal = stage.interactables.find((d) => d.kind === 'goal');
  if (goal && goal.kind === 'goal') {
    const iw = goal.w - 2 * goal.wall;
    const id = goal.d - 2 * goal.wall;
    infos.push(`ゴール：段ボールの内寸 ${fmt(iw)} × ${fmt(id)}（猫 ${CAT_LENGTH} × ${CAT_WIDTH} が丸まって入る）`);
    if (!(iw > CAT_LENGTH + 0.02 && id > CAT_WIDTH + 0.02)) errors.push('段ボールに猫が入らない');
    if (!(goal.z < fence.minZ)) errors.push('段ボールが塀の向こう側にない');
  }
  void beamCorners;
  void ({} as CylinderDef | BeamDef);
}

const ok = [verifyStage(PROTO_STAGE, protoChecks), verifyStage(FOREST_STAGE, forestChecks)].every(Boolean);
if (!ok) {
  console.error('\n✗ 検算エラーあり');
  process.exit(1);
}
console.log('\n✓ 全ステージ検算OK');

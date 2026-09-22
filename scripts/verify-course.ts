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
 * 検証コース：隙間・トンネル・通路・机・ドアの開閉
 * 森：ルートが成り立つか（ツタ → 股 → 枝 → ジャンプ → 張り出し枝 → 塀の向こう）と、近道ができないか
 *
 * 登れる面・ゴールの段ボール・ご飯皿も、動かない箱として 1〜5 に含める。
 */
import { CAT_WIDTH, CAT_HEIGHT, CAT_LENGTH } from '../src/greybox/protoCourseData.ts';
import { PROTO_STAGE } from '../src/greybox/protoStage.ts';
import { FOREST_STAGE } from '../src/stages/forest/forestData.ts';
import { cardboardParts, type BoxDef, type DoorDef, type StageDef } from '../src/stages/stageTypes.ts';

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
    if (d.kind === 'climbable') list.push({ name: d.name, x: d.x, z: d.z, w: d.w, d: d.d, top: d.top, h: d.h, color: 'fence' });
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

  // 埋め込んだ登れる面：埋め込み先の中に収まり、どれか1面が埋め込み先の表面とそろう（はみ出し・段差なし）
  for (const d of stage.interactables) {
    if (d.kind !== 'climbable' || !d.embeddedIn) continue;
    const a = byName(d.name);
    const h = byName(d.embeddedIn);
    const inside = a.minX >= h.minX - EPS && a.maxX <= h.maxX + EPS && a.minY >= h.minY - EPS
      && a.maxY <= h.maxY + EPS && a.minZ >= h.minZ - EPS && a.maxZ <= h.maxZ + EPS;
    const flush = [a.minX - h.minX, a.maxX - h.maxX, a.minZ - h.minZ, a.maxZ - h.maxZ].some((v) => Math.abs(v) < EPS);
    if (!inside) errors.push(`${d.name}：${d.embeddedIn} からはみ出している（歩くと段差に引っかかる）`);
    else if (!flush) errors.push(`${d.name}：${d.embeddedIn} の表面とそろっていない（爪が届かない）`);
    else infos.push(`${d.name}：${d.embeddedIn} に埋め込み、表面がそろっている（段差なし）`);
  }

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

function forestChecks({ stage, byName, errors, infos, boxes }: Ctx): void {
  const vine = stage.interactables.find((d) => d.kind === 'climbable');
  const t1 = byName('①の木・幹');
  const t2 = byName('②の木・幹');
  const t3 = byName('③の木・幹');
  const b12 = byName('①→②の枝');
  const over = byName('③の張り出し枝');
  const fence = byName('板塀');

  // 1. スタートからツタが見える距離
  if (vine && vine.kind === 'climbable') {
    const face = vine.z + vine.d / 2; // ツタの表面（+Z 側）
    const nose = stage.start.z - CAT_LENGTH / 2;
    infos.push(`スタート → ツタ：鼻先から ${fmt(nose - face)} m（正面、x ${fmt(vine.x - vine.w / 2)}〜${fmt(vine.x + vine.w / 2)}）`);
    if (Math.abs(vine.top - t1.maxY) > EPS) errors.push('ツタの上端が①の木の股の高さと一致しない（登り切って股に乗れない）');
  }
  // 2. 枝の高さが股とそろう（段差なし）
  if (Math.abs(b12.maxY - t1.maxY) > EPS || Math.abs(b12.maxY - t2.maxY) > EPS) errors.push('①→②の枝の上面が股とそろっていない');
  const branchW = b12.maxX - b12.minX;
  infos.push(`①→②の枝：幅 ${fmt(branchW)}（猫の幅 ${CAT_WIDTH}）、長さ ${fmt(b12.maxZ - b12.minZ)}`);
  if (!(branchW > CAT_WIDTH + 0.1)) errors.push('枝が細すぎる');

  // 3. ② → ③ のジャンプ
  const gap = t2.minZ - t3.maxZ;
  const rise = t3.maxY - t2.maxY;
  const reach = jumpReach(rise);
  infos.push(`②→③：隙間 ${fmt(gap)}、段差 +${fmt(rise)} → 空中で進める距離 ${fmt(reach)}`);
  if (!(rise < JUMP_HEIGHT - 0.2)) errors.push('②→③の段差がジャンプ力に対して大きすぎる');
  if (!(reach > gap + 0.3)) errors.push('②→③の隙間が遠すぎる');

  // 4. 張り出し枝は板塀の上を通り、塀の向こうまで伸びる
  infos.push(`張り出し枝：底面 ${fmt(over.minY)}（板塀の上端 ${fmt(fence.maxY)}）、先端 z ${fmt(over.minZ)}（塀の向こう面 z ${fmt(fence.minZ)}）`);
  if (!(over.minY > fence.maxY)) errors.push('張り出し枝が板塀に当たる');
  if (!(over.minZ < fence.minZ - 0.5)) errors.push('張り出し枝が塀の向こうまで十分に伸びていない');
  if (Math.abs(over.maxY - t3.maxY) > EPS) errors.push('張り出し枝の上面が③の股とそろっていない');

  // 5. 近道ができないか：スタート側（塀の手前）の地面から登れる箱（ツタを使わず、ジャンプだけ）
  //    ジャンプで乗れる箱を順にたどり、最も高い所 + ジャンプ力 が股・塀に届かないこと
  const startSide = boxes.filter((b) => !b.isGround && aabb(b).minZ > fence.maxZ - EPS && aabb(b).minY < EPS);
  let reachable = 0;
  let changed = true;
  const used = new Set<string>();
  while (changed) {
    changed = false;
    for (const b of startSide) {
      if (used.has(b.name)) continue;
      if (b.top <= reachable + JUMP_HEIGHT - 0.02) {
        used.add(b.name);
        if (b.top > reachable) { reachable = b.top; changed = true; }
      }
    }
  }
  const maxReach = reachable + JUMP_HEIGHT;
  infos.push(`ツタを使わずに届く最高点：${fmt(maxReach)}（${[...used].join('・') || '地面のみ'}から）`);
  if (!(maxReach < Math.min(t1.maxY, t2.maxY, t3.maxY))) errors.push('ツタを使わずに木の股へ跳び乗れてしまう');
  if (!(maxReach < fence.maxY)) errors.push('木を使わずに板塀へ跳び乗れてしまう');

  // 6. 樹冠に頭が届かない（樹冠の下を跳んでも引っかからない）
  const canopyBottom = Math.min(...boxes.filter((b) => b.color === 'leaves').map((b) => aabb(b).minY));
  const headMax = t3.maxY + JUMP_HEIGHT + CAT_HEIGHT;
  infos.push(`樹冠の下端 ${fmt(canopyBottom)}、猫の頭の最高点 ${fmt(headMax)}`);
  if (!(canopyBottom > headMax)) errors.push('跳ぶと樹冠に頭が当たる');

  // 7. ゴールの段ボールに猫が入る
  const goal = stage.interactables.find((d) => d.kind === 'goal');
  if (goal && goal.kind === 'goal') {
    const iw = goal.w - 2 * goal.wall;
    const id = goal.d - 2 * goal.wall;
    infos.push(`段ボール：内寸 ${fmt(iw)} × ${fmt(id)}（猫 ${CAT_LENGTH} × ${CAT_WIDTH} が丸まって入る）`);
    if (!(iw > CAT_LENGTH + 0.02 && id > CAT_WIDTH + 0.02)) errors.push('段ボールに猫が入らない');
    if (!(goal.z < fence.minZ)) errors.push('段ボールが塀の向こう側にない');
  }
}

const ok = [verifyStage(PROTO_STAGE, protoChecks), verifyStage(FOREST_STAGE, forestChecks)].every(Boolean);
if (!ok) {
  console.error('\n✗ 検算エラーあり');
  process.exit(1);
}
console.log('\n✓ 全ステージ検算OK');

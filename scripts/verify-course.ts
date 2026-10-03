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
import { catParams, CAT_SHAPE } from '../src/player/CatParams.ts';
import { PROTO_STAGE } from '../src/greybox/protoStage.ts';
import { FOREST_STAGE } from '../src/stages/forest/forestData.ts';
import { FACTORY_STAGE } from '../src/stages/factory/factoryData.ts';
import { HOUSE_STAGE } from '../src/stages/house/houseData.ts';
import { goalParts, conveyorBeam, type BoxDef, type DoorDef, type StageDef, type SolidDef, type InteractableDef, type ClumpDef, type CylinderDef } from '../src/stages/stageTypes.ts';
import { solidAabb, pointInSolid, beamFrame, beamCorners, beamOverlapsBox, clumpTopRadius, clumpSideSlopeDeg, type Vec3 } from '../src/stages/geometry.ts';

/** 歩ける枝の傾きの上限 [度]（CatParams の滑り始める角度 30°） */
const MAX_WALK_SLOPE = 30;

const EPS = 1e-6;
/** 猫の能力（ゲーム本体と同じ値を CatParams から読む） */
const JUMP_HEIGHT = catParams.jumpHeight;
const GRAVITY = catParams.gravity;
/**
 * 跳べる・跳べないは「走っているとき」を基準に調べる。
 * 歩き（1.0）でしか届かない所は作れるが、走り（3.0）で届いてしまう近道は見逃せないため、
 * 猫にできる最大＝走りの速さで判定する。
 */
const MOVE_SPEED = catParams.runSpeed;
/** 段差を乗り上げられる高さ。跳んだ頂点からさらにこれだけ上に乗れる */
const AUTOSTEP = CAT_SHAPE.autostepHeight;

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

/** 重なってよい組（登れる面の埋め込み、引き出しと入れ物） */
function allowedOverlap(stage: StageDef, a: string, b: string): boolean {
  return stage.interactables.some((d) => {
    const host = d.kind === 'climbable' ? d.embeddedIn : d.kind === 'movable' ? d.insideOf : undefined;
    if (!host) return false;
    return (d.name === a && host === b) || (d.name === b && host === a);
  });
}

/** 箱として検算する物すべて（配置の箱＋登れる面＋ゴール＋皿＋スイッチ＋台車） */
/**
 * その点の真下に、ちょうどその高さの箱の上面があるか。
 * 森の「台地」のように地面以外の面の上に岩や倒木を置くときの、接地判定に使う。
 */
function restsOnBox(stage: StageDef, x: number, z: number, y: number): boolean {
  return allBoxes(stage).some((b) => {
    const c = aabb(b);
    return Math.abs(c.maxY - y) < 0.03 && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ;
  });
}

function allBoxes(stage: StageDef): BoxDef[] {
  const list: BoxDef[] = [...stage.boxes];
  for (const d of stage.interactables) {
    if (d.kind === 'climbable' && !d.sensor) {
      list.push({
        name: d.name, x: d.x, z: d.z, w: d.w, d: d.d, top: d.top, h: d.h, color: 'fence',
        ...(d.attachedTo ? { attachedTo: d.attachedTo } : {}),
      });
    }
    if (d.kind === 'goal') list.push(...goalParts(d));
    if (d.kind === 'dish') list.push({ name: d.name, x: d.x, z: d.z, w: d.radius * 2, d: d.radius * 2, top: (d.baseY ?? 0) + d.height, h: d.height, color: 'metal' });
    if (d.kind === 'switch') list.push({ name: d.name, x: d.x, z: d.z, w: d.w, d: d.d, top: d.y + d.height / 2, h: d.height, color: 'metal', attachedTo: [] });
    if (d.kind === 'movable') list.push({ name: d.name, x: d.x, z: d.z, w: d.w, d: d.d, top: d.top, h: d.h, color: 'metal' });
  }
  return list;
}

/** 傾いた板として検算する物すべて（自然物＋コンベア） */
function allSolids(stage: StageDef): SolidDef[] {
  const extra = stage.interactables
    .filter((d): d is Extract<InteractableDef, { kind: 'conveyor' }> => d.kind === 'conveyor')
    .map(conveyorBeam);
  return [...(stage.solids ?? []), ...extra];
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
    // 埋め込まれた登れる面（金網）・入れ物の中の引き出しは、入れ物が支えている
    if (stage.interactables.some((d) => d.name === b.name
      && ((d.kind === 'climbable' && d.embeddedIn) || (d.kind === 'movable' && d.insideOf)))) continue;
    const supporters = boxes.filter((o) => {
      if (o === b) return false;
      const c = aabb(o);
      return Math.abs(c.maxY - a.minY) < EPS
        && overlap(a.minX, a.maxX, c.minX, c.maxX) > EPS
        && overlap(a.minZ, a.maxZ, c.minZ, c.maxZ) > EPS;
    });
    // 梁や幹の上に載っている物（猫ベッドなど）も支えとして認める
    const onSolid = allSolids(stage).some((o) => {
      const sa = solidAabb(o);
      return Math.abs(sa.maxY - a.minY) < 0.02
        && b.x > sa.minX && b.x < sa.maxX && b.z > sa.minZ && b.z < sa.maxZ;
    });
    if (supporters.length === 0 && !onSolid) errors.push(`${b.name}: 底面 ${fmt(a.minY)} を支える物がない（宙に浮いている）`);
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
  const solids = allSolids(stage);
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

    // 支え（自然物どうしでも、箱（壁・機械など）に刺さっていてもよい）
    const hostBoxes: BoxDef[] = [];
    const hosts = (s.attachedTo ?? []).map((n) => {
      const h = find(n);
      if (!h) {
        const box = boxes.find((o) => o.name === n);
        if (box) hostBoxes.push(box);
        else errors.push(`${s.name}: 支えの ${n} が見つからない`);
      }
      return h;
    }).filter((h): h is SolidDef => !!h);
    /** 点が支えの箱の中にあるか */
    const inHostBox = (p: Vec3, margin = 0.03): boolean => hostBoxes.some((b) => {
      const c = aabb(b);
      return p[0] >= c.minX - margin && p[0] <= c.maxX + margin
        && p[1] >= c.minY - margin && p[1] <= c.maxY + margin
        && p[2] >= c.minZ - margin && p[2] <= c.maxZ + margin;
    });
    if (s.kind === 'cylinder') {
      if (Math.abs(s.bottom) > EPS) {
        // 下の幹の上面に載る（自分の中心が上面の円の中）か、箱の上面に載る
        const onCylinder = hosts.some((h) => h.kind === 'cylinder' && Math.abs(h.top - s.bottom) < EPS && Math.hypot(h.x - s.x, h.z - s.z) < h.r);
        const onBox = boxes.some((b) => {
          const c = aabb(b);
          return Math.abs(c.maxY - s.bottom) < EPS && s.x > c.minX && s.x < c.maxX && s.z > c.minZ && s.z < c.maxZ;
        });
        if (!onCylinder && !onBox) errors.push(`${s.name}: 底 ${s.bottom} を支える物が無い（宙に浮いている）`);
      }
    } else if (s.kind === 'clump') {
      const onGround = Math.abs(s.y - s.ry) < 0.01 || restsOnBox(stage, s.x, s.z, s.y - s.ry);
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
        const onGround = end[1] - s.thickness < 0.02 || restsOnBox(stage, end[0], end[2], end[1] - s.thickness);
        const inHost = hosts.some((h) => pointInSolid(end, h, 0.03)) || inHostBox(end);
        if (!onGround && !inHost) {
          // 片持ち（片方の端だけ支えられた枝）は、もう片方の端が支えの中にあれば可
          const other = end === s.p1 ? s.p2 : s.p1;
          const otherHeld = hosts.some((h) => pointInSolid(other, h, 0.03)) || inHostBox(other);
          if (!otherHeld) errors.push(`${s.name}: ${label}が宙に浮いている`);
        }
      }
      if (!s.steep && f.slopeDeg > MAX_WALK_SLOPE) errors.push(`${s.name}: 傾き ${fmt(f.slopeDeg)}° は歩けない（上限 ${MAX_WALK_SLOPE}°）`);
    }

    // 開始地点の猫と重ならない
    const st = stage.start;
    const r = catTurnDiameter / 2;
    if (overlap(a.minX, a.maxX, st.x - r, st.x + r) > EPS && overlap(a.minY, a.maxY, st.y, st.y + CAT_HEIGHT) > EPS
      && overlap(a.minZ, a.maxZ, st.z - r, st.z + r) > EPS) {
      errors.push(`開始地点の猫が ${s.name} と重なっている`);
    }

    // 軸にそろった箱（塀・壁など）にめり込まない（支えに指定した箱は、刺さっていてよい）
    for (const b of boxes) {
      if (b.isGround) continue;
      if ((s.attachedTo ?? []).includes(b.name)) continue;
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

// ---------------------------------------------------------------
// 到達できる足場の調べ（どこからどこへ跳べるかをたどる）
// ---------------------------------------------------------------

/** 立てる面（上面）と、その上の代表点 */
interface Surface {
  name: string;
  points: Vec3[];
}

/** 猫が跳んで進める水平距離（rise が負なら、跳ばずに歩いて落ちる場合も考える） */
function reachFor(rise: number): number {
  const jump = jumpReach(rise);
  if (rise >= 0) return jump;
  // 跳ばずに端から落ちる：高さの差 |rise| を落ちる間に進む距離
  const fall = MOVE_SPEED * Math.sqrt((2 * -rise) / GRAVITY);
  return Math.max(jump, fall);
}

/**
 * 面の上に代表点を並べる（端から 5cm 内側まで必ず含める）。
 * 端まで点を置かないと、広い面の縁から跳べるかを見落とす。
 */
function sampleRange(min: number, max: number, step = 0.5): number[] {
  const inset = Math.min(0.05, (max - min) / 2);
  const a = min + inset;
  const b = max - inset;
  const n = Math.max(1, Math.ceil((b - a) / step));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  return out;
}

/** 円周上の点（中心＋半径 r の輪） */
function ringPoints(x: number, y: number, z: number, r: number, n = 8): Vec3[] {
  const pts: Vec3[] = [[x, y, z]];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r]);
  }
  return pts;
}

/** 到達の調べ方（ステージごとに違う所） */
interface ReachSetup {
  /** 地面の点をどの足場に入れるか（塀の手前／奥、建物の中／外 など） */
  region: (x: number, z: number) => string;
  /** 足場にしない箱（高い壁・天井など） */
  skipBox: (b: BoxDef) => boolean;
  /** 地面の点の間隔 [m] */
  groundStep?: number;
}

/** ステージの「立てる面」を集める */
function collectSurfaces(stage: StageDef, setup: ReachSetup): Surface[] {
  const out: Surface[] = [];
  // ゴールや登れる面の上にも立てるので、箱として扱う物すべてを見る
  const regions = new Map<string, Vec3[]>();
  const ground = stage.boxes.find((b) => b.isGround)!;
  const g = aabb(ground);
  const step = setup.groundStep ?? 1;
  const solidHere = allBoxes(stage).filter((b) => !b.isGround && b.top - b.h < 0.2 && b.top > 0.2);
  for (let x = g.minX + step / 2; x < g.maxX; x += step) {
    for (let z = g.minZ + step / 2; z < g.maxZ; z += step) {
      // 箱が置かれている所には立てない
      if (solidHere.some((b) => Math.abs(x - b.x) < b.w / 2 + 0.1 && Math.abs(z - b.z) < b.d / 2 + 0.1)) continue;
      const name = setup.region(x, z);
      const list = regions.get(name) ?? [];
      list.push([x, 0, z]);
      regions.set(name, list);
    }
  }
  for (const [name, points] of regions) out.push({ name, points });

  for (const b of allBoxes(stage)) {
    if (b.isGround || setup.skipBox(b)) continue;
    if (b.w < 0.12 || b.d < 0.12) continue; // 細すぎて猫が立てない（机の脚・画面など）
    const pts: Vec3[] = [];
    for (const x of sampleRange(b.x - b.w / 2, b.x + b.w / 2)) {
      for (const z of sampleRange(b.z - b.d / 2, b.z + b.d / 2)) {
        pts.push([x, b.top, z]);
      }
    }
    if (pts.length > 0) out.push({ name: b.name, points: pts });
  }

  for (const s of allSolids(stage)) {
    // 急なベルト（止まっていると立てない）は足場にしない。動かしたときのつながりは extraEdges で渡す
    if (s.kind === 'beam' && s.steep) continue;
    if (s.kind === 'cylinder') {
      out.push({ name: s.name, points: ringPoints(s.x, s.top, s.z, s.r * 0.6) });
    } else if (s.kind === 'clump') {
      out.push({ name: s.name, points: ringPoints(s.x, s.y + s.ry, s.z, clumpTopRadius(s) * 0.8) });
    } else {
      // 枝・倒木：上面の中心線を刻む
      const pts: Vec3[] = [];
      const steps = Math.max(2, Math.ceil(Math.hypot(s.p2[0] - s.p1[0], s.p2[1] - s.p1[1], s.p2[2] - s.p1[2]) / 0.3));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        pts.push([
          s.p1[0] + (s.p2[0] - s.p1[0]) * t,
          s.p1[1] + (s.p2[1] - s.p1[1]) * t,
          s.p1[2] + (s.p2[2] - s.p1[2]) * t,
        ]);
      }
      out.push({ name: s.name, points: pts });
    }
  }
  return out;
}

/** a から b へ移れるか（歩いて渡る／跳ぶ／落ちる）。塀などに遮られる線は通さない */
function canMove(stage: StageDef, a: Surface, b: Surface): { ok: boolean; gap: number; rise: number } {
  let best = { ok: false, gap: Infinity, rise: 0 };
  for (const pa of a.points) {
    for (const pb of b.points) {
      const gap = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]);
      const rise = pb[1] - pa[1];
      if (rise > JUMP_HEIGHT - 0.15) continue;
      const walkable = gap < 0.12 && Math.abs(rise) < 0.13;
      if (!walkable && gap > reachFor(rise) - 0.25) continue;
      if (blocked(stage, pa, pb)) continue;
      if (gap < best.gap) best = { ok: true, gap, rise };
      // 歩いて渡れる所が見つかれば、それ以上は調べない（広い面どうしの総当たりを避ける）
      if (best.ok && best.gap < 0.12) return best;
    }
  }
  return best;
}

/**
 * a から b へ移るとき、途中で箱にぶつかるか。
 * 直線ではなく実際の道筋をたどる：水平は等速 MOVE_SPEED、上下は初速と重力で決まる。
 * 「跳ぶ」「歩く（同じ高さ）」「跳ばずに落ちる」を試し、どれか通れれば通れるとみなす。
 */
function blocked(stage: StageDef, a: Vec3, b: Vec3): boolean {
  const rise = b[1] - a[1];
  if (!arcBlocked(stage, a, b, 'jump')) return false;
  if (Math.abs(rise) <= 0.13 && !arcBlocked(stage, a, b, 'walk')) return false;
  if (rise < 0 && !arcBlocked(stage, a, b, 'fall')) return false;
  return true;
}

/** 道筋を細かく刻み、猫の体（高さ 0.26）が箱と重なる所があるか調べる */
function arcBlocked(stage: StageDef, a: Vec3, b: Vec3, mode: 'jump' | 'walk' | 'fall'): boolean {
  const dist = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const v0 = mode === 'jump' ? Math.sqrt(2 * GRAVITY * JUMP_HEIGHT) : 0;
  const tEnd = dist / MOVE_SPEED;
  // 目的の高さまで下りてくる時刻（そこで着地する）
  const disc = v0 * v0 + 2 * GRAVITY * (a[1] - b[1]);
  const tLand = mode === 'walk' || disc < 0 ? tEnd : (v0 + Math.sqrt(disc)) / GRAVITY;
  /**
   * 跳ばずに落ちる場合、着地までに水平距離が足りなければ、そもそも b へは届かない。
   * ここを「ぶつからなかった＝通れる」と答えてしまうと、
   * 「落ち始めてすぐ着地する」短い道筋しか調べずに、その先にある塀をすり抜けたことになる。
   */
  if (mode === 'fall' && tLand + 1e-9 < tEnd) return true;
  const tMax = Math.max(tEnd, Math.min(tLand, tEnd + 2));
  const steps = Math.max(8, Math.ceil((dist + Math.abs(b[1] - a[1])) / 0.04));
  // 通り道の近くの箱だけを見る（毎回すべての箱を調べると遅い）
  const near = allBoxes(stage).filter((box) => {
    if (box.isGround) return false;
    const bb = aabb(box);
    return bb.maxX > Math.min(a[0], b[0]) - 0.2 && bb.minX < Math.max(a[0], b[0]) + 0.2
      && bb.maxZ > Math.min(a[2], b[2]) - 0.2 && bb.minZ < Math.max(a[2], b[2]) + 0.2
      && bb.maxY > Math.min(a[1], b[1]) - 0.1;
  });
  for (let i = 1; i < steps; i++) {
    const t = (i / steps) * tMax;
    if (t > tLand + 1e-9) break; // 着地した
    const f = tEnd > 1e-9 ? Math.min(1, t / tEnd) : 1;
    const x = a[0] + (b[0] - a[0]) * f;
    const z = a[2] + (b[2] - a[2]) * f;
    const y = mode === 'walk' ? a[1] : a[1] + v0 * t - 0.5 * GRAVITY * t * t;
    for (const box of near) {
      const bb = aabb(box);
      // 端ちょうどを通る道もぶつかるとみなす（塀の端と茂みの境目をすり抜けないように）。
      // 上面がその時の足元より 12cm 以上高く（またげない）、体（高さ 0.26）と重なっていればぶつかる
      if (x > bb.minX - 0.01 && x < bb.maxX + 0.01
        && z > bb.minZ - 0.01 && z < bb.maxZ + 0.01
        && bb.maxY > y + 0.12 && bb.minY < y + CAT_HEIGHT - 0.03) return true;
    }
  }
  return false;
}

/**
 * 地面（手前）から順にたどり、何回の移動で各足場へ行けるかを調べる。
 * extraEdges：ツタのように、跳ぶ以外の方法でつながる所（[登り口, 登り切り先]）。
 */
function reachability(stage: StageDef, setup: ReachSetup, startName: string, extraEdges: Array<[string, string]>): Map<string, string[]> {
  const surfaces = collectSurfaces(stage, setup);
  const index = new Map(surfaces.map((s, i) => [s.name, i]));
  const edges: number[][] = surfaces.map(() => []);
  for (let i = 0; i < surfaces.length; i++) {
    for (let j = 0; j < surfaces.length; j++) {
      if (i === j) continue;
      if (canMove(stage, surfaces[i], surfaces[j]).ok) edges[i].push(j);
    }
  }
  for (const [from, to] of extraEdges) {
    const i = index.get(from);
    const j = index.get(to);
    if (i !== undefined && j !== undefined) edges[i].push(j);
  }
  // 各足場へ「どうたどり着いたか」（開始地点からの並び）を覚えておく
  const route = new Map<string, string[]>();
  const startIndex = index.get(startName);
  if (startIndex === undefined) throw new Error('開始の足場が見つからない: ' + startName);
  const queue = [startIndex];
  route.set(startName, [startName]);
  while (queue.length > 0) {
    const i = queue.shift()!;
    const here = route.get(surfaces[i].name)!;
    for (const j of edges[i]) {
      if (route.has(surfaces[j].name)) continue;
      route.set(surfaces[j].name, [...here, surfaces[j].name]);
      queue.push(j);
    }
  }
  return route;
}

/** 足場までの移動回数（たどり着けなければ undefined） */
function moves(route: Map<string, string[]>, name: string): number | undefined {
  const r = route.get(name);
  return r ? r.length - 1 : undefined;
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


function forestChecks({ stage, byName, errors, infos }: Ctx): void {
  const solids = stage.solids ?? [];
  const get = <K extends SolidDef['kind']>(name: string, kind: K): Extract<SolidDef, { kind: K }> => {
    const s = solids.find((o) => o.name === name);
    if (!s || s.kind !== kind) throw new Error(`${name}（${kind}）が見つからない`);
    return s as Extract<SolidDef, { kind: K }>;
  };
  const fence = byName('板塀');
  const plateau = byName('台地');

  // --- ツタ（最初の爪の対象。スタートの正面に必ず見える）---
  const vine = stage.interactables.find((d) => d.kind === 'climbable' && d.name === 'ツタ');
  const t1 = get('①の木・幹', 'cylinder');
  if (vine && vine.kind === 'climbable') {
    const nose = stage.start.z - CAT_LENGTH / 2;
    const face = vine.z + vine.d / 2;
    infos.push(`ツタ：スタートの鼻先から ${fmt(nose - face)} m（正面）、上端 ${vine.top} = ①の股`);
    if (Math.abs(vine.top - t1.top) > EPS) errors.push('ツタの上端が①の股と一致しない');
    if (!(nose - face > 1.0 && nose - face < 3.0)) errors.push('ツタがスタートから遠すぎる／近すぎる');
  }

  // --- 塀の上の葉（ルートA の越え方）---
  const leaf = get('塀の上の葉', 'clump');
  const leafTop = leaf.y + leaf.ry;
  const leafFlat = clumpTopRadius(leaf);
  infos.push(`塀の上の葉：上面 ${fmt(leafTop)}、平らな所の半径 ${fmt(leafFlat)}、下端 ${fmt(leaf.y - leaf.ry)}（塀 ${fmt(fence.maxY)}）、側面の傾き ${fmt(clumpSideSlopeDeg(leaf))}°`);
  if (!(leaf.y - leaf.ry > fence.maxY)) errors.push('塀の上の葉が塀に当たる');
  if (!(Math.abs(leaf.z - (fence.minZ + fence.maxZ) / 2) < leafFlat - 0.2)) errors.push('塀の上の葉の平らな所が塀をまたいでいない');

  // --- ⑤の枝の先から塀を跳び越えられるか（歩いて落ちると塀に当たる＝跳ぶ必要がある）---
  const b5 = get('⑤の枝（北）', 'beam');
  const v = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
  const tFar = Math.abs(b5.p2[2] - fence.minZ) / MOVE_SPEED;
  const yJump = b5.p2[1] + v * tFar - 0.5 * GRAVITY * tFar * tFar;
  infos.push(`⑤の枝の先 → 塀：跳ぶと向こう面で底 ${fmt(yJump)}（塀 ${fmt(fence.maxY)}）`);
  if (!(yJump > fence.maxY + 0.1)) errors.push('⑤の枝の先から塀を跳び越えられない');

  /**
   * 岩づたいには塀を越えられないこと（第4版で廃止した道）。
   * いちばん高い岩に乗って走って跳んでも、足が板塀の上面に届かない。
   */
  const rocks = solids.filter((o): o is ClumpDef => o.kind === 'clump' && o.name.includes('岩') && !o.name.includes('台地'));
  const rockTop = Math.max(...rocks.map((r) => r.y + r.ry));
  infos.push(`いちばん高い岩 ${fmt(rockTop)} ＋ 跳躍 ${JUMP_HEIGHT} = ${fmt(rockTop + JUMP_HEIGHT)}（板塀 ${fmt(fence.maxY)}）`);
  if (rockTop + JUMP_HEIGHT >= fence.maxY) errors.push('岩に乗って跳ぶと塀に届いてしまう（岩の道は廃止したはず）');

  // --- どこからどこへ行けるか（地面から順にたどる）---
  const forestSetup: ReachSetup = {
    // 手前の地面と、塀の向こうの沢を分ける（台地は別の箱なので自動的に別扱い）
    region: (_x, z) => (z > fence.maxZ ? '地面（手前）' : '地面（奥）'),
    // 外周の茂みと工場の壁には立てない
    skipBox: (b) => b.name.startsWith('茂み') || b.name === '工場の壁',
    // 塀を跳び越える着地点を細かく見るため、地面の点を 0.5m 刻みにする
    groundStep: 0.5,
  };
  const withVine = reachability(stage, forestSetup, '地面（手前）', [['地面（手前）', '①の木・幹']]);
  // ツタ無し（倒木のルート）。沢の登り返しだけは使える（詰み防止なので外せない）
  const withoutVine = reachability(stage, forestSetup, '地面（手前）', [['地面（奥）', '登り返しの木の枝']]);
  // 沢に落ちた猫が、登り返しのツタで林冠へ戻れるか
  const fromRavine = reachability(stage, forestSetup, '地面（奥）', [['地面（奥）', '登り返しの木の枝']]);

  const key = ['①の木・幹', '②の木・幹', '③の木・幹', '塀の上の葉', '④の枝（北）', '⑤の枝（北）', '⑦の枝（北）',
    '地面（奥）', '登り返しの木の枝', '林冠の木P・樹冠', '林冠の木T・樹冠', '台地'];
  infos.push('到達できるまでの移動回数（ツタあり）：' + key.map((k) => `${k} ${moves(withVine, k) ?? '×'}`).join('、'));

  const cross = moves(withVine, '地面（奥）');
  if (cross === undefined) errors.push('塀の向こうへ行けない（ルートが成立していない）');
  else infos.push(`塀の向こう（沢）まで最短 ${cross} 回の移動：${withVine.get('地面（奥）')!.join(' → ')}`);

  const toPlateau = moves(withVine, '台地');
  if (toPlateau === undefined) errors.push('崖の上（台地）へ行けない＝ゴールへ行けない');
  else {
    infos.push(`崖の上まで最短 ${toPlateau} 回の移動：${withVine.get('台地')!.join(' → ')}`);
    if (toPlateau < 8) errors.push(`崖の上へ ${toPlateau} 回で行けてしまう（簡単すぎる。8回以上にする）`);
    // 台地へは林冠を渡ってしか行けない（崖は 4.0 あって地面から跳んでも届かない）
    if (!withVine.get('台地')!.some((n) => n.includes('樹冠'))) {
      errors.push('林冠を通らずに崖の上へ行けてしまう：' + withVine.get('台地')!.join(' → '));
    }
  }
  infos.push(`崖の高さ ${fmt(plateau.maxY)}（地面から跳んで上がれるのは ${JUMP_HEIGHT}）`);
  if (plateau.maxY <= JUMP_HEIGHT + AUTOSTEP) errors.push('崖が低く、地面から跳んで台地に上がれてしまう');

  /**
   * ツタはいちばん短い道だが、唯一の道ではない（倒木から⑥へ上がる道が別にある）。
   * ツタを見つけると手数が減る＝探す価値がある、という形にしてある。
   */
  if (!withVine.has('塀の上の葉')) errors.push('ルートA（ツタ）が成立していない');
  const vineRoute = withVine.get('台地');
  const noVineRoute = withoutVine.get('台地');
  if (!noVineRoute) errors.push('ツタを使わないとゴールへ行けない（倒木のルートが途切れている）');
  /**
   * ツタの値打ちは手数ではなく「**沢に落ちずに済む**」こと。
   * ③の細い枝 → 塀の上の葉 と渡ると、そのまま林冠へ入れる。
   * ④・⑤・⑦から塀を跳び越えた猫は沢の地面に降りるので、登り返しのツタを探すことになる。
   */
  infos.push(`ツタのルートは沢に降りずに林冠へ入れる：${vineRoute?.includes('地面（奥）') ? '降りてしまう' : 'OK'}`
    + `（倒木のルートは ${noVineRoute?.includes('地面（奥）') ? '沢を経由する' : '沢を通らない'}）`);
  if (vineRoute?.includes('地面（奥）')) errors.push('ツタのルートでも沢に落ちてしまう（塀の上の葉から林冠へ直接入れていない）');
  // 塀を越える所が4か所あること（③の葉／⑦／④／⑤）
  for (const branch of ['⑦の枝（北）', '④の枝（北）', '⑤の枝（北）']) {
    if (!withVine.has(branch)) errors.push(`${branch} へ行けない（塀を越える道が1つ減っている）`);
  }
  // ツタ無し（倒木の道）でも塀を越えられる
  if (!withoutVine.has('⑤の枝（北）')) errors.push('倒木のルートが成立していない');
  if (!withoutVine.has('地面（奥）')) errors.push('ツタを使わないルートで塀を越えられない');

  /**
   * 詰み防止：塀を跳び越えて沢の地面に落ちた猫が、登り返しのツタで林冠へ戻れること。
   * 板塀は向こう側からも登れないので、ここが無いと沢に閉じ込められる。
   */
  if (!fromRavine.has('台地')) errors.push('沢に落ちると戻れない（登り返しのツタから林冠へ行けない）');
  else infos.push(`沢に落ちても、登り返しのツタから ${moves(fromRavine, '台地')} 回で崖の上へ戻れる`);

  // --- 樹冠（第4版から乗れる）---
  const canopies = [...withVine.keys()].filter((n) => n.includes('樹冠'));
  infos.push(`乗れる樹冠 ${canopies.length} か所（第4版から木のてっぺんに乗れる）`);
  if (canopies.length < 7) errors.push('樹冠に乗れる所が少なすぎる（林冠ルートが成立していない）');
  infos.push(`立てる場所のうち ${withVine.size} か所へ到達できる（行き止まりを含む）`);

  // --- ゴール ---
  const goal = stage.interactables.find((d) => d.kind === 'goal');
  if (goal && goal.kind === 'goal') {
    const iw = goal.w - 2 * goal.wall;
    const id = goal.d - 2 * goal.wall;
    infos.push(`ゴール：段ボールの内寸 ${fmt(iw)} × ${fmt(id)}（猫 ${CAT_LENGTH} × ${CAT_WIDTH} が丸まって入る）`);
    if (!(iw > CAT_LENGTH + 0.02 && id > CAT_WIDTH + 0.02)) errors.push('段ボールに猫が入らない');
    if (!(goal.z < plateau.maxZ)) errors.push('段ボールが崖の上に置かれていない');
  }
  void beamCorners;
  void ({} as CylinderDef);
}

// ---------------------------------------------------------------
// 工場：床からゴール（事務所のキーボード）まで行けるか
// ---------------------------------------------------------------
const NOT_FOOTING = new Set([
  '工場・西壁', '工場・東壁', '工場・北壁', '工場・南壁（西）', '工場・シャッター',
  '事務所・西壁', '事務所・東壁', '事務所・北壁', '事務所・南壁（西）', '事務所・南壁（東）',
  '事務所・窓の上', '事務所・窓の下',
]);

function factoryChecks({ stage, byName, errors, infos }: Ctx): void {
  const setup: ReachSetup = {
    // 地面は「工場の中」と「屋外」に分ける（壁は blocked() が遮る。シャッターの下だけ通れる）
    region: (x, z) => (x > -14 && x < 6 && z > -8 && z < 20 ? '工場の床' : '屋外の地面'),
    // 壁・シャッターの上には立てない（上に屋根が載っている）
    skipBox: (b) => NOT_FOOTING.has(b.name),
  };
  // 登れる面（押し当てて登る）は、跳ぶ以外のつながりとして渡す
  const climbEdges: Array<[string, string]> = [
    ['踏み台の木箱', '機械B'],          // 機械Bの金網
    ['工場の床', '中2階の踊り場'],       // 点検はしご（東）
    ['工場の床', '木箱の山（ネット）'],   // 荷崩れ防止ネット
    ['工場の床', '機械A'],              // 立てかけた木パレット
    ['キャットウォーク', '鉄骨A'],       // 点検はしご（西壁）
    ['吊り荷（大）', 'ベルトの降り口'],   // スイッチを入れた急なコンベア（鉄骨A→鉄骨B の唯一の道）
    ['工場の床', '中2階の踊り場'],       // 押せる台車を動かして上がる
  ];
  const route = reachability(stage, setup, '屋外の地面', climbEdges);
  const key = [
    '木箱C', 'コンベア', '機械B', 'ダクト（横）', 'キャットウォーク', '鉄骨A', '鉄骨B',
    'ダクト（天窓へ）', '工場の屋根（天窓の北）', '屋外ダクト', '室外機・架台', '事務所の屋根',
    '事務所のダクト', '窓台', '事務所・2階の床', '事務机', 'キーボード・本体',
  ];
  infos.push('到達できるまでの移動回数：' + key.map((k) => `${k} ${moves(route, k) ?? '×'}`).join('、'));

  const goal = moves(route, 'キーボード・本体');
  if (goal === undefined) errors.push('ゴール（キーボード）まで行けない');
  else {
    infos.push(`ゴールまで最短 ${goal} 回の移動：${route.get('キーボード・本体')!.join(' → ')}`);
    // 第2版（コンベアを道の途中に移し、吊り荷への跳び降りを足した）で 15 手。
    // ここが 14 を下回ったら、どこかに登りを飛ばせる近道ができている
    if (goal < 14) errors.push(`ゴールへ ${goal} 回で行けてしまう（近道がある）`);
  }
  // 事務所の窓へは、工場の中を登って屋根を通るしかないこと（外から直接登れない）
  const outside = reachability(stage, setup, '屋外の地面', climbEdges);
  const toWindow = outside.get('窓台');
  if (!toWindow) errors.push('屋外から窓台へ行けない');
  else if (!toWindow.some((n) => n.includes('屋根'))) {
    errors.push('屋根を通らずに事務所の窓へ行けてしまう：' + toWindow.join(' → '));
  }
  // 落ちても詰まないこと（屋外へ落ちたら、シャッターの下から工場へ戻れる）
  if (!route.has('工場の床')) errors.push('シャッターの下から工場へ入れない');

  // 窓台を跳び外して配管ラックに落ちたとき、短く戻れること（SPEC 7「戻る距離を長くしない」）
  const fromRack = reachability(stage, setup, '配管ラック', climbEdges);
  const back = moves(fromRack, '窓台');
  if (back === undefined) errors.push('配管ラックに落ちると窓台へ戻れない（受け止めの意味が無い）');
  else {
    infos.push(`配管ラック（天端 ${fmt(byName('配管ラック').maxY)}）から窓台まで ${back} 回の移動で戻れる`);
    if (back > 2) errors.push(`配管ラックから窓台へ戻るのに ${back} 回かかる（受け止めの位置が遠い）`);
  }

  // 天窓の穴：猫が通れる広さか
  const north = byName('工場の屋根（天窓の北）');
  const south = byName('工場の屋根（天窓の南）');
  const west = byName('工場の屋根（西）');
  const east = byName('工場の屋根（東）');
  const holeX = east.minX - west.maxX;
  const holeZ = south.minZ - north.maxZ;
  infos.push(`天窓の穴：${fmt(holeX)} × ${fmt(holeZ)} m（猫 ${CAT_WIDTH} × ${CAT_LENGTH}）`);
  if (!(holeX > CAT_LENGTH + 0.3 && holeZ > CAT_LENGTH + 0.3)) errors.push('天窓の穴が猫に対して狭い');

  // 窓：開口の高さと、窓台の張り出し
  const sill = byName('窓台');
  const above = byName('事務所・窓の上');
  const floor2 = byName('事務所・2階の床');
  infos.push(`事務所の窓：開口 ${fmt(sill.maxY)}〜${fmt(above.minY)}（高さ ${fmt(above.minY - sill.maxY)}）、`
    + `窓台は壁から ${fmt(sill.maxZ - byName('事務所・南壁（西）').maxZ)} 張り出し、2階の床は ${fmt(floor2.maxY)}`);
  if (!(above.minY - sill.maxY > CAT_HEIGHT + 0.3)) errors.push('窓の開口が猫に対して低い');
}

/** 家：庭から入って、吹き抜けの梁の上の猫ベッドまで行けるか */
function houseChecks({ stage, byName, errors, infos }: Ctx): void {
  const setup: ReachSetup = {
    // 地面は「家の中（1階）」と「庭」に分ける（壁は blocked() が遮る。網戸のすき間だけ通れる）
    region: (x, z) => (x > -8 && x < 8 && z > -7 && z < 7 ? '1階の床' : '庭'),
    skipBox: (b) => b.name.startsWith('家・') || b.name.startsWith('階段室の壁') || b.name === '網戸',
    groundStep: 0.5,
  };
  // 登れる面・ギミックのつながり
  const climbEdges: Array<[string, string]> = [
    ['1階の床', '2階の床（北）'],        // 麻ひもの柱を登る（吹き抜けの北のふち）
    ['2階の床（北）', 'タンス'],         // 引き出しを開けて段にし、タンスの上へ
    ['1階の床', '階段1段目'],           // 階段室のドアを開ける
  ];
  const route = reachability(stage, setup, '庭', climbEdges);
  const key = ['1階の床', '飾り棚の段4', '2階の床（西・南）', '2階の床（東）', '手すり（東）', 'タンス', '2階の本棚（上段）', '梁', '梁（南北）', '猫ベッド・クッション'];
  infos.push('到達できるまでの移動回数：' + key.map((k) => `${k} ${moves(route, k) ?? '×'}`).join('、'));

  const goal = moves(route, '猫ベッド・クッション');
  if (goal === undefined) errors.push('ゴール（猫ベッド）まで行けない');
  else {
    infos.push(`ゴールまで最短 ${goal} 回の移動：${route.get('猫ベッド・クッション')!.join(' → ')}`);
    // 登り（麻ひもの柱など）は1回の移動として数える。
    // 走り（3.0）を足したことで、梁（南北）からゴールへ一跳びで届くようになり 6 → 5 手になった。
    // 道筋は変わっていない（必ずタンスの引き出しを通る）ので、下限を 5 に合わせる。
    // ここが 5 を下回ったら、手すりから直接ゴールへ跳べる近道が復活している
    if (goal < 5) errors.push(`ゴールへ ${goal} 回で行けてしまう（近道がある）`);
    if (!route.get('猫ベッド・クッション')!.includes('タンス')) {
      errors.push('引き出しを使わずにゴールへ行ける道ができている：' + route.get('猫ベッド・クッション')!.join(' → '));
    }
  }
  if (!route.has('1階の床')) errors.push('網戸のすき間から家に入れない');

  // 網戸のすき間：猫が通れる広さか
  const screen = byName('網戸');
  const win = byName('家・掃き出し窓の下');
  const gap = win.maxX - screen.maxX;
  infos.push(`網戸のすき間：幅 ${fmt(gap)}（猫の幅 ${CAT_WIDTH}）、サッシの高さ ${fmt(win.maxY)}`);
  if (!(gap > CAT_WIDTH + 0.02)) errors.push('網戸のすき間が狭すぎて通れない');
  if (!(win.maxY < 0.85)) errors.push('窓のサッシが高すぎて庭から乗れない');

  // 吹き抜け：2階の床に穴が開いていること
  const west = byName('2階の床（西・南）');
  const east = byName('2階の床（東）');
  const north = byName('2階の床（北）');
  const south = byName('2階の床（南）');
  // 梁は手すりから1回で乗れない高さか（乗れてしまうとゴール直行の近道になる）
  const beamTop = Math.max(...(stage.solids ?? []).filter((s) => s.kind === 'beam').map((s) => s.p1[1]));
  const railTop = byName('手すり（東）').maxY;
  const reach = railTop + JUMP_HEIGHT + AUTOSTEP;
  infos.push(`梁の天端 ${fmt(beamTop)}（手すり ${fmt(railTop)} からの到達上限 ${fmt(reach)}）`);
  if (beamTop <= reach) errors.push('手すりから梁へ直接跳べてしまう（ゴールへの近道）');

  infos.push(`吹き抜け：x ${fmt(west.maxX)}〜${fmt(east.minX)}、z ${fmt(north.maxZ)}〜${fmt(south.minZ)}`);
  if (!(east.minX - west.maxX > 2 && south.minZ - north.maxZ > 2)) errors.push('吹き抜けが狭い');

  // ソファの下：猫がくぐれるか
  const seat = byName('ソファの座面');
  infos.push(`ソファの下：${fmt(seat.minY)}（猫の高さ ${CAT_HEIGHT}）`);
  if (!(seat.minY > CAT_HEIGHT + 0.02)) errors.push('ソファの下を猫がくぐれない');
}

const ok = [
  verifyStage(PROTO_STAGE, protoChecks),
  verifyStage(FOREST_STAGE, forestChecks),
  verifyStage(FACTORY_STAGE, factoryChecks),
  verifyStage(HOUSE_STAGE, houseChecks),
].every(Boolean);
if (!ok) {
  console.error('\n✗ 検算エラーあり');
  process.exit(1);
}
console.log('\n✓ 全ステージ検算OK');

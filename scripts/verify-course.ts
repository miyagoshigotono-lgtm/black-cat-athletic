/**
 * 検証コースの寸法・高さ・接地の検算（npm run verify:course）。
 *
 * 確認する内容：
 *  1. 地面より下に潜っている箱がないか
 *  2. 宙に浮いている箱がないか（底面が地面 y=0、または他の箱の上面に接し、XZ で重なっていること）
 *  3. 箱同士がめり込んでいないか（接しているのは可）
 *  4. 外周の内側に収まっているか
 *  5. 開始地点で猫が箱と重ならないか（どの向きでも重ならないよう、回転の外接円で判定）
 *  6. 隙間・トンネルの寸法が意図どおりか（通れる／通れない／中で振り向けるか）
 */
import { PROTO_COURSE, CAT_WIDTH, CAT_HEIGHT, CAT_LENGTH, START_POSITION, type BoxDef } from '../src/greybox/protoCourseData.ts';

const EPS = 1e-6;
const errors: string[] = [];
const infos: string[] = [];

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

// 1〜2. 潜り込み・支持
for (const b of PROTO_COURSE) {
  if (b.w <= 0 || b.d <= 0 || b.h <= 0) errors.push(`${b.name}: 寸法が0以下`);
  if (b.isGround) continue;
  const a = aabb(b);
  if (a.minY < -EPS) {
    errors.push(`${b.name}: 底面 ${fmt(a.minY)} が地面(0)より下`);
    continue;
  }
  if (Math.abs(a.minY) < EPS) continue; // 地面に接地
  const supporters = PROTO_COURSE.filter((o) => {
    if (o === b) return false;
    const c = aabb(o);
    return Math.abs(c.maxY - a.minY) < EPS
      && overlap(a.minX, a.maxX, c.minX, c.maxX) > EPS
      && overlap(a.minZ, a.maxZ, c.minZ, c.maxZ) > EPS;
  });
  if (supporters.length === 0) errors.push(`${b.name}: 底面 ${fmt(a.minY)} を支える箱がない（宙に浮いている）`);
  else infos.push(`${b.name}: 底面 ${fmt(a.minY)} は ${supporters.map((s) => s.name).join('・')} の上面で支持`);
}

// 3. めり込み
for (let i = 0; i < PROTO_COURSE.length; i++) {
  for (let j = i + 1; j < PROTO_COURSE.length; j++) {
    const a = aabb(PROTO_COURSE[i]);
    const c = aabb(PROTO_COURSE[j]);
    const ox = overlap(a.minX, a.maxX, c.minX, c.maxX);
    const oy = overlap(a.minY, a.maxY, c.minY, c.maxY);
    const oz = overlap(a.minZ, a.maxZ, c.minZ, c.maxZ);
    if (ox > EPS && oy > EPS && oz > EPS) {
      errors.push(`${PROTO_COURSE[i].name} と ${PROTO_COURSE[j].name} がめり込んでいる（${fmt(ox)} × ${fmt(oy)} × ${fmt(oz)}）`);
    }
  }
}

// 4. 外周内
for (const b of PROTO_COURSE) {
  const a = aabb(b);
  if (a.minX < -15 - EPS || a.maxX > 15 + EPS || a.minZ < -15 - EPS || a.maxZ > 15 + EPS) {
    errors.push(`${b.name}: 地面の範囲（±15）からはみ出している`);
  }
}

// 5. 開始地点（猫は Y 軸回りに回るので、水平方向は対角線の半分を半径とする正方形で近似）
const catHeight = CAT_HEIGHT;
const catWidth = CAT_WIDTH;
/** 振り向くのに必要な幅 = 体の水平方向の対角線 */
const catTurnDiameter = Math.hypot(CAT_WIDTH, CAT_LENGTH);
const turnR = catTurnDiameter / 2;
const cat: Aabb = {
  minX: START_POSITION.x - turnR, maxX: START_POSITION.x + turnR,
  minY: START_POSITION.y, maxY: START_POSITION.y + catHeight,
  minZ: START_POSITION.z - turnR, maxZ: START_POSITION.z + turnR,
};
for (const b of PROTO_COURSE) {
  if (b.isGround) continue;
  const a = aabb(b);
  if (overlap(a.minX, a.maxX, cat.minX, cat.maxX) > EPS
    && overlap(a.minY, a.maxY, cat.minY, cat.maxY) > EPS
    && overlap(a.minZ, a.maxZ, cat.minZ, cat.maxZ) > EPS) {
    errors.push(`開始地点の猫が ${b.name} と重なっている`);
  }
}

// 6. 隙間・トンネル
const byName = (n: string) => {
  const b = PROTO_COURSE.find((o) => o.name === n);
  if (!b) throw new Error(`箱が見つからない: ${n}`);
  return aabb(b);
};
const gap1 = byName('隙間塀2').minX - byName('隙間塀1').maxX;
const gap2 = byName('隙間塀3').minX - byName('隙間塀2').maxX;
infos.push(`猫：幅 ${fmt(catWidth)}、高さ ${fmt(catHeight)}、長さ ${fmt(CAT_LENGTH)}（振り向くのに必要な幅 ${fmt(catTurnDiameter)}）`);
infos.push(`隙間1：幅 ${fmt(gap1)} → ${gap1 > catWidth ? '通れる' : '通れない'}`);
infos.push(`隙間2：幅 ${fmt(gap2)} → ${gap2 > catWidth ? '通れる' : '通れない'}`);
if (!(gap1 > catWidth)) errors.push('隙間1は通れる想定だが猫の幅以下');
if (!(gap2 < catWidth)) errors.push('隙間2は通れない想定だが猫の幅以上');

const tunnelWidth = byName('トンネル右壁').minX - byName('トンネル左壁').maxX;
const tunnelHeight = byName('トンネル天井').minY;
const tunnelPass = tunnelWidth > catWidth && tunnelHeight > catHeight;
infos.push(`トンネル：内寸 幅 ${fmt(tunnelWidth)} × 高さ ${fmt(tunnelHeight)} → ${tunnelPass ? '通れる' : '通れない'}、中で${tunnelWidth > catTurnDiameter ? '振り向ける' : '振り向けない'}`);
if (!tunnelPass) errors.push('トンネルを猫が通れない');

const corridorWidth = byName('通路東壁').minX - byName('通路西壁').maxX;
const corridorWidth2 = byName('通路北壁').minZ - byName('通路南壁').maxZ;
const corridorTurn = Math.min(corridorWidth, corridorWidth2) > catTurnDiameter;
infos.push(`L字通路：縦 幅 ${fmt(corridorWidth)}、横 幅 ${fmt(corridorWidth2)} → 中で${corridorTurn ? '振り向ける' : '振り向けない'}`);

const tableUnder = byName('机・天板').minY;
infos.push(`机：天板の下 ${fmt(tableUnder)}（猫の全高 ${fmt(catHeight)} → ${tableUnder > catHeight ? 'くぐれる' : 'くぐれない'}）`);

console.log('--- 情報 ---');
for (const s of infos) console.log('  ' + s);
console.log(`--- 箱の数：${PROTO_COURSE.length} ---`);
if (errors.length > 0) {
  console.error('--- エラー ---');
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('✓ 検算OK：潜り込み・浮き・めり込み・はみ出しなし');

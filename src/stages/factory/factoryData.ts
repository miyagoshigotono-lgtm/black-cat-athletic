/**
 * Stage 2「工場 → 事務所」の配置データ（グレーボックス・第1版）。
 *
 * 作者と決めたこと：
 *  - 大枠は「工場の中 → 天窓から屋根 → 屋根を伝って事務所の窓」
 *  - 広さ 32 × 48 m、工場の高さ 12 m（森の 13 × 21 m・高さ 5 m より大きい）
 *  - 道は1本道。ただし各所に登り方が複数ある（登る順番は決まっていて、登り方は選べる）
 *  - ギミック（動くコンベア・スイッチなど）は形ができてから決める。今は動かない物だけ
 *
 * 座標：x −16〜16、z −24〜24、地面の上面 y = 0。猫は -Z を向いて始まる。
 *
 * 高さの流れ（猫のジャンプは足元が 1.0 m 上がるまで。登れる面は金網だけ）：
 *   床 0 → 木箱 2.5 → コンベア 4.3 → 機械B 4.4 → ダクト 5.2 → キャットウォーク 6.9
 *   → 鉄骨A 8.6 → 鉄骨B 10.4 → 天窓のダクト → 屋根 12.3
 *   → 屋外ダクト 9.8 → 室外機 8.2 → 事務所の屋根 7.6 → 壁のダクト 5.6 → 窓台 4.52
 *   → 事務所2階の床 4.0 → 机 4.72 → キーボード（ゴール）
 *
 * 寸法・支え・到達できるかの検算は scripts/verify-course.ts（npm run verify:course）。
 */
import type { BoxColor, BoxDef, InteractableDef, SolidDef, StageDef } from '../stageTypes.ts';

const boxes: BoxDef[] = [];
const solids: SolidDef[] = [];

/** 床から立ち上がる箱（厚み = 上面の高さ） */
function block(name: string, x: number, z: number, w: number, d: number, top: number, color: BoxColor): BoxDef {
  return { name, x, z, w, d, top, h: top, color };
}

/** 厚み h の板・台（棚・ダクト・床など） */
function slab(
  name: string, x: number, z: number, w: number, d: number, top: number, h: number,
  color: BoxColor, attachedTo?: string[],
): BoxDef {
  return { name, x, z, w, d, top, h, color, ...(attachedTo ? { attachedTo } : {}) };
}

// ---------------------------------------------------------------
// 地面
// ---------------------------------------------------------------
boxes.push({ name: '地面', x: 0, z: 0, w: 32, d: 48, top: 0, h: 0.5, color: 'concrete', isGround: true });

// ---------------------------------------------------------------
// 工場棟（内側 x −14〜6、z −8〜20、高さ 12。壁の厚み 0.5）
// ---------------------------------------------------------------
boxes.push(block('工場・西壁', -14.25, 6.5, 0.5, 28.0, 12, 'concrete'));
boxes.push(block('工場・東壁', 6.25, 6.5, 0.5, 28.0, 12, 'concrete'));
boxes.push(block('工場・北壁', -4.0, -7.25, 20.0, 0.5, 12, 'concrete'));
boxes.push(block('工場・南壁（西）', -9.25, 20.25, 9.5, 0.5, 12, 'concrete'));
// シャッターは下が 0.45 だけ開いている（猫はここから入ってきた）
boxes.push(slab('工場・シャッター', 0.75, 20.25, 10.5, 0.5, 12, 11.55, 'metal', ['工場・南壁（西）', '工場・東壁']));

// 屋根（12.0〜12.3）。天窓の穴：x −7.5〜−4.5、z −2〜1
boxes.push(slab('工場の屋根（西）', -11.0, 6.5, 7.0, 28.0, 12.3, 0.3, 'roof'));
boxes.push(slab('工場の屋根（東）', 1.0, 6.5, 11.0, 28.0, 12.3, 0.3, 'roof'));
boxes.push(slab('工場の屋根（天窓の北）', -6.0, -4.75, 3.0, 5.5, 12.3, 0.3, 'roof'));
boxes.push(slab('工場の屋根（天窓の南）', -6.0, 10.75, 3.0, 19.5, 12.3, 0.3, 'roof'));

// 柱（鉄骨を支える）
for (const [x, z] of [[-9.5, -1.0], [1.5, 2.0], [-9.5, 15.5], [3.0, 6.0]] as const) {
  solids.push({ kind: 'cylinder', name: `柱(${x},${z})`, x, z, r: 0.4, bottom: 0, top: 12, color: 'steel' });
}

// ---------------------------------------------------------------
// 工場の中：床 → 木箱 → コンベア → 機械 → ダクト
// ---------------------------------------------------------------
boxes.push(block('パレット', 3.5, 17.0, 2.0, 1.2, 0.12, 'crate'));
boxes.push(block('木箱A', 3.6, 15.6, 1.1, 1.1, 0.8, 'crate'));
boxes.push(block('木箱B', 4.8, 14.4, 1.1, 1.1, 1.55, 'crate'));
boxes.push(block('木箱C', 3.4, 13.2, 1.3, 1.3, 2.3, 'crate'));
boxes.push(block('木箱D（行き止まり）', 5.0, 11.6, 1.0, 1.0, 1.2, 'crate'));
boxes.push(block('作業台', -1.4, 17.4, 2.4, 1.0, 0.8, 'furniture'));
boxes.push(block('工具棚', -2.2, 16.2, 1.2, 0.5, 1.6, 'furniture'));
boxes.push(block('機械A', -6.5, 14.5, 3.6, 3.0, 2.8, 'machine'));
boxes.push(block('機械B', -6.0, 9.0, 4.0, 3.5, 4.4, 'machine'));
boxes.push(block('踏み台の木箱', -3.2, 8.2, 1.0, 1.0, 0.8, 'crate'));
// ドラム缶（作業台へ上がる別の道）
solids.push({ kind: 'cylinder', name: 'ドラム缶1', x: 1.4, z: 16.4, r: 0.34, bottom: 0, top: 0.8, color: 'metal' });
solids.push({ kind: 'cylinder', name: 'ドラム缶2', x: 0.6, z: 15.4, r: 0.34, bottom: 0, top: 0.8, color: 'metal' });

// コンベア（傾き 14°：歩いて上れる）。下の端は脚、上の端は機械Bに載る
solids.push({ kind: 'cylinder', name: 'コンベアの脚', x: 2.2, z: 12.6, r: 0.18, bottom: 0, top: 2.65, color: 'steel' });
solids.push({
  kind: 'beam', name: 'コンベア', p1: [2.2, 2.6, 12.6], p2: [-4.3, 4.5, 9.8],
  width: 0.9, thickness: 0.3, color: 'metal', attachedTo: ['コンベアの脚', '機械B'],
});

// 機械Bの東面の金網（床の木箱から登る別の道。上は機械Bの上に出る）
const meshB = {
  kind: 'climbable' as const, name: '機械Bの金網', look: 'mesh' as const, embeddedIn: '機械B',
  x: -4.06, z: 8.2, w: 0.12, d: 1.8, top: 4.4, h: 3.6,
};

// 横に伸びるダクト（機械Bから跳び移る）
solids.push({
  kind: 'beam', name: 'ダクト（横）', p1: [-14.2, 5.2, 9.0], p2: [-8.4, 5.2, 9.0],
  width: 0.7, thickness: 0.35, color: 'metal', attachedTo: ['工場・西壁'],
});

// ---------------------------------------------------------------
// 工場の上：キャットウォーク → 鉄骨 → 天窓
// ---------------------------------------------------------------
boxes.push(slab('キャットウォーク', -13.4, 4.5, 1.2, 23.0, 6.9, 0.15, 'platform', ['工場・西壁']));
// キャットウォークの下をくぐらないよう、斜めの通路はキャットウォークの東側を通す
solids.push({ kind: 'cylinder', name: '通路の支柱', x: -12.34, z: 4.7, r: 0.12, bottom: 0, top: 6.9, color: 'steel' });
solids.push({
  // ダクトからキャットウォークへ上がる斜めの通路（24°）
  kind: 'beam', name: '斜めの通路（下）', p1: [-12.34, 5.3, 8.3], p2: [-12.34, 6.9, 4.7],
  width: 0.8, thickness: 0.3, color: 'steel', attachedTo: ['通路の支柱'],
});
solids.push({
  kind: 'beam', name: '鉄骨A', p1: [-13.9, 8.6, 1.0], p2: [6.1, 8.6, 1.0],
  width: 0.5, thickness: 0.4, color: 'steel', attachedTo: ['工場・西壁', '工場・東壁'],
});
solids.push({
  // キャットウォークから鉄骨Aへ上がる斜めの通路（22°）
  kind: 'beam', name: '斜めの通路（上）', p1: [-13.4, 6.9, 4.2], p2: [-11.0, 8.6, 1.0],
  width: 0.8, thickness: 0.3, color: 'steel', attachedTo: ['キャットウォーク', '鉄骨A'],
});
solids.push({
  kind: 'beam', name: '鉄骨B', p1: [-13.9, 10.4, 3.0], p2: [6.1, 10.4, 3.0],
  width: 0.5, thickness: 0.4, color: 'steel', attachedTo: ['工場・西壁', '工場・東壁'],
});
solids.push({
  // 鉄骨Aから鉄骨Bへの筋交い（25°）。上の端は鉄骨Bの手前の面と同じ高さでそろえる（段差を作らない）
  kind: 'beam', name: '筋交い', p1: [-10.0, 8.6, 1.0], p2: [-6.5, 10.4, 2.75],
  width: 0.5, thickness: 0.3, color: 'steel', attachedTo: ['鉄骨A', '鉄骨B'],
});
solids.push({
  // 天窓へ抜けるダクト（22°）。北へ向かって上り、上の端は屋根の穴の中（屋根の上面より 5cm 低い）
  kind: 'beam', name: 'ダクト（天窓へ）', p1: [-6.0, 10.4, 3.0], p2: [-6.0, 12.25, -1.87],
  width: 0.7, thickness: 0.35, color: 'metal', attachedTo: ['鉄骨B'],
});

// 屋根の上の物（歩く道の目印・目くらまし）
boxes.push(slab('屋根の換気フード', -3.0, -4.0, 1.6, 1.6, 13.1, 0.8, 'metal'));
boxes.push(slab('屋根のダクト', -9.0, 0.0, 1.0, 8.0, 12.9, 0.6, 'metal'));
boxes.push(slab('屋根の箱', 1.5, -6.0, 1.2, 1.2, 12.9, 0.6, 'metal'));

// ---------------------------------------------------------------
// 工場と事務所の間（屋外・幅 3.5m）：屋根から降りる足場
// ---------------------------------------------------------------
boxes.push(slab('屋外ダクト', -6.0, -8.1, 3.0, 1.2, 9.8, 0.5, 'metal', ['工場・北壁']));
boxes.push(slab('室外機・架台', -8.8, -8.75, 1.6, 2.5, 8.2, 1.0, 'metal', ['工場・北壁']));

// ---------------------------------------------------------------
// 事務所棟（x −14.25〜−1.75、z −23.5〜−11.0、2階建て）
// ---------------------------------------------------------------
boxes.push(block('事務所・西壁', -14.0, -17.25, 0.5, 12.5, 7.3, 'concrete'));
boxes.push(block('事務所・東壁', -2.0, -17.25, 0.5, 12.5, 7.3, 'concrete'));
boxes.push(block('事務所・北壁', -8.0, -23.25, 11.5, 0.5, 7.3, 'concrete'));
// 南壁は窓（x −9.6〜−7.9、y 4.4〜5.6）の分だけ開ける
boxes.push(block('事務所・南壁（西）', -11.675, -11.25, 4.15, 0.5, 7.3, 'concrete'));
boxes.push(block('事務所・南壁（東）', -5.075, -11.25, 5.65, 0.5, 7.3, 'concrete'));
boxes.push(block('事務所・窓の下', -8.75, -11.25, 1.7, 0.5, 4.4, 'concrete'));
boxes.push(slab('事務所・窓の上', -8.75, -11.25, 1.7, 0.5, 7.3, 1.7, 'concrete', ['事務所・南壁（西）', '事務所・南壁（東）']));
boxes.push(slab('事務所・2階の床', -8.0, -17.25, 11.5, 11.5, 4.0, 0.3, 'concrete',
  ['事務所・西壁', '事務所・東壁', '事務所・北壁', '事務所・南壁（西）']));
boxes.push(slab('事務所の屋根', -8.0, -17.25, 12.5, 12.5, 7.6, 0.3, 'roof'));
// 窓台（外に 0.7 張り出し、内は2階の床まで届く）と、屋根から降りるための壁のダクト
boxes.push(slab('窓台', -8.75, -10.9, 1.7, 1.2, 4.52, 0.12, 'concrete', ['事務所・窓の下']));
boxes.push(slab('事務所のダクト', -12.0, -10.2, 4.0, 1.6, 5.6, 0.4, 'metal', ['事務所・南壁（西）']));

// 事務所の中（2階）
boxes.push(slab('事務机', -6.0, -19.0, 1.6, 0.8, 4.72, 0.72, 'desk'));
boxes.push(slab('椅子', -6.0, -17.9, 0.5, 0.5, 4.45, 0.45, 'furniture'));
boxes.push(slab('書類棚', -3.0, -21.0, 1.0, 0.45, 5.6, 1.6, 'furniture'));
boxes.push(slab('モニタ', -6.0, -19.34, 0.5, 0.08, 5.12, 0.4, 'desk', ['事務机']));

// ---------------------------------------------------------------
// 爪の対象
// ---------------------------------------------------------------
const interactables: InteractableDef[] = [
  meshB,
  // ゴール：事務机のキーボード（上で寝る）
  { kind: 'goal', name: 'キーボード', look: 'keyboard', x: -6.0, z: -19.15, baseY: 4.72, w: 0.5, d: 0.2, height: 0.08, wall: 0.01 },
];

export const FACTORY_STAGE: StageDef = {
  id: 'factory',
  name: '工場の事務所',
  boxes,
  solids,
  interactables,
  start: { x: 2.0, y: 0, z: 18.8, facing: 0 },
  sky: 0x9fb3c0,
};

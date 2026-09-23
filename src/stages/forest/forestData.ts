/**
 * Stage 1「工場の裏の森」（チュートリアル）の配置データ（グレーボックス段階・第3版）。
 *
 * 板塀（高さ 2.4、登れない）の向こうのゴールへ。道は一本ではなく、少なくとも3通り：
 *   A. ツタの木（正面）：ツタ → ①の股(2.1) → 枝の先 → ②の股(2.6) → 枝 → ③の木(3.3) → 細い枝 → 葉の塊(3.85) → 塀の上を越える
 *   B. 倒木（右手）：倒木 → 岩E(1.2) → ④の枝(1.95) → 枝先 → ⑤の枝(2.45) → 枝先から塀を跳び越える
 *   C. 岩（左手）：岩A(0.56) → 岩B(1.1) → 岩C(1.7) → 岩D(2.1) → 塀の上(2.4) → 向こうへ降りる
 * 行き止まりの枝・岩・倒木も混ぜ、遠目にはどれが道か分からないようにしている（SPEC 6.2 の方針）。
 * 最初の爪の対象（ツタ）はスタートの正面、必ず目に入る位置に置く（SPEC 8.3）。
 *
 * 決まりごと（作者と合意済み）：幹は登れない（爪痕のみ）。登れるのはツタだけ。板塀は登れない。
 * 寸法・跳べるかの検算は scripts/verify-course.ts、実際に通れるかは開発時のルート自動テストで確認する。
 */
import type { BoxColor, BoxDef, InteractableDef, SolidDef, StageDef } from '../stageTypes.ts';

/** 地面から立ち上がる箱（厚み = 上面高さ） */
function block(name: string, x: number, z: number, w: number, d: number, top: number, color: BoxColor): BoxDef {
  return { name, x, z, w, d, top, h: top, color };
}

const boxes: BoxDef[] = [];
const solids: SolidDef[] = [];

/** 樹冠の中心の高さ（下端 4.35。どの足場から跳んでも頭が届かない） */
const CANOPY_Y = 4.9;
/** 幹の上端（樹冠の中に少し入る） */
const TRUNK_TOP = 4.5;

/** 枝のない木（幹＋樹冠）。森を埋める */
function plainTree(name: string, x: number, z: number, r: number, canopyR: number): void {
  solids.push({ kind: 'cylinder', name: `${name}・幹`, x, z, r, bottom: 0, top: TRUNK_TOP, color: 'bark' });
  solids.push({ kind: 'clump', name: `${name}・樹冠`, x, y: CANOPY_Y, z, r: canopyR, ry: 0.5, color: 'leaves', attachedTo: [`${name}・幹`] });
}

/** 地面の岩。すそを広く（bottomRatio 1）して、下をえぐらない */
function rock(name: string, x: number, z: number, r: number, ry: number): void {
  solids.push({ kind: 'clump', name, x, y: ry, z, r, ry, bottomRatio: 1.0, color: 'rock' });
}

// ---------------------------------------------------------------
// 地面と外周（遊べる範囲：x -6〜6、z -13〜7.5）
// ---------------------------------------------------------------
boxes.push({ name: '地面', x: 0, z: -2.75, w: 13, d: 21.5, top: 0, h: 0.5, color: 'ground', isGround: true });
boxes.push(block('工場の壁', 0, 7.75, 13, 0.5, 6, 'factory'));
boxes.push(block('茂み・西', -6.25, -3.0, 0.5, 21, 5, 'bush'));
boxes.push(block('茂み・東', 6.25, -3.0, 0.5, 21, 5, 'bush'));
boxes.push(block('茂み・北', 0, -13.25, 12, 0.5, 5, 'bush'));
boxes.push(block('板塀', 0, -6.0, 12, 0.1, 2.4, 'boards'));

// ---------------------------------------------------------------
// ルート A：ツタの木 → ② → ③ → 塀の上の葉
// ---------------------------------------------------------------
// ①ツタの木：股 2.1。ツタは正面（+Z 側）に絡む
solids.push({ kind: 'cylinder', name: '①の木・幹', x: 0.2, z: 2.8, r: 0.42, bottom: 0, top: 2.1, color: 'bark' });
solids.push({ kind: 'cylinder', name: '①の木・上の幹', x: 0.5, z: 2.6, r: 0.18, bottom: 2.1, top: TRUNK_TOP, color: 'bark', attachedTo: ['①の木・幹'] });
solids.push({ kind: 'clump', name: '①の木・樹冠', x: 0.4, y: CANOPY_Y, z: 2.6, r: 1.5, ry: 0.55, color: 'leaves', attachedTo: ['①の木・上の幹'] });
// 股から2本の枝。西の枝はツタの真上から始まり、登り切ってそのまま進める。東の枝は行き止まり
solids.push({
  kind: 'beam', name: '①の枝（東・行き止まり）', p1: [0.3, 2.1, 2.6], p2: [1.7, 2.2, 2.3], width: 0.24, thickness: 0.16, color: 'branch',
  attachedTo: ['①の木・幹'],
});
solids.push({
  kind: 'beam', name: '①の枝（西）', p1: [0.2, 2.1, 2.6], p2: [-0.7, 2.35, 1.5], width: 0.22, thickness: 0.16, color: 'branch',
  attachedTo: ['①の木・幹'],
});

// ②の木：股 2.6
solids.push({ kind: 'cylinder', name: '②の木・幹', x: -1.9, z: 0.6, r: 0.4, bottom: 0, top: 2.6, color: 'bark' });
solids.push({ kind: 'cylinder', name: '②の木・上の幹', x: -2.15, z: 0.35, r: 0.18, bottom: 2.6, top: TRUNK_TOP, color: 'bark', attachedTo: ['②の木・幹'] });
solids.push({ kind: 'clump', name: '②の木・樹冠', x: -2.0, y: CANOPY_Y, z: 0.4, r: 1.4, ry: 0.55, color: 'leaves', attachedTo: ['②の木・上の幹'] });
solids.push({
  kind: 'beam', name: '②の枝（南・行き止まり）', p1: [-1.8, 2.6, 0.8], p2: [-1.2, 2.75, 1.9], width: 0.22, thickness: 0.16, color: 'branch',
  attachedTo: ['②の木・幹'],
});
solids.push({
  kind: 'beam', name: '②の枝（北）', p1: [-2.0, 2.6, 0.4], p2: [-2.4, 2.9, -1.4], width: 0.22, thickness: 0.16, color: 'branch',
  attachedTo: ['②の木・幹'],
});

// ③の木：股 3.3（森でいちばん高い足場）
solids.push({ kind: 'cylinder', name: '③の木・幹', x: -3.0, z: -2.6, r: 0.35, bottom: 0, top: 3.3, color: 'bark' });
solids.push({ kind: 'cylinder', name: '③の木・上の幹', x: -3.2, z: -2.85, r: 0.16, bottom: 3.3, top: TRUNK_TOP, color: 'bark', attachedTo: ['③の木・幹'] });
solids.push({ kind: 'clump', name: '③の木・樹冠', x: -3.1, y: CANOPY_Y, z: -2.8, r: 1.4, ry: 0.55, color: 'leaves', attachedTo: ['③の木・上の幹'] });
// 塀の方へ伸びる細い枝（幅 0.20：猫の幅 0.14 に対して余裕が少ない）
solids.push({
  kind: 'beam', name: '③の細い枝', p1: [-2.9, 3.3, -2.9], p2: [-2.2, 3.4, -5.0], width: 0.2, thickness: 0.14, color: 'branch',
  attachedTo: ['③の木・幹', '塀の上の葉'],
});
// 塀の上の葉：上面 3.85、下端 3.15（塀 2.4 より上）。平らな所が塀の線をまたぐ
solids.push({ kind: 'clump', name: '塀の上の葉', x: -1.9, y: 3.5, z: -5.9, r: 1.1, ry: 0.35, color: 'leaves', attachedTo: ['③の細い枝'] });

// ---------------------------------------------------------------
// ルート B：倒木 → 岩E → ④の枝 → ⑤の枝 → 塀を跳び越える
// ---------------------------------------------------------------
solids.push({ kind: 'cylinder', name: '④の木・幹', x: 2.6, z: -0.4, r: 0.45, bottom: 0, top: TRUNK_TOP, color: 'bark' });
solids.push({ kind: 'clump', name: '④の木・樹冠', x: 2.6, y: CANOPY_Y, z: -0.4, r: 1.5, ry: 0.5, color: 'leaves', attachedTo: ['④の木・幹'] });
solids.push({ kind: 'cylinder', name: '⑤の木・幹', x: 4.2, z: -2.6, r: 0.45, bottom: 0, top: TRUNK_TOP, color: 'bark' });
solids.push({ kind: 'clump', name: '⑤の木・樹冠', x: 4.2, y: CANOPY_Y, z: -2.6, r: 1.5, ry: 0.5, color: 'leaves', attachedTo: ['⑤の木・幹'] });
rock('岩E', 2.2, 1.6, 0.8, 0.6); // 上面 1.2（行き止まり：ここから届く足場は無い）
solids.push({
  // ④の木の幹に立てかけた倒木（傾き約 21°）。上の端（1.5）から④の枝へ跳ぶ
  kind: 'beam', name: '倒木', p1: [4.4, 0.35, 2.4], p2: [2.9, 1.5, -0.15], width: 0.38, thickness: 0.35, color: 'bark',
  attachedTo: ['④の木・幹'],
});
solids.push({
  kind: 'beam', name: '④の枝', p1: [2.6, 1.95, -0.4], p2: [3.6, 2.2, -1.9], width: 0.25, thickness: 0.16, color: 'branch',
  attachedTo: ['④の木・幹'],
});
solids.push({
  kind: 'beam', name: '⑤の枝', p1: [4.15, 2.4, -2.3], p2: [3.4, 2.8, -5.3], width: 0.22, thickness: 0.16, color: 'branch',
  attachedTo: ['⑤の木・幹'],
});
solids.push({
  kind: 'beam', name: '⑤の枝（東・行き止まり）', p1: [4.35, 2.6, -2.7], p2: [5.3, 2.75, -3.6], width: 0.22, thickness: 0.16, color: 'branch',
  attachedTo: ['⑤の木・幹'],
});

// ---------------------------------------------------------------
// ルート C：岩をつたって塀の上へ
// ---------------------------------------------------------------
rock('岩A', -4.2, -0.6, 0.8, 0.28); // 上面 0.56
rock('岩B', -4.9, -2.0, 0.65, 0.55); // 1.10
rock('岩C', -4.6, -3.6, 0.6, 0.85); // 1.70
rock('岩D', -5.2, -4.6, 0.5, 1.05); // 2.10 → 塀の上（2.4）へ

// ---------------------------------------------------------------
// 行き止まり・目くらまし（道に見えるが、そこから先が無い）
// ---------------------------------------------------------------
rock('岩F', 1.2, 1.0, 0.7, 0.35);
rock('岩G', -2.6, 3.4, 0.6, 0.5);
rock('岩H', 0.5, -1.5, 0.7, 0.45);
rock('岩I', -3.6, -5.2, 0.55, 0.6);
rock('岩J', 1.9, -3.4, 0.65, 0.4);
rock('岩K', -0.9, -8.6, 0.7, 0.4); // ゴール側
solids.push({
  kind: 'beam', name: '横たわる倒木', p1: [5.0, 0.3, -1.0], p2: [4.0, 0.3, -3.2], width: 0.4, thickness: 0.3, color: 'bark',
});
solids.push({
  kind: 'beam', name: '寄りかかる倒木（行き止まり）', p1: [-0.6, 0.3, -3.0], p2: [-1.9, 1.25, -4.45], width: 0.36, thickness: 0.3, color: 'bark',
  attachedTo: ['背景の木E・幹'],
});

// ---------------------------------------------------------------
// 森を埋める木（幹は登れない・枝なし）
// ---------------------------------------------------------------
const plain: Array<[string, number, number, number, number]> = [
  ['背景の木A', -1.0, 4.6, 0.3, 1.3],
  ['背景の木B', 2.0, 3.6, 0.28, 1.25],
  ['背景の木C', -4.6, 2.2, 0.32, 1.3],
  ['背景の木D', 4.6, 1.2, 0.3, 1.2],
  ['背景の木E', -2.0, -4.6, 0.26, 1.2],
  ['背景の木F', 1.4, -4.2, 0.3, 1.25],
  ['背景の木G', 4.6, -4.8, 0.28, 1.2],
  ['背景の木H', -3.0, -8.6, 0.3, 1.3],
  ['背景の木I', 3.0, -9.4, 0.3, 1.3],
  ['背景の木J', -1.4, -11.2, 0.28, 1.2],
  ['背景の木K', 1.8, -11.3, 0.3, 1.25],
  ['背景の木L', -4.8, -9.0, 0.26, 1.2],
  ['背景の木M', 4.4, -10.5, 0.28, 1.2],
];
for (const [name, x, z, r, cr] of plain) plainTree(name, x, z, r, cr);

// ---------------------------------------------------------------
// 爪の対象
// ---------------------------------------------------------------
const interactables: InteractableDef[] = [
  // ツタ：①の幹の正面（表面 z 3.22）に絡む「登れる範囲」。当たり判定は持たない（ぶつかるのは幹）
  {
    kind: 'climbable', name: 'ツタ', look: 'vine', sensor: true, embeddedIn: '①の木・幹',
    x: 0.2, z: 3.18, w: 0.3, d: 0.12, top: 2.1, h: 2.1,
  },
  { kind: 'goal', name: '段ボール', x: 0, z: -10.5, w: 0.6, d: 0.45, height: 0.3, wall: 0.02 },
  { kind: 'dish', name: 'ご飯皿', x: 0.75, z: -10.1, radius: 0.09, height: 0.04 },
];

// 傘の柄（当たり判定あり）：段ボールの右壁（x 0.3）のすぐ外。傘の布は見た目だけ（Goal が描く）
boxes.push(block('傘の柄', 0.335, -10.5, 0.03, 0.03, 1.0, 'metal'));

export const FOREST_STAGE: StageDef = {
  id: 'forest',
  name: '工場の裏の森',
  boxes,
  solids,
  interactables,
  start: { x: 0, y: 0, z: 5.2, facing: 0 },
  sky: 0xbcd8e6,
};

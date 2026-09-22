/**
 * Stage 1「工場の裏の森」（チュートリアル）の配置データ（グレーボックス段階）。
 *
 * ルート（開始地点から -Z 方向へ進む）：
 *   1. スタート（工場の裏）。正面 約1.9m に、ツタの絡んだ太い木（①）。最初の爪の対象が必ず目に入る
 *   2. ツタを登る → ①の木の股（高さ 2.2）に乗る
 *   3. 太い枝（幅 0.30、高さ 2.2）を歩いて ②の木の股（高さ 2.2）へ
 *   4. ②から ③の木の股（高さ 2.7）へジャンプ（隙間 0.8、段差 +0.5）
 *   5. ③から板塀（高さ 2.4）の上に張り出した枝（高さ 2.7）を渡り、先端から向こう側へ飛び降りる
 *   6. ゴール：段ボール（傘・布）に爪でクリア。隣のご飯皿は揺れるだけ
 *
 * 決まりごと（作者と合意済み）：幹は登れない（爪痕のみ）。登れるのはツタだけ。板塀は登れない。
 * 寸法の検算は scripts/verify-course.ts（npm run verify:course）。
 */
import type { BoxColor, BoxDef, InteractableDef, StageDef } from '../stageTypes.ts';

/** 地面から立ち上がる箱（厚み = 上面高さ） */
function block(name: string, x: number, z: number, w: number, d: number, top: number, color: BoxColor): BoxDef {
  return { name, x, z, w, d, top, h: top, color };
}

/** 下の箱の上に載る箱（底面 = bottom） */
function onTop(name: string, x: number, z: number, w: number, d: number, bottom: number, top: number, color: BoxColor): BoxDef {
  return { name, x, z, w, d, top, h: Number((top - bottom).toFixed(4)), color };
}

/** 枝の高さ・太さ */
const BRANCH_THICKNESS = 0.15;
/** 樹冠の下端（猫が届く最高点 = ③の股 2.7 + ジャンプ 1.0 + 体高 0.26 = 3.96 より上） */
const CANOPY_BOTTOM = 4.2;
const CANOPY_TOP = 6.4;

const boxes: BoxDef[] = [];

// ---------------------------------------------------------------
// 地面と外周（遊べる範囲：x -6〜6、z -13〜7.5）
// ---------------------------------------------------------------
boxes.push({ name: '地面', x: 0, z: -2.75, w: 13, d: 21.5, top: 0, h: 0.5, color: 'ground', isGround: true }); // x -6.5〜6.5、z -13.5〜8
boxes.push(block('工場の壁', 0, 7.75, 13, 0.5, 6, 'factory')); // z 7.5〜8.0（スタートの背後）
boxes.push(block('茂み・西', -6.25, -3.0, 0.5, 21, 5, 'bush')); // x -6.5〜-6、z -13.5〜7.5
boxes.push(block('茂み・東', 6.25, -3.0, 0.5, 21, 5, 'bush'));
boxes.push(block('茂み・北', 0, -13.25, 12, 0.5, 5, 'bush')); // x -6〜6、z -13.5〜-13

// 板塀（登れない）：z -6.05〜-5.95、高さ 2.4。左右の茂みに接する
boxes.push(block('板塀', 0, -6.0, 12, 0.1, 2.4, 'boards'));

// ---------------------------------------------------------------
// ①の木（ツタの木）：太い幹（股の高さ 2.2）＋右奥から上へ伸びる幹＋樹冠
//   股：x -0.5〜0.5、z 2.0〜3.0。ツタは +Z 面（z = 3.0）に張る（interactables）
//   上の幹は右奥（x 0.2〜0.5、z 2.3〜2.7）に寄せ、ツタを登り切った猫（x -0.25〜0.1 ±0.07、z 2.53〜2.97）と重ならない
// ---------------------------------------------------------------
boxes.push(block('①の木・幹', 0, 2.5, 1.0, 1.0, 2.2, 'bark'));
boxes.push(onTop('①の木・上の幹', 0.35, 2.5, 0.3, 0.4, 2.2, CANOPY_BOTTOM, 'bark'));
boxes.push(onTop('①の木・樹冠', 0.35, 2.5, 2.4, 2.4, CANOPY_BOTTOM, CANOPY_TOP, 'leaves')); // z 1.3〜3.7

// ①→② の太い枝：x -0.15〜0.15、z -0.5〜2.0、上面 2.2（股と同じ高さ、段差なし）
boxes.push({
  name: '①→②の枝', x: 0, z: 0.75, w: 0.3, d: 2.5, top: 2.2, h: BRANCH_THICKNESS, color: 'branch',
  attachedTo: ['①の木・幹', '②の木・幹'],
});

// ---------------------------------------------------------------
// ②の木：股 x -0.6〜0.6、z -1.7〜-0.5、高さ 2.2。上の幹は左奥（枝の通り道 x -0.15〜0.15 を空ける）
// ---------------------------------------------------------------
boxes.push(block('②の木・幹', 0, -1.1, 1.2, 1.2, 2.2, 'bark'));
boxes.push(onTop('②の木・上の幹', -0.4, -1.5, 0.4, 0.4, 2.2, CANOPY_BOTTOM, 'bark'));
boxes.push(onTop('②の木・樹冠', -0.4, -1.5, 2.4, 2.0, CANOPY_BOTTOM, CANOPY_TOP, 'leaves')); // z -2.5〜-0.5

// ---------------------------------------------------------------
// ③の木：股 x -0.6〜0.6、z -3.7〜-2.5、高さ 2.7（②から隙間 0.8、段差 +0.5）。上の幹は右奥
// ---------------------------------------------------------------
boxes.push(block('③の木・幹', 0, -3.1, 1.2, 1.2, 2.7, 'bark'));
boxes.push(onTop('③の木・上の幹', 0.4, -3.5, 0.4, 0.4, 2.7, CANOPY_BOTTOM, 'bark'));
boxes.push(onTop('③の木・樹冠', 0.4, -3.5, 2.4, 2.0, CANOPY_BOTTOM, CANOPY_TOP, 'leaves')); // z -4.5〜-2.5

// ③から板塀の上へ張り出す枝：z -7.5〜-3.7、上面 2.7、底面 2.55（板塀 2.4 より 0.15 上）
boxes.push({
  name: '③の張り出し枝', x: 0, z: -5.6, w: 0.3, d: 3.8, top: 2.7, h: BRANCH_THICKNESS, color: 'branch',
  attachedTo: ['③の木・幹'],
});

// ---------------------------------------------------------------
// 背景の木（幹は登れない・枝なし）と岩
// ---------------------------------------------------------------
const sceneryTrees: Array<[string, number, number]> = [
  ['背景の木A', -3.5, 4.0],
  ['背景の木B', 3.5, 1.0],
  ['背景の木C', -3.5, -2.0],
  ['背景の木D', 3.5, -3.5],
  ['背景の木E', -3.5, -10.0],
  ['背景の木F', 3.5, -9.5],
];
for (const [name, x, z] of sceneryTrees) {
  boxes.push(block(`${name}・幹`, x, z, 0.5, 0.5, CANOPY_BOTTOM, 'bark'));
  boxes.push(onTop(`${name}・樹冠`, x, z, 2.2, 2.2, CANOPY_BOTTOM, CANOPY_TOP - 0.4, 'leaves'));
}
boxes.push(block('岩A', 2.2, 4.6, 0.8, 0.6, 0.35, 'rock'));
boxes.push(block('岩B', -2.2, -3.8, 1.0, 0.8, 0.5, 'rock'));

const interactables: InteractableDef[] = [
  // ツタ：①の木の +Z 面（z 3.0）に埋め込む（z 2.96〜3.0、表面は幹とそろえて段差なし）。
  //   幅 0.35（x -0.25〜0.1）、高さ 2.2（股の上面まで）
  { kind: 'climbable', name: 'ツタ', look: 'vine', x: -0.075, z: 2.98, w: 0.35, d: 0.04, top: 2.2, h: 2.2, embeddedIn: '①の木・幹' },
  // ゴールの段ボール：外寸 0.6 × 0.45 × 高さ 0.3、厚み 0.02（内寸 0.56 × 0.41：猫 0.44 × 0.14 が入る）
  { kind: 'goal', name: '段ボール', x: 0, z: -10.5, w: 0.6, d: 0.45, height: 0.3, wall: 0.02 },
  // ご飯皿：段ボールの右手前
  { kind: 'dish', name: 'ご飯皿', x: 0.75, z: -10.1, radius: 0.09, height: 0.04 },
];

// 傘の柄（当たり判定あり）：段ボールの右壁（x 0.3）のすぐ外。傘の布は見た目だけ（Goal が描く）
boxes.push(block('傘の柄', 0.335, -10.5, 0.03, 0.03, 1.0, 'metal'));

export const FOREST_STAGE: StageDef = {
  id: 'forest',
  name: '工場の裏の森',
  boxes,
  interactables,
  start: { x: 0, y: 0, z: 5.2, facing: 0 },
  sky: 0xbcd8e6,
};

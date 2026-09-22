/**
 * Stage 1「工場の裏の森」（チュートリアル）の配置データ（グレーボックス段階・第2版）。
 *
 * 板塀（高さ 2.4、登れない）の向こうのゴールへ、越え方は3通り（人によって通る道が違う）：
 *   A. ツタの木（正面）：ツタを登る → 木の股（2.1）→ 斜めの枝を登る → 枝先から隣の木へ跳ぶ（2.45）
 *      → 枝を渡って③の木（2.75）→ 張り出した枝の先の「葉の塊」（上面 3.35）へ跳び乗り、葉の上を渡って塀を越える
 *   B. 倒木（右手）：倒木に跳び乗って坂を登る（1.5）→ 木の横枝へ跳び移る（2.3）→ 枝の先から塀を跳び越える
 *   C. 岩（左手の奥）：岩から岩へ跳んで高くなる（0.6 → 1.2 → 1.7）→ 塀の上に跳び乗り、向こうへ降りる
 * 最初の爪の対象（ツタ）はスタートの正面、必ず目に入る位置に置く（SPEC 8.3）。
 *
 * 決まりごと（作者と合意済み）：幹は登れない（爪痕のみ）。登れるのはツタだけ。板塀は登れない。
 * 寸法の検算は scripts/verify-course.ts（npm run verify:course）、通れるかはルートの自動テストで確認する。
 */
import type { BoxColor, BoxDef, InteractableDef, SolidDef, StageDef } from '../stageTypes.ts';

/** 地面から立ち上がる箱（厚み = 上面高さ） */
function block(name: string, x: number, z: number, w: number, d: number, top: number, color: BoxColor): BoxDef {
  return { name, x, z, w, d, top, h: top, color };
}

const boxes: BoxDef[] = [];
const solids: SolidDef[] = [];

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

/** 樹冠（葉の塊）の中心の高さ。下端 4.35 は、どの足場から跳んでも頭が届かない高さ（検算で確認） */
const CANOPY_Y = 4.9;

// ---------------------------------------------------------------
// ルート A：ツタの木（①）→ ② → ③ → 葉の塊
// ---------------------------------------------------------------
// ①の木：太い幹（半径 0.4、上面 2.1 が木の股）。ツタは正面（+Z 側）に絡む（interactables）
solids.push({ kind: 'cylinder', name: '①の木・幹', x: 0, z: 2.6, r: 0.4, bottom: 0, top: 2.1, color: 'bark' });
// 上へ伸びる細い幹：右奥に寄せ、ツタを登り切った猫（x ±0.07、z 2.43〜2.87）と重ならない
solids.push({ kind: 'cylinder', name: '①の木・上の幹', x: 0.3, z: 2.35, r: 0.18, bottom: 2.1, top: 4.5, color: 'bark', attachedTo: ['①の木・幹'] });
solids.push({ kind: 'clump', name: '①の木・樹冠', x: 0.2, y: CANOPY_Y, z: 2.4, r: 1.5, ry: 0.55, color: 'leaves', attachedTo: ['①の木・上の幹'] });
// 股から左前へ登る枝（傾き約 9°）。枝先 (-0.55, 2.3, 1.2) は宙に浮き、②の股まで 0.9 跳ぶ
solids.push({
  kind: 'beam', name: '①の枝', p1: [0, 2.1, 2.35], p2: [-0.55, 2.3, 1.2], width: 0.28, thickness: 0.18, color: 'branch',
  attachedTo: ['①の木・幹'],
});

// ②の木：股（上面 2.45）
solids.push({ kind: 'cylinder', name: '②の木・幹', x: -1.2, z: 0, r: 0.45, bottom: 0, top: 2.45, color: 'bark' });
solids.push({ kind: 'cylinder', name: '②の木・上の幹', x: -1.45, z: -0.25, r: 0.2, bottom: 2.45, top: 4.5, color: 'bark', attachedTo: ['②の木・幹'] });
solids.push({ kind: 'clump', name: '②の木・樹冠', x: -1.3, y: CANOPY_Y, z: -0.3, r: 1.4, ry: 0.55, color: 'leaves', attachedTo: ['②の木・上の幹'] });
// ② → ③ の枝（傾き約 6°）：両端を股に埋め込み、上面は股とそろえる
solids.push({
  kind: 'beam', name: '②→③の枝', p1: [-1.0, 2.45, -0.25], p2: [-0.2, 2.75, -3.15], width: 0.26, thickness: 0.18, color: 'branch',
  attachedTo: ['②の木・幹', '③の木・幹'],
});

// ③の木：股（上面 2.75）
solids.push({ kind: 'cylinder', name: '③の木・幹', x: 0, z: -3.4, r: 0.45, bottom: 0, top: 2.75, color: 'bark' });
solids.push({ kind: 'cylinder', name: '③の木・上の幹', x: 0.3, z: -3.1, r: 0.18, bottom: 2.75, top: 4.5, color: 'bark', attachedTo: ['③の木・幹'] });
solids.push({ kind: 'clump', name: '③の木・樹冠', x: 0.2, y: CANOPY_Y, z: -3.6, r: 1.6, ry: 0.55, color: 'leaves', attachedTo: ['③の木・上の幹'] });
// 塀の方へ張り出す枝：先は葉の塊に埋もれる
solids.push({
  kind: 'beam', name: '③の張り出し枝', p1: [0.1, 2.75, -3.75], p2: [0.4, 2.9, -5.2], width: 0.24, thickness: 0.16, color: 'branch',
  attachedTo: ['③の木・幹', '塀の上の葉'],
});
// 塀の上の葉：上面 3.35（平らな所は半径約 0.61、z -5.39〜-6.61 で塀の上をまたぐ）、下端 2.65（塀 2.4 より上）
solids.push({ kind: 'clump', name: '塀の上の葉', x: 0.6, y: 3.0, z: -6.0, r: 1.1, ry: 0.35, color: 'leaves', attachedTo: ['③の張り出し枝'] });

// ---------------------------------------------------------------
// ルート B：倒木 → ④の木の横枝 → 塀を跳び越える
// ---------------------------------------------------------------
solids.push({ kind: 'cylinder', name: '④の木・幹', x: 2.0, z: -1.2, r: 0.4, bottom: 0, top: 4.6, color: 'bark' });
solids.push({ kind: 'clump', name: '④の木・樹冠', x: 2.0, y: CANOPY_Y, z: -1.2, r: 1.5, ry: 0.5, color: 'leaves', attachedTo: ['④の木・幹'] });
// 倒木：下の端は地面（上面 0.3 = 太さ）、上の端は④の幹に寄りかかる（傾き約 26°）
solids.push({
  kind: 'beam', name: '倒木', p1: [3.3, 0.3, 1.3], p2: [2.3, 1.5, -0.95], width: 0.35, thickness: 0.3, color: 'bark',
  attachedTo: ['④の木・幹'],
});
// ④の横枝：幹の右側から塀の手前へ（2.3 → 2.65、傾き約 5°）。先から塀まで 0.75
solids.push({
  kind: 'beam', name: '④の横枝', p1: [2.3, 2.3, -1.3], p2: [2.9, 2.65, -5.2], width: 0.3, thickness: 0.18, color: 'branch',
  attachedTo: ['④の木・幹'],
});

// ---------------------------------------------------------------
// ルート C：岩を跳び移って塀の上へ
//   地面に置く岩は、すそを広く（下の輪 = 中の輪と同じ半径）して下をえぐらない。
//   えぐれていると、猫が岩のふくらみの下に潜り込み、跳ぶと頭が当たって上がれない。
// ---------------------------------------------------------------
solids.push({ kind: 'clump', name: '岩①', x: -3.6, y: 0.3, z: -2.0, r: 0.7, ry: 0.3, bottomRatio: 1.0, color: 'rock' }); // 上面 0.6
solids.push({ kind: 'clump', name: '岩②', x: -4.3, y: 0.6, z: -3.4, r: 0.6, ry: 0.6, bottomRatio: 1.0, color: 'rock' }); // 上面 1.2
solids.push({ kind: 'clump', name: '岩③', x: -4.6, y: 0.85, z: -4.9, r: 0.55, ry: 0.85, bottomRatio: 1.0, color: 'rock' }); // 上面 1.7

// ---------------------------------------------------------------
// 背景の木（幹は登れない・枝なし）
// ---------------------------------------------------------------
const sceneryTrees: Array<[string, number, number]> = [
  ['背景の木A', -2.6, 4.0],
  ['背景の木B', 3.6, 4.2],
  ['背景の木C', -2.4, 0.4],
  ['背景の木D', -3.0, -9.0],
  ['背景の木E', 3.2, -9.8],
  ['背景の木F', -1.8, -11.4],
  ['背景の木G', 2.0, -11.5],
];
for (const [name, x, z] of sceneryTrees) {
  solids.push({ kind: 'cylinder', name: `${name}・幹`, x, z, r: 0.3, bottom: 0, top: 4.6, color: 'bark' });
  solids.push({ kind: 'clump', name: `${name}・樹冠`, x, y: CANOPY_Y, z, r: 1.3, ry: 0.5, color: 'leaves', attachedTo: [`${name}・幹`] });
}

// ---------------------------------------------------------------
// 爪の対象
// ---------------------------------------------------------------
const interactables: InteractableDef[] = [
  // ツタ：①の幹の正面（z 3.0）に絡む「登れる範囲」。当たり判定は持たず（ぶつかるのは幹）、段差もない。
  //   範囲 x -0.15〜0.15、z 2.9〜3.02（幹の表面より 2cm 手前まで）、高さ 0〜2.1（股まで）
  {
    kind: 'climbable', name: 'ツタ', look: 'vine', sensor: true, embeddedIn: '①の木・幹',
    x: 0, z: 2.96, w: 0.3, d: 0.12, top: 2.1, h: 2.1,
  },
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
  solids,
  interactables,
  start: { x: 0, y: 0, z: 5.2, facing: 0 },
  sky: 0xbcd8e6,
};

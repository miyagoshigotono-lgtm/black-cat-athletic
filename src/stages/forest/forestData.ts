/**
 * Stage 1「工場の裏の森」（チュートリアル）の配置データ（グレーボックス・第4版）。
 *
 * 第4版の変更（作者のテストプレイを受けて）：
 *  - **長さを倍に**（z −13〜7.5 の 20.5m → z −32〜8 の 40m）。
 *  - **岩づたいに塀を越える道を廃止**。岩は登っても最高 1.2 までで、塀（2.4）には届かない。
 *    「簡単すぎる」という指摘のとおり、岩はただの障害物・目くらましに戻した。
 *  - **木から木への分岐を増やした**。塀を越える所が 4 か所ある（③の葉／⑦／④／⑤）。
 *  - **木のてっぺん（樹冠）に乗れるようにした**。塀の向こうは樹冠を飛び石のように渡る林冠ルート。
 *  - 走る（3.0）と歩く（1.0）に分かれたので、**跳躍はすべて走り基準**で引き直した。
 *    走って跳ぶと水平 1.90m（高低差なし）／1.78m（+0.2）／1.62m（+0.5）／1.47m（+0.7）。
 *
 * 道のり：
 *   区間0 スタート（z 3〜8）  工場の裏手。物置小屋のドアを爪で開けて中のご飯皿に触れる（爪の体験）
 *   区間1 塀越え（z −7〜3）   ツタの木①から枝づたいに高さを稼ぎ、板塀（2.4・登れない）を越える
 *   区間2 林冠（z −15〜−7）   木のてっぺんを渡って、崖の上（4.0）へ
 *   区間3 台地（z −32〜−16）  崖の上の森。奥に捨てられた段ボール（ゴール）
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

/** 区間0〜2 の地面の上面 */
const GROUND = 0;
/** 崖の上（区間3）の地面の上面。ここへは林冠からしか降りられない */
const PLATEAU = 4.0;

/**
 * 枝のない木（幹＋樹冠）。森を埋める。
 * 第4版から**樹冠の上に乗れる**ので、樹冠の高さは「渡れるかどうか」に効く。
 */
function tree(name: string, x: number, z: number, o: {
  /** 幹の太さ */ r: number;
  /** 幹の上端 */ trunk: number;
  /** 樹冠の中心の高さ */ y: number;
  /** 樹冠の横の半径 */ cr: number;
  /** 樹冠の縦の半径 */ ry?: number;
  /** 幹の足元の高さ（台地の上なら PLATEAU） */ base?: number;
}): void {
  const ry = o.ry ?? 0.45;
  solids.push({ kind: 'cylinder', name: `${name}・幹`, x, z, r: o.r, bottom: o.base ?? GROUND, top: o.trunk, color: 'bark' });
  solids.push({ kind: 'clump', name: `${name}・樹冠`, x, y: o.y, z, r: o.cr, ry, color: 'leaves', attachedTo: [`${name}・幹`] });
}

/** 地面の岩。すそを広くして、下をえぐらない */
function rock(name: string, x: number, z: number, r: number, ry: number, base = GROUND): void {
  solids.push({ kind: 'clump', name, x, y: base + ry, z, r, ry, bottomRatio: 1.0, color: 'rock' });
}

/** 切り株（低い円柱） */
function stump(name: string, x: number, z: number, r: number, top: number, base = GROUND): void {
  solids.push({ kind: 'cylinder', name, x, z, r, bottom: base, top, color: 'bark' });
}

/** 地面に生えた下草・落ち葉の塊 */
function undergrowth(name: string, x: number, z: number, r: number, ry: number, color: BoxColor = 'leaves', base = GROUND): void {
  solids.push({ kind: 'clump', name, x, y: base + ry, z, r, ry, bottomRatio: 1.0, color });
}

// ---------------------------------------------------------------
// 地面と外周（遊べる範囲：x −8〜8、z −32〜8）
// ---------------------------------------------------------------
// 地面は1枚（z −32〜8.125）。外周の茂みも、ゴールも、すべてこの範囲の内側に収める
boxes.push({ name: '地面', x: 0, z: -11.9375, w: 16, d: 40.25, top: GROUND, h: 0.5, color: 'ground', isGround: true });
/**
 * 崖（台地）。地面の上に載せた大きな塊で、上面 4.0・手前の面（z −16.125）が崖になる。
 * 地面（0）から跳んでも 1.0 しか上がれないので、ここへは**林冠を渡ってしか行けない**。
 */
boxes.push({ name: '台地', x: 0, z: -23.8125, w: 15, d: 15.375, top: PLATEAU, h: PLATEAU, color: 'ground' });

boxes.push(block('工場の壁', 0, 7.875, 15, 0.5, 6, 'factory'));
// 茂みは台地の上まで覆うので、上面は台地（4.0）＋5
boxes.push(block('茂み・西', -7.75, -11.9375, 0.5, 40.25, 9, 'bush'));
boxes.push(block('茂み・東', 7.75, -11.9375, 0.5, 40.25, 9, 'bush'));
boxes.push(block('茂み・奥', 0, -31.75, 15, 0.5, 9, 'bush'));

// 板塀（高さ 2.4、登れない）
boxes.push(block('板塀', 0, -7.0, 15, 0.2, 2.4, 'boards'));

// ---------------------------------------------------------------
// 区間0：スタート（工場の裏手）
// 物置小屋のドアを爪で開けると、中に古いご飯皿がある（爪＝環境操作の体験）
// ---------------------------------------------------------------
boxes.push(block('小屋・西壁', -5.2, 5.5, 0.2, 2.2, 1.6, 'boards'));
boxes.push(block('小屋・東壁', -2.8, 5.5, 0.2, 2.2, 1.6, 'boards'));
boxes.push(block('小屋・南壁', -4.0, 6.5, 2.2, 0.2, 1.6, 'boards'));
boxes.push(block('小屋・北壁（東）', -3.55, 4.5, 1.3, 0.2, 1.6, 'boards'));
boxes.push({ name: '小屋の屋根', x: -4.0, z: 5.5, w: 2.6, d: 2.4, top: 1.8, h: 0.2, color: 'boards' });
boxes.push(block('小屋の中の木箱', -4.7, 6.0, 0.6, 0.6, 0.5, 'cardboard'));

// 工場の裏手に置かれた物（「工場の裏の森」であることを見せる）
boxes.push(block('積んだ木材', -0.8, 7.1, 1.8, 0.7, 0.5, 'boards'));
solids.push({ kind: 'cylinder', name: 'ドラム缶1', x: 1.3, z: 7.1, r: 0.3, bottom: 0, top: 0.9, color: 'metal' });
solids.push({ kind: 'cylinder', name: 'ドラム缶2', x: 2.0, z: 7.1, r: 0.3, bottom: 0, top: 0.9, color: 'metal' });
undergrowth('古いタイヤ', 3.3, 7.0, 0.45, 0.16, 'bark');
boxes.push(block('配電盤', 5.4, 7.3, 0.8, 0.35, 1.4, 'metal'));
solids.push({ kind: 'cylinder', name: '植木鉢', x: -2.2, z: 6.2, r: 0.22, bottom: 0, top: 0.35, color: 'boards' });
boxes.push(block('じょうろ', -5.8, 6.0, 0.3, 0.25, 0.3, 'metal'));

// ---------------------------------------------------------------
// 区間1：塀越え。ツタの木①から、枝づたいに4方向へ分かれる
//
//   ①(2.1) ─西→ ②(2.7) ─北→ ③(3.5) → 塀の上の葉(4.05) ──→ 塀の上を渡る
//           │            └北西→ ⑦(3.2) ────────────────→ 枝先から塀を跳び越える
//           └東→ ⑥(2.6) ─北→ ④(3.2) ─北────────────────→ 枝先から塀を跳び越える
//                                      └東→ ⑤(3.6) ─────→ 枝先から塀を跳び越える
//   倒木（右手・ツタを使わない道）──────→ ⑥(2.6) へ合流
// ---------------------------------------------------------------

// ①ツタの木：股 2.1。ツタは正面（+Z 側）に絡む。スタートから必ず目に入る位置
solids.push({ kind: 'cylinder', name: '①の木・幹', x: 0.2, z: 2.8, r: 0.42, bottom: 0, top: 2.1, color: 'bark' });
solids.push({ kind: 'cylinder', name: '①の木・上の幹', x: 0.5, z: 2.6, r: 0.18, bottom: 2.1, top: 4.3, color: 'bark', attachedTo: ['①の木・幹'] });
solids.push({ kind: 'clump', name: '①の木・樹冠', x: 0.4, y: 4.7, z: 2.6, r: 1.3, ry: 0.5, color: 'leaves', attachedTo: ['①の木・上の幹'] });
// 股から3本。西は②へ、東は⑥へ、南は行き止まり
solids.push({
  kind: 'beam', name: '①の枝（西）', p1: [0.2, 2.1, 2.6], p2: [-1.3, 2.45, 1.4], width: 0.24, thickness: 0.16, color: 'branch',
  attachedTo: ['①の木・幹'],
});
solids.push({
  kind: 'beam', name: '①の枝（東）', p1: [0.35, 2.1, 2.45], p2: [1.9, 2.4, 1.9], width: 0.24, thickness: 0.16, color: 'branch',
  attachedTo: ['①の木・幹'],
});
solids.push({
  kind: 'beam', name: '①の枝（南・行き止まり）', p1: [0.3, 2.1, 3.0], p2: [1.2, 2.3, 4.3], width: 0.22, thickness: 0.16, color: 'branch',
  attachedTo: ['①の木・幹'],
});

// ②の木：股 2.7。①の枝（西）の先から 1.77m（走ってギリギリ）
solids.push({ kind: 'cylinder', name: '②の木・幹', x: -2.6, z: 0.2, r: 0.40, bottom: 0, top: 2.7, color: 'bark' });
solids.push({ kind: 'cylinder', name: '②の木・上の幹', x: -2.85, z: -0.05, r: 0.18, bottom: 2.7, top: 4.4, color: 'bark', attachedTo: ['②の木・幹'] });
solids.push({ kind: 'clump', name: '②の木・樹冠', x: -2.7, y: 4.8, z: 0.0, r: 1.3, ry: 0.5, color: 'leaves', attachedTo: ['②の木・上の幹'] });
solids.push({
  kind: 'beam', name: '②の枝（北）', p1: [-2.6, 2.7, -0.1], p2: [-3.0, 3.1, -2.0], width: 0.22, thickness: 0.16, color: 'branch',
  attachedTo: ['②の木・幹'],
});
solids.push({
  kind: 'beam', name: '②の枝（北西）', p1: [-2.95, 2.7, 0.15], p2: [-4.0, 3.05, -1.3], width: 0.22, thickness: 0.16, color: 'branch',
  attachedTo: ['②の木・幹'],
});
solids.push({
  kind: 'beam', name: '②の枝（南・行き止まり）', p1: [-2.4, 2.7, 0.5], p2: [-1.6, 2.85, 1.9], width: 0.22, thickness: 0.16, color: 'branch',
  attachedTo: ['②の木・幹'],
});

// ③の木：股 3.5（この森でいちばん高い股）。②の枝（北）の先から 1.71m・+0.4
solids.push({ kind: 'cylinder', name: '③の木・幹', x: -3.6, z: -3.6, r: 0.36, bottom: 0, top: 3.5, color: 'bark' });
solids.push({ kind: 'cylinder', name: '③の木・上の幹', x: -3.8, z: -3.85, r: 0.16, bottom: 3.5, top: 4.6, color: 'bark', attachedTo: ['③の木・幹'] });
solids.push({ kind: 'clump', name: '③の木・樹冠', x: -3.7, y: 5.0, z: -3.8, r: 1.25, ry: 0.5, color: 'leaves', attachedTo: ['③の木・上の幹'] });
// 塀の方へ伸びる細い枝（幅 0.20：猫の幅 0.14 に対して余裕が少ない）
solids.push({
  kind: 'beam', name: '③の細い枝', p1: [-3.4, 3.5, -3.9], p2: [-2.6, 3.6, -6.0], width: 0.2, thickness: 0.14, color: 'branch',
  attachedTo: ['③の木・幹', '塀の上の葉'],
});
// 塀の上の葉：上面 4.05、下端 3.35（塀 2.4 より上）。平らな所が塀の線（z −7.0）をまたぐ
solids.push({ kind: 'clump', name: '塀の上の葉', x: -2.2, y: 3.7, z: -7.0, r: 1.1, ry: 0.35, color: 'leaves', attachedTo: ['③の細い枝'] });

// ⑦の木：股 3.2。②の枝（北西）の先から 1.39m
solids.push({ kind: 'cylinder', name: '⑦の木・幹', x: -5.2, z: -2.0, r: 0.34, bottom: 0, top: 3.2, color: 'bark' });
solids.push({ kind: 'cylinder', name: '⑦の木・上の幹', x: -5.4, z: -2.2, r: 0.16, bottom: 3.2, top: 4.4, color: 'bark', attachedTo: ['⑦の木・幹'] });
solids.push({ kind: 'clump', name: '⑦の木・樹冠', x: -5.3, y: 4.8, z: -2.1, r: 1.2, ry: 0.5, color: 'leaves', attachedTo: ['⑦の木・上の幹'] });
// 枝の先から塀（1.4m 先・2.4）を走って跳び越える
solids.push({
  kind: 'beam', name: '⑦の枝（北）', p1: [-5.2, 3.2, -2.2], p2: [-4.8, 3.5, -5.6], width: 0.22, thickness: 0.16, color: 'branch',
  attachedTo: ['⑦の木・幹'],
});

// ⑥の木：股 2.6。①の枝（東）の先から 1.84m（走ってギリギリ）。倒木からも上がれる
solids.push({ kind: 'cylinder', name: '⑥の木・幹', x: 3.2, z: 0.6, r: 0.38, bottom: 0, top: 2.6, color: 'bark' });
solids.push({ kind: 'cylinder', name: '⑥の木・上の幹', x: 3.4, z: 0.4, r: 0.17, bottom: 2.6, top: 4.3, color: 'bark', attachedTo: ['⑥の木・幹'] });
solids.push({ kind: 'clump', name: '⑥の木・樹冠', x: 3.3, y: 4.7, z: 0.5, r: 1.25, ry: 0.5, color: 'leaves', attachedTo: ['⑥の木・上の幹'] });
solids.push({
  kind: 'beam', name: '⑥の枝（北）', p1: [3.2, 2.6, 0.2], p2: [3.0, 3.0, -1.6], width: 0.22, thickness: 0.16, color: 'branch',
  attachedTo: ['⑥の木・幹'],
});
solids.push({
  kind: 'beam', name: '⑥の枝（東・行き止まり）', p1: [3.5, 2.6, 0.8], p2: [5.0, 2.75, 1.6], width: 0.22, thickness: 0.16, color: 'branch',
  attachedTo: ['⑥の木・幹'],
});

// ④の木：股 3.2。⑥の枝（北）の先から 1.65m・+0.2
solids.push({ kind: 'cylinder', name: '④の木・幹', x: 2.6, z: -3.2, r: 0.44, bottom: 0, top: 3.2, color: 'bark' });
// 上の幹は、股から出る枝の根もとと重ならない位置に立てる
// （重なると、股に乗った猫が枝へ歩いて移れず、脇から落ちる）
solids.push({ kind: 'cylinder', name: '④の木・上の幹', x: 2.35, z: -2.95, r: 0.18, bottom: 3.2, top: 4.5, color: 'bark', attachedTo: ['④の木・幹'] });
solids.push({ kind: 'clump', name: '④の木・樹冠', x: 2.7, y: 4.9, z: -3.3, r: 1.35, ry: 0.5, color: 'leaves', attachedTo: ['④の木・上の幹'] });
// 枝の先から塀（1.2m 先）を跳び越える
solids.push({
  kind: 'beam', name: '④の枝（北）', p1: [2.6, 3.2, -3.6], p2: [2.2, 3.5, -5.8], width: 0.24, thickness: 0.16, color: 'branch',
  attachedTo: ['④の木・幹'],
});
solids.push({
  // 根もとは幹の中（2.8, −3.3）から出す。幹の縁から出すと、幹の天面から枝へ乗り移れない
  kind: 'beam', name: '④の枝（東）', p1: [2.8, 3.2, -3.3], p2: [4.2, 3.4, -4.4], width: 0.22, thickness: 0.16, color: 'branch',
  attachedTo: ['④の木・幹'],
});

// ⑤の木：股 3.6。④の枝（東）の先から 1.34m
solids.push({ kind: 'cylinder', name: '⑤の木・幹', x: 5.4, z: -5.0, r: 0.36, bottom: 0, top: 3.6, color: 'bark' });
solids.push({ kind: 'cylinder', name: '⑤の木・上の幹', x: 5.6, z: -5.2, r: 0.16, bottom: 3.6, top: 4.6, color: 'bark', attachedTo: ['⑤の木・幹'] });
solids.push({ kind: 'clump', name: '⑤の木・樹冠', x: 5.5, y: 5.0, z: -5.1, r: 1.2, ry: 0.5, color: 'leaves', attachedTo: ['⑤の木・上の幹'] });
solids.push({
  kind: 'beam', name: '⑤の枝（北）', p1: [5.4, 3.6, -5.3], p2: [5.0, 3.8, -6.4], width: 0.22, thickness: 0.16, color: 'branch',
  attachedTo: ['⑤の木・幹'],
});

// 倒木（右手）：⑥の木に立てかけてある。傾き 27°（歩いて上れる上限 30°）
solids.push({
  kind: 'beam', name: '倒木', p1: [5.6, 0.35, 4.0], p2: [3.45, 2.2, 0.85], width: 0.38, thickness: 0.35, color: 'bark',
  attachedTo: ['⑥の木・幹'],
});

// ---------------------------------------------------------------
// 区間2：林冠。塀の向こうから、木のてっぺんを飛び石のように渡って崖の上へ
// 樹冠の中心どうしが 1.6〜1.75m・上昇 0.2 以内（走ってギリギリ）になるよう並べてある
// ---------------------------------------------------------------
// 樹冠の中心どうしの距離と上がり（走って跳べる上限は +0.1 で 1.85m、+0.2 で 1.78m、+0.5 で 1.62m）
//   塀の上の葉(4.05) →O 1.56/+0.35 →O2 1.44/+0.10 →P 1.13/+0.10
//   →Q 1.64/+0.20 →R 1.63/+0.20 →S 1.64/+0.20 →T 1.63/+0.10 → 台地(4.0) へ 2.0m 先・1.3 下り
tree('林冠の木O', -1.2, -8.2, { r: 0.3, trunk: 3.75, y: 3.95, cr: 0.9 });   // 樹冠上面 4.40
tree('林冠の木O2', 0.0, -9.0, { r: 0.3, trunk: 3.85, y: 4.05, cr: 0.9 });   // 4.50
tree('林冠の木P', 0.8, -9.8, { r: 0.32, trunk: 3.95, y: 4.15, cr: 0.9 });   // 4.60
tree('林冠の木Q', -0.5, -10.8, { r: 0.3, trunk: 4.15, y: 4.35, cr: 0.9 });  // 4.80
tree('林冠の木R', 0.7, -11.9, { r: 0.32, trunk: 4.35, y: 4.55, cr: 0.9 });  // 5.00
tree('林冠の木S', -0.6, -12.9, { r: 0.3, trunk: 4.55, y: 4.75, cr: 0.9 });  // 5.20
tree('林冠の木T', 0.6, -14.0, { r: 0.3, trunk: 4.65, y: 4.85, cr: 0.9 });   // 5.30 → 崖の上(4.0)へ降りる

/**
 * 登り返しの木。**この森で唯一の詰み防止**。
 *
 * ③の葉を通らずに塀を跳び越えた猫（④・⑤・⑦のルート）は、塀の向こうの地面に落ちる。
 * 板塀は向こう側からも登れないので、ここに登る道が無いと沢に閉じ込められてしまう。
 * 塀を跳び越えた猫が降りるあたりに立てて、2本目のツタとして見つけてもらう。
 */
solids.push({ kind: 'cylinder', name: '登り返しの木・幹', x: 3.0, z: -8.6, r: 0.42, bottom: 0, top: 3.8, color: 'bark' });
solids.push({
  // 幹の上から林冠へ渡す太い枝。先から 林冠の木P（4.60）へ 1.25m・+0.5
  kind: 'beam', name: '登り返しの木の枝', p1: [3.0, 3.8, -8.6], p2: [1.9, 4.1, -9.2], width: 0.4, thickness: 0.2, color: 'branch',
  attachedTo: ['登り返しの木・幹'],
});

// 区間2 の地上（落ちたときに歩く所）。岩と倒木を置くが、どれも登っても 1.2 まで
rock('沢の岩A', -4.6, -9.0, 0.8, 0.5);
rock('沢の岩B', -5.4, -11.5, 0.75, 0.6);
rock('沢の岩C', 4.8, -12.6, 0.8, 0.55);
solids.push({
  kind: 'beam', name: '横たわる倒木（沢）', p1: [-6.6, 0.3, -13.4], p2: [-4.2, 0.3, -14.6], width: 0.4, thickness: 0.3, color: 'bark',
});

// ---------------------------------------------------------------
// 区間3：崖の上の森。奥に捨てられた段ボール（ゴール）
// ---------------------------------------------------------------
tree('台地の木A', -4.4, -18.0, { r: 0.32, trunk: 8.3, y: 8.7, cr: 1.3, base: PLATEAU });
tree('台地の木B', 4.0, -19.2, { r: 0.3, trunk: 8.2, y: 8.6, cr: 1.25, base: PLATEAU });
tree('台地の木C', -2.0, -22.5, { r: 0.3, trunk: 8.3, y: 8.7, cr: 1.3, base: PLATEAU });
tree('台地の木D', 5.2, -24.0, { r: 0.28, trunk: 8.1, y: 8.5, cr: 1.2, base: PLATEAU });
tree('台地の木E', -5.6, -26.0, { r: 0.3, trunk: 8.2, y: 8.6, cr: 1.25, base: PLATEAU });
tree('台地の木F', 2.6, -28.5, { r: 0.3, trunk: 8.3, y: 8.7, cr: 1.3, base: PLATEAU });
tree('台地の木G', -3.4, -30.0, { r: 0.28, trunk: 8.1, y: 8.5, cr: 1.2, base: PLATEAU });

rock('台地の岩A', 2.0, -17.4, 0.9, 0.55, PLATEAU);
rock('台地の岩B', -6.2, -21.0, 0.8, 0.5, PLATEAU);
rock('台地の岩C', 6.0, -27.2, 0.85, 0.6, PLATEAU);
stump('台地の切り株A', 0.8, -20.4, 0.42, PLATEAU + 0.5, PLATEAU);
stump('台地の切り株B', -1.2, -27.0, 0.4, PLATEAU + 0.45, PLATEAU);
solids.push({
  kind: 'beam', name: '横たわる倒木（台地）', p1: [-5.4, PLATEAU + 0.3, -23.5], p2: [-3.0, PLATEAU + 0.3, -24.4], width: 0.42, thickness: 0.3, color: 'bark', attachedTo: ['台地'],
});
boxes.push({ name: '捨てられた板', x: 2.2, z: -25.4, w: 1.4, d: 0.9, top: PLATEAU + 0.12, h: 0.12, color: 'boards' });

// ---------------------------------------------------------------
// 行き止まり・目くらまし（道に見えるが、そこから先が無い）
// 岩は**どれも上面 1.2 以下**。いちばん高い岩に乗って跳んでも 2.2 で、板塀（2.4）には届かない
// ---------------------------------------------------------------
rock('岩A', -4.6, -0.6, 0.8, 0.3);   // 上面 0.6
rock('岩B', -5.4, -1.9, 0.7, 0.5);   // 1.0
rock('岩C', -4.8, -3.4, 0.7, 0.6);   // 1.2
rock('岩D', -6.4, -4.6, 0.65, 0.55); // 1.1
rock('岩E', 2.2, 1.8, 0.8, 0.6);     // 1.2
rock('岩F', 1.2, 1.0, 0.7, 0.35);
rock('岩G', -2.6, 3.6, 0.6, 0.5);
rock('岩H', 0.5, -1.5, 0.7, 0.45);
rock('岩I', -1.4, -5.2, 0.55, 0.6);
rock('岩J', 1.4, -4.4, 0.65, 0.4);
solids.push({
  kind: 'beam', name: '横たわる倒木', p1: [6.2, 0.3, -1.0], p2: [5.2, 0.3, -3.2], width: 0.4, thickness: 0.3, color: 'bark',
});

// 森を埋める木（枝なし。樹冠には乗れるが、そこから先がない物も混ぜる）
const plain: Array<[string, number, number, number, number, number]> = [
  // 名前, x, z, 幹の太さ, 幹の上端, 樹冠の横半径
  ['背景の木A', -1.4, 5.0, 0.3, 4.4, 1.3],
  ['背景の木B', 2.2, 4.0, 0.28, 4.3, 1.25],
  ['背景の木C', -6.0, 2.4, 0.32, 4.5, 1.3],
  ['背景の木D', 6.2, 1.6, 0.3, 4.4, 1.2],
  ['背景の木E', -6.1, -0.6, 0.26, 4.2, 1.2],
  ['背景の木F', 0.6, -2.6, 0.3, 4.4, 1.25],
  ['背景の木G', 6.1, -3.0, 0.28, 4.3, 1.2],
  ['背景の木H', 6.0, -7.6, 0.3, 4.4, 1.3],
  ['背景の木I', -6.0, -8.4, 0.3, 4.4, 1.3],
  ['背景の木J', 6.0, -9.0, 0.28, 4.2, 1.2],
  ['背景の木K', -6.1, -12.6, 0.3, 4.3, 1.25],
  ['背景の木L', 3.4, -14.4, 0.26, 4.2, 1.2],
  ['背景の木M', 6.1, -15.0, 0.28, 4.3, 1.2],
];
for (const [name, x, z, r, trunk, cr] of plain) tree(name, x, z, { r, trunk, y: trunk + 0.4, cr });

// 下草・切り株（見た目の密度。どれも低く、道には関わらない）
stump('切り株A', -6.0, 3.3, 0.38, 0.45);
stump('切り株B', 6.0, -1.9, 0.34, 0.38);
stump('切り株C', -1.3, -2.3, 0.36, 0.42);
stump('切り株D', 5.6, -9.4, 0.4, 0.5);
for (const [i, [x, z, r, ry]] of ([
  [-6.2, 5.0, 0.5, 0.22], [0.8, 4.6, 0.55, 0.24], [4.0, 2.6, 0.5, 0.2],
  [-3.6, 1.2, 0.55, 0.22], [1.8, -2.8, 0.5, 0.2], [-2.3, -0.9, 0.5, 0.24],
  [6.2, 3.4, 0.55, 0.22], [-6.8, -5.6, 0.5, 0.22], [6.8, -5.4, 0.5, 0.2],
  // 塀の向こう（区間2）
  [-3.0, -8.4, 0.55, 0.22], [3.6, -11.4, 0.5, 0.2], [-6.2, -14.4, 0.55, 0.24],
  [5.6, -8.4, 0.5, 0.2], [0.8, -13.2, 0.5, 0.22],
] as const).entries()) {
  undergrowth(`下草${i + 1}`, x, z, r, ry);
}
// 台地の上の下草
for (const [i, [x, z, r, ry]] of ([
  [-2.6, -17.6, 0.55, 0.22], [5.0, -21.4, 0.5, 0.2], [-6.6, -24.6, 0.55, 0.24],
  [1.0, -23.2, 0.5, 0.2], [-4.0, -28.6, 0.55, 0.22], [6.4, -30.4, 0.5, 0.2],
  [3.8, -26.2, 0.5, 0.22],
] as const).entries()) {
  undergrowth(`台地の下草${i + 1}`, x, z, r, ry, 'leaves', PLATEAU);
}
undergrowth('落ち葉の山1', -0.6, 1.0, 0.8, 0.12, 'bark');
undergrowth('落ち葉の山2', 2.0, -12.0, 0.75, 0.12, 'bark');
undergrowth('落ち葉の山3', -1.8, -19.6, 0.8, 0.12, 'bark', PLATEAU);

// ---------------------------------------------------------------
// 爪の対象
// ---------------------------------------------------------------
const GOAL_Z = -26.4;
const interactables: InteractableDef[] = [
  // 物置小屋のドア（爪で開け閉め）と、中の古いご飯皿
  {
    kind: 'door', name: '小屋のドア',
    hingeX: -5.1, hingeZ: 4.5, width: 0.9, height: 1.5, thickness: 0.06, bottomGap: 0.02, baseYaw: 0,
  },
  { kind: 'dish', name: '古いご飯皿', x: -3.7, z: 5.8, radius: 0.1, height: 0.04 },
  // ツタ：①の幹の正面（表面 z 3.22）に絡む「登れる範囲」。当たり判定は持たない（ぶつかるのは幹）
  {
    kind: 'climbable', name: 'ツタ', look: 'vine', sensor: true, embeddedIn: '①の木・幹',
    x: 0.2, z: 3.18, w: 0.3, d: 0.12, top: 2.1, h: 2.1,
  },
  // 登り返しの木のツタ（塀の向こうの地面に落ちたとき、ここから林冠へ戻る）
  {
    kind: 'climbable', name: '登り返しのツタ', look: 'vine', sensor: true, embeddedIn: '登り返しの木・幹',
    x: 3.0, z: -8.22, w: 0.3, d: 0.12, top: 3.8, h: 3.8,
  },
  { kind: 'goal', name: '段ボール', x: 0, z: GOAL_Z, baseY: PLATEAU, w: 0.6, d: 0.45, height: 0.3, wall: 0.02 },
  { kind: 'dish', name: 'ご飯皿', x: 0.75, z: GOAL_Z + 0.4, radius: 0.09, height: 0.04, baseY: PLATEAU },
];

// 傘の柄（当たり判定あり）：段ボールの右壁（x 0.3）のすぐ外。傘の布は見た目だけ（Goal が描く）
boxes.push({ name: '傘の柄', x: 0.335, z: GOAL_Z, w: 0.03, d: 0.03, top: PLATEAU + 1.0, h: 1.0, color: 'metal' });

export const FOREST_STAGE: StageDef = {
  id: 'forest',
  name: '工場の裏の森',
  boxes,
  solids,
  interactables,
  start: { x: 0, y: 0, z: 5.2, facing: 0 },
  sky: 0xbcd8e6,
  // 導入演出：ゴールから崖を越えて、森の上を通ってスタート地点へ
  introPath: [[0, PLATEAU + 3.5, -22.0], [0, 11.0, -12.0], [0, 12.0, -2.0], [1.5, 8.0, 8.0]],
};

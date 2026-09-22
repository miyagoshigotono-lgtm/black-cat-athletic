/**
 * ステージの配置データの型。
 * 配置データのファイルは描画・物理のモジュールに依存しない（Node から直接検算できるようにするため）。
 *
 * 座標の約束：単位はメートル、Y が上、地面の上面を y = 0 とする。
 * 箱は「上面の高さ top」と「厚み h」で指定する。底面 = top - h、中心 y = top - h / 2。
 */

export type BoxColor =
  | 'ground'
  | 'wall'
  | 'step'
  | 'platform'
  | 'fence'
  | 'furniture'
  | 'tunnel'
  | 'factory'
  | 'bush'
  | 'bark'
  | 'branch'
  | 'leaves'
  | 'rock'
  | 'boards'
  | 'cardboard'
  | 'metal';

export interface BoxDef {
  /** 識別名（検算ログ用） */
  name: string;
  /** 中心の X */
  x: number;
  /** 中心の Z */
  z: number;
  /** X 方向の幅 */
  w: number;
  /** Z 方向の奥行き */
  d: number;
  /** 上面の高さ */
  top: number;
  /** 厚み（Y 方向） */
  h: number;
  color: BoxColor;
  /** 地面そのもの（支持判定の対象外） */
  isGround?: boolean;
  /**
   * 横から支えられている物（木から張り出した枝など）。
   * 下からの支持の代わりに、ここに挙げた箱の側面に接していることを検算する。
   */
  attachedTo?: string[];
}

/** 登れる面（金網・ツタ）。箱として置き、上面 top・厚み h で指定する */
export interface ClimbableDef {
  kind: 'climbable';
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  top: number;
  h: number;
  /** 見た目（登れる動作はどちらも同じ） */
  look: 'mesh' | 'vine';
  /**
   * 埋め込み先の箱の名前。指定すると、この面は埋め込み先の表面とぴったりそろい（はみ出さない）、
   * 埋め込み先との重なりは検算で許す。壁沿いに歩いたとき段差に引っかからないようにするため。
   */
  embeddedIn?: string;
}

/** 開閉するドア。蝶番（回転軸）の位置から +X 方向（baseYaw で回転）に板が伸びる */
export interface DoorDef {
  kind: 'door';
  name: string;
  /** 蝶番の位置（板の厚みの中心線上） */
  hingeX: number;
  hingeZ: number;
  width: number;
  height: number;
  thickness: number;
  /** 床からのすき間（床と常に接触しないように） */
  bottomGap: number;
  /** 閉じた状態の向き（Y軸回り）。0 で板は +X 方向へ伸びる */
  baseYaw: number;
}

/**
 * ゴール：上の開いた段ボール箱（中に布、横に傘）。爪を当てるとクリア。
 * 箱は X 方向に長い向きで置く。壁・底の箱は cardboardParts() で求める。
 */
export interface GoalDef {
  kind: 'goal';
  name: string;
  /** 箱の中心 */
  x: number;
  z: number;
  /** 外寸：X 方向の長さ・Z 方向の奥行き・高さ */
  w: number;
  d: number;
  height: number;
  /** 段ボールの厚み */
  wall: number;
}

/** ご飯皿：爪を当てると揺れる（反応するがクリアではない） */
export interface DishDef {
  kind: 'dish';
  name: string;
  x: number;
  z: number;
  radius: number;
  height: number;
}

export type InteractableDef = ClimbableDef | DoorDef | GoalDef | DishDef;

/** ステージ全体 */
export interface StageDef {
  id: string;
  /** 表示名 */
  name: string;
  boxes: readonly BoxDef[];
  interactables: readonly InteractableDef[];
  /** 開始地点（猫の足元）と向き（0 で -Z を向く） */
  start: { x: number; y: number; z: number; facing: number };
  /** 背景色（空） */
  sky: number;
  /** 地面に 1m 間隔の目盛りを出すか（検証用） */
  showGrid?: boolean;
}

/**
 * 段ボール箱（ゴール）を構成する箱：底・左右の壁・前後の壁。
 * 底は壁の内側に収め、壁と重ならないようにする。
 */
export function cardboardParts(g: GoalDef): BoxDef[] {
  const hw = g.w / 2;
  const hd = g.d / 2;
  const t = g.wall;
  const innerW = g.w - 2 * t;
  const innerD = g.d - 2 * t;
  const color = 'cardboard' as const;
  return [
    { name: `${g.name}・底`, x: g.x, z: g.z, w: innerW, d: innerD, top: t, h: t, color },
    { name: `${g.name}・左壁`, x: g.x - hw + t / 2, z: g.z, w: t, d: g.d, top: g.height, h: g.height, color },
    { name: `${g.name}・右壁`, x: g.x + hw - t / 2, z: g.z, w: t, d: g.d, top: g.height, h: g.height, color },
    { name: `${g.name}・奥壁`, x: g.x, z: g.z - hd + t / 2, w: innerW, d: t, top: g.height, h: g.height, color },
    { name: `${g.name}・手前壁`, x: g.x, z: g.z + hd - t / 2, w: innerW, d: t, top: g.height, h: g.height, color },
  ];
}

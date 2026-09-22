/**
 * ① 検証コースに置く爪の対象（インタラクタブル）の配置データ。
 * 種類（kind）ごとに必要な寸法だけを持つ。生成は interact/registry.ts が種類ごとに行う。
 *
 * このファイルは他のモジュールに依存しない（Node から直接検算できるようにするため）。
 * 座標の約束は protoCourseData.ts と同じ（単位 m、Y が上、地面の上面 y = 0）。
 */

/** 登れる面（金網など）。箱として置き、上面 top・厚み h で指定する */
export interface ClimbableDef {
  kind: 'climbable';
  name: string;
  x: number;
  z: number;
  /** X 方向の幅 */
  w: number;
  /** Z 方向の奥行き */
  d: number;
  top: number;
  h: number;
}

/** 開閉するドア。蝶番（回転軸）の位置から +X 方向（baseYaw で回転）に板が伸びる */
export interface DoorDef {
  kind: 'door';
  name: string;
  /** 蝶番の位置（板の厚みの中心線上） */
  hingeX: number;
  hingeZ: number;
  /** 板の幅・高さ・厚み */
  width: number;
  height: number;
  thickness: number;
  /** 床からのすき間（床と常に接触しないように） */
  bottomGap: number;
  /** 閉じた状態の向き（Y軸回り）。0 で板は +X 方向へ伸びる */
  baseYaw: number;
}

export type InteractableDef = ClimbableDef | DoorDef;

export const PROTO_INTERACTABLES: readonly InteractableDef[] = [
  // 自立した金網（高さ 2.0、幅 3.0、厚み 0.04）：登ると向こう側へ降りる
  { kind: 'climbable', name: '金網（自立）', x: -1.5, z: 10, w: 3.0, d: 0.04, top: 2.0, h: 2.0 },
  // 登り台（高さ 2.0、protoCourseData の「登り台」）の +Z 面に張った金網：登ると台の上に乗る
  { kind: 'climbable', name: '金網（登り台）', x: -7, z: 11.02, w: 2.0, d: 0.04, top: 2.0, h: 2.0 },
  // 小部屋の入口のドア：戸口 x 4.1〜4.9 に、両側 0.02 のすき間をあけて幅 0.76
  {
    kind: 'door',
    name: '小部屋のドア',
    hingeX: 4.12,
    hingeZ: 10.05,
    width: 0.76,
    height: 1.2,
    thickness: 0.04,
    bottomGap: 0.005,
    baseYaw: 0,
  },
];

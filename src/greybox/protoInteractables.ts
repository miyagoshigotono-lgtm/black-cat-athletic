/**
 * ① 検証コースに置く爪の対象（インタラクタブル）の配置データ。
 * 種類（kind）ごとに必要な寸法だけを持つ。生成は interact/registry.ts が種類ごとに行う。
 * 型は stages/stageTypes.ts（座標の約束も同じ）。
 */

import type { InteractableDef } from '../stages/stageTypes';

export const PROTO_INTERACTABLES: readonly InteractableDef[] = [
  // 自立した金網（高さ 2.0、幅 3.0、厚み 0.04）：登ると向こう側へ降りる
  { kind: 'climbable', name: '金網（自立）', x: -1.5, z: 10, w: 3.0, d: 0.04, top: 2.0, h: 2.0, look: 'mesh' },
  // 登り台（高さ 2.0、protoCourseData の「登り台」）の +Z 面に張った金網：登ると台の上に乗る
  { kind: 'climbable', name: '金網（登り台）', x: -7, z: 11.02, w: 2.0, d: 0.04, top: 2.0, h: 2.0, look: 'mesh' },
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

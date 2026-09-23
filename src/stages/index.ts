import type { StageDef } from './stageTypes';
import { FOREST_STAGE } from './forest/forestData';
import { FACTORY_STAGE } from './factory/factoryData';
import { PROTO_STAGE } from '../greybox/protoStage';
import type { StageEntry } from '../ui/StageSelect';

/** 使えるステージ（URL の ?stage=<id> で直接開ける。検証用） */
const STAGES: Record<string, StageDef> = {
  forest: FOREST_STAGE,
  factory: FACTORY_STAGE,
  proto: PROTO_STAGE,
};

/** ステージ選択画面に並べる物（プレイ順。まだ無いステージは「準備中」） */
export const STAGE_ENTRIES: StageEntry[] = [
  { id: 'forest', label: '1. 工場の裏の森', note: '板塀の向こうの段ボールへ', stage: FOREST_STAGE },
  { id: 'factory', label: '2. 工場の事務所', note: '屋根を越えて、机のキーボードへ', stage: FACTORY_STAGE },
  { id: 'house', label: '3. 家', note: '準備中', stage: undefined },
];

/** URL で直接指定されたステージ（?stage=<id>）。指定が無ければ null（選択画面を出す） */
export function getStageFromUrl(): StageDef | null {
  const id = new URLSearchParams(location.search).get('stage');
  if (!id) return null;
  return STAGES[id] ?? FOREST_STAGE;
}

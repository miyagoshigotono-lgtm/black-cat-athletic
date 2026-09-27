import type { StageDef } from './stageTypes';
import { FOREST_STAGE } from './forest/forestData';
import { FACTORY_STAGE } from './factory/factoryData';
import { HOUSE_STAGE } from './house/houseData';
import { PROTO_STAGE } from '../greybox/protoStage';
import type { StageEntry } from '../ui/StageSelect';

/** 使えるステージ（URL の ?stage=<id> で直接開ける。検証用） */
const STAGES: Record<string, StageDef> = {
  forest: FOREST_STAGE,
  factory: FACTORY_STAGE,
  house: HOUSE_STAGE,
  proto: PROTO_STAGE,
};

/** ステージ選択画面に並べる物（プレイ順。まだ無いステージは「準備中」） */
export const STAGE_ENTRIES: StageEntry[] = [
  { id: 'forest', label: '1. 工場の裏の森', note: '板塀の向こうの段ボールへ', stage: FOREST_STAGE },
  { id: 'factory', label: '2. 工場の事務所', note: '屋根を越えて、机のキーボードへ', stage: FACTORY_STAGE },
  { id: 'house', label: '3. 家', note: '吹き抜けの梁の上、猫ベッドへ', stage: HOUSE_STAGE },
];

/** プレイ順で次のステージ（無ければ null） */
export function nextStage(id: string): StageEntry | null {
  const i = STAGE_ENTRIES.findIndex((e) => e.id === id);
  if (i < 0) return null;
  const next = STAGE_ENTRIES[i + 1];
  return next?.stage ? next : null;
}

/** URL で直接指定されたステージ（?stage=<id>）。指定が無ければ null（選択画面を出す） */
export function getStageFromUrl(): StageDef | null {
  const id = new URLSearchParams(location.search).get('stage');
  if (!id) return null;
  return STAGES[id] ?? FOREST_STAGE;
}

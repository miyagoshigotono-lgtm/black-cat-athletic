import type { StageDef } from './stageTypes';
import { FOREST_STAGE } from './forest/forestData';
import { PROTO_STAGE } from '../greybox/protoStage';

/** 使えるステージ（URL の ?stage=<id> で選ぶ。指定が無ければ森） */
const STAGES: Record<string, StageDef> = {
  forest: FOREST_STAGE,
  proto: PROTO_STAGE,
};

export function getStageFromUrl(): StageDef {
  const id = new URLSearchParams(location.search).get('stage') ?? 'forest';
  return STAGES[id] ?? FOREST_STAGE;
}

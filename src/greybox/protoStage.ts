import type { StageDef } from '../stages/stageTypes.ts';
import { PROTO_COURSE, START_POSITION } from './protoCourseData.ts';
import { PROTO_INTERACTABLES } from './protoInteractables.ts';

/** ① 検証コース（URL に ?stage=proto を付けると開く） */
export const PROTO_STAGE: StageDef = {
  id: 'proto',
  name: '検証コース',
  boxes: PROTO_COURSE,
  interactables: PROTO_INTERACTABLES,
  start: { ...START_POSITION, facing: 0 },
  sky: 0xa9c8e8,
  showGrid: true,
};

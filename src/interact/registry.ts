import type * as THREE from 'three';
import type { Physics } from '../core/Physics';
import type { Interactable } from './Interactable';
import type { InteractableDef } from '../stages/stageTypes';
import { Climbable } from './Climbable';
import { Door } from './Door';
import { Goal } from './Goal';
import { Dish } from './Dish';

/** 対象を作るときに渡す、ステージ側の道具と通知先 */
export interface InteractableContext {
  physics: Physics;
  scene: THREE.Scene;
  /** ゴールに爪を当てたとき */
  onGoal: () => void;
}

/**
 * 配置データの種類（kind）→ 生成処理 の対応表。
 * 新しい種類の対象を追加するときは、Interactable を実装したクラスを作ってここに1行足す。
 */
type Factory<K extends InteractableDef['kind']> = (
  def: Extract<InteractableDef, { kind: K }>,
  ctx: InteractableContext,
) => Interactable;

const factories: { [K in InteractableDef['kind']]: Factory<K> } = {
  climbable: (def, ctx) => new Climbable(def, ctx.physics, ctx.scene),
  door: (def, ctx) => new Door(def, ctx.physics.world, ctx.scene),
  goal: (def, ctx) => new Goal(def, ctx.physics, ctx.scene, ctx.onGoal),
  dish: (def, ctx) => new Dish(def, ctx.physics, ctx.scene),
};

export function createInteractable(def: InteractableDef, ctx: InteractableContext): Interactable {
  const factory = factories[def.kind] as Factory<typeof def.kind>;
  return factory(def as never, ctx);
}

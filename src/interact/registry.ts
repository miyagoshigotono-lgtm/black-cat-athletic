import type * as THREE from 'three';
import type { Physics } from '../core/Physics';
import type { Interactable } from './Interactable';
import type { InteractableDef } from '../greybox/protoInteractables';
import { Climbable } from './Climbable';
import { Door } from './Door';

/**
 * 配置データの種類（kind）→ 生成処理 の対応表。
 * 新しい種類の対象を追加するときは、Interactable を実装したクラスを作ってここに1行足す。
 */
type Factory<K extends InteractableDef['kind']> = (
  def: Extract<InteractableDef, { kind: K }>,
  physics: Physics,
  scene: THREE.Scene,
) => Interactable;

const factories: { [K in InteractableDef['kind']]: Factory<K> } = {
  climbable: (def, physics, scene) => new Climbable(def, physics, scene),
  door: (def, physics, scene) => new Door(def, physics.world, scene),
};

export function createInteractable(def: InteractableDef, physics: Physics, scene: THREE.Scene): Interactable {
  const factory = factories[def.kind] as Factory<typeof def.kind>;
  return factory(def as never, physics, scene);
}

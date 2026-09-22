import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Interactable, ClawHit } from './Interactable';
import type { Physics } from '../core/Physics';
import type { DishDef } from '../stages/stageTypes';

/** 揺れの長さ [s]・最大の傾き [rad]・揺れの速さ [rad/s] */
const WOBBLE_TIME = 0.8;
const WOBBLE_ANGLE = 0.25;
const WOBBLE_SPEED = 28;

/**
 * ご飯皿（SPEC 8.2：反応するがクリアではない）。
 * 爪を当てるとカタカタ揺れる。何度でも同じように揺れる（状態は持たない）。
 */
export class Dish implements Interactable {
  readonly kind = 'dish';
  readonly mode = 'instant' as const;
  readonly name: string;
  readonly colliders: readonly RAPIER.Collider[];
  private readonly mesh: THREE.Group;
  private wobble = -1;

  constructor(def: DishDef, physics: Physics, scene: THREE.Scene) {
    this.name = def.name;
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(def.x, def.height / 2, def.z));
    this.colliders = [physics.world.createCollider(RAPIER.ColliderDesc.cylinder(def.height / 2, def.radius), body)];

    this.mesh = new THREE.Group();
    const dish = new THREE.Mesh(
      new THREE.CylinderGeometry(def.radius, def.radius * 0.8, def.height, 20),
      new THREE.MeshLambertMaterial({ color: 0xd9dde2 }),
    );
    dish.position.y = def.height / 2;
    // 中のご飯（見た目だけ）
    const food = new THREE.Mesh(
      new THREE.CylinderGeometry(def.radius * 0.75, def.radius * 0.75, 0.01, 16),
      new THREE.MeshLambertMaterial({ color: 0x8a5a3a }),
    );
    food.position.y = def.height + 0.002;
    this.mesh.add(dish, food);
    this.mesh.position.set(def.x, 0, def.z);
    scene.add(this.mesh);
  }

  onClaw(_hit: ClawHit): boolean {
    this.wobble = 0;
    return false;
  }

  fixedUpdate(dt: number): void {
    if (this.wobble < 0) return;
    this.wobble += dt;
    const t = this.wobble / WOBBLE_TIME;
    if (t >= 1) {
      this.wobble = -1;
      this.mesh.rotation.set(0, 0, 0);
      return;
    }
    // だんだん小さくなる揺れ
    const a = Math.sin(this.wobble * WOBBLE_SPEED) * WOBBLE_ANGLE * (1 - t);
    this.mesh.rotation.set(a * 0.6, 0, a);
  }
}

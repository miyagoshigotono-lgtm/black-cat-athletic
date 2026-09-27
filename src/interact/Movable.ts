import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Interactable, ClawHit } from './Interactable';
import type { CatController } from '../player/CatController';
import type { Physics } from '../core/Physics';
import type { MovableDef } from '../stages/stageTypes';

/** 押されたときに動く速さ [m/s] */
const SLIDE_SPEED = 1.2;

/**
 * 押して動かせる台車（SPEC 7「決まった位置間のスライド」）。
 * 爪を当てるたびに、ずらした位置 ↔ 元の位置 を行き来する（可逆）。
 * 猫が上に乗っている間は動かない（乗ったまま運ばれて、変な所へ行かないように）。
 */
export class Movable implements Interactable {
  readonly kind = 'movable';
  readonly mode = 'instant' as const;
  readonly name: string;
  readonly colliders: readonly RAPIER.Collider[];

  private readonly body: RAPIER.RigidBody;
  private readonly mesh: THREE.Mesh;
  private readonly world: RAPIER.World;
  private readonly home = new THREE.Vector3();
  private readonly away = new THREE.Vector3();
  private readonly current = new THREE.Vector3();
  private readonly half: { x: number; y: number; z: number };
  /** 今どちらへ向かっているか（null なら止まっている） */
  private goal: THREE.Vector3 | null = null;
  private atHome = true;

  constructor(def: MovableDef, physics: Physics, scene: THREE.Scene) {
    this.name = def.name;
    this.world = physics.world;
    const cy = def.top - def.h / 2;
    this.home.set(def.x, cy, def.z);
    this.away.set(def.x + def.moveX, cy, def.z + def.moveZ);
    this.current.copy(this.home);
    this.half = { x: def.w / 2, y: def.h / 2, z: def.d / 2 };

    // 動かすのでキネマティック（当たり判定は動くが、物理で押されはしない）
    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.home.x, this.home.y, this.home.z),
    );
    this.colliders = [this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(this.half.x, this.half.y, this.half.z),
      this.body,
    )];

    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(def.w, def.h, def.d),
      new THREE.MeshLambertMaterial({ color: 0x9aa3ab }),
    );
    this.mesh.position.copy(this.home);
    scene.add(this.mesh);
  }

  onClaw(_hit: ClawHit, cat: CatController): boolean {
    if (this.goal) return false; // 動いている最中
    if (this.catIsOn(cat)) return false; // 乗っている間は動かない
    this.goal = this.atHome ? this.away : this.home;
    return false;
  }

  fixedUpdate(dt: number, _cat: CatController): void {
    if (!this.goal) return;
    const step = SLIDE_SPEED * dt;
    const left = this.current.distanceTo(this.goal);
    if (left <= step) {
      this.current.copy(this.goal);
      this.atHome = this.goal === this.home;
      this.goal = null;
    } else {
      this.current.lerp(this.goal, step / left);
    }
    this.body.setNextKinematicTranslation(this.current);
    this.mesh.position.copy(this.current);
  }

  /** 猫が台車の上に乗っているか（上面の少し上に体があるか） */
  private catIsOn(cat: CatController): boolean {
    const c = cat.getInterpolatedCenter(1, new THREE.Vector3());
    return Math.abs(c.x - this.current.x) < this.half.x + 0.25
      && Math.abs(c.z - this.current.z) < this.half.z + 0.25
      && c.y > this.current.y && c.y < this.current.y + this.half.y + 0.5;
  }
}

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Interactable, ClawHit } from './Interactable';
import type { CatController } from '../player/CatController';
import type { Physics } from '../core/Physics';
import { conveyorBeam, type ConveyorDef } from '../stages/stageTypes';
import { beamFrame } from '../stages/geometry';
import { CAT_SHAPE } from '../player/CatParams';

/** ベルトの色（止まっている／動いている） */
const COLOR_OFF = 0x7d848c;
const COLOR_ON = 0xc7a44a;

/**
 * 動くベルト（コンベア）。ベルト自体は動かさず、**上に乗っている猫を運ぶ**
 * （SPEC 7「箱の移動は物理ではなく決まった位置間のスライド」と同じ、手続き的な扱い）。
 *
 * 止まっているときはただの坂。急なコンベアは、動かさないと登れない。
 * 爪を当てても動かない（動かすのはスイッチ）。爪には他の物と同じく爪痕だけを返す。
 */
export class Conveyor implements Interactable {
  readonly kind = 'conveyor';
  readonly mode = 'instant' as const;
  readonly name: string;
  readonly colliders: readonly RAPIER.Collider[];

  private running: boolean;
  private readonly world: RAPIER.World;
  private readonly material: THREE.MeshLambertMaterial;
  /** 運ぶ速度（向き × 速さ） */
  private readonly carry = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  constructor(def: ConveyorDef, physics: Physics, scene: THREE.Scene) {
    this.name = def.name;
    this.running = def.on ?? false;
    this.world = physics.world;

    const f = beamFrame(conveyorBeam(def));
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...f.axisX),
      new THREE.Vector3(...f.axisY),
      new THREE.Vector3(...f.axisZ),
    );
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(f.center[0], f.center[1], f.center[2])
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
    );
    this.colliders = [this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(f.half[0], f.half[1], f.half[2]),
      body,
    )];

    this.material = new THREE.MeshLambertMaterial({ color: this.running ? COLOR_ON : COLOR_OFF });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(f.half[0] * 2, f.half[1] * 2, f.half[2] * 2), this.material);
    mesh.position.set(f.center[0], f.center[1], f.center[2]);
    mesh.quaternion.copy(q);
    scene.add(mesh);

    // 運ぶ向き：下の端 → 上の端
    this.carry.set(def.p2[0] - def.p1[0], def.p2[1] - def.p1[1], def.p2[2] - def.p1[2])
      .normalize()
      .multiplyScalar(def.speed);
  }

  /** スイッチから呼ばれる：動く／止まるを切り替える */
  toggle(): boolean {
    this.running = !this.running;
    this.material.color.setHex(this.running ? COLOR_ON : COLOR_OFF);
    return this.running;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** 爪では動かない（爪痕だけ付く） */
  onClaw(_hit: ClawHit, _cat: CatController): boolean {
    return false;
  }

  /** 動いている間、上に乗っている猫を運ぶ */
  fixedUpdate(_dt: number, cat: CatController): void {
    if (!this.running || cat.isResting || cat.isClimbing) return;
    const center = cat.getInterpolatedCenter(1, this.tmp);
    this.ray.origin = { x: center.x, y: center.y, z: center.z };
    // 急なベルトでは猫は下側の角で乗るので、体の下を少し長めに見る
    const hit = this.world.castRay(
      this.ray,
      CAT_SHAPE.height / 2 + 0.5,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      cat.collider,
    );
    if (!hit || hit.collider.handle !== this.colliders[0].handle) return;
    cat.carry.add(this.carry);
  }
}

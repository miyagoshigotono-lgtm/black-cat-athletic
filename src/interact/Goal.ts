import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Interactable, ClawHit } from './Interactable';
import type { CatController } from '../player/CatController';
import type { Physics } from '../core/Physics';
import { cardboardParts, type GoalDef } from '../stages/stageTypes';
import { CAT_SHAPE } from '../player/CatParams';

/**
 * ゴール：傘が差してあり、ふかふかの布が敷かれた段ボール（SPEC 8・9.1）。
 * 爪を当てるとクリア。猫は箱の中に入って丸くなる。
 * 着いただけでは自動でクリアしない（必ず爪で）。
 */
export class Goal implements Interactable {
  readonly kind = 'goal';
  readonly mode = 'instant' as const;
  readonly name: string;
  readonly colliders: readonly RAPIER.Collider[];
  private cleared = false;

  constructor(
    private readonly def: GoalDef,
    physics: Physics,
    scene: THREE.Scene,
    private readonly onGoal: () => void,
  ) {
    this.name = def.name;
    const cardboard = new THREE.MeshLambertMaterial({ color: 0xc9a26b });
    const colliders: RAPIER.Collider[] = [];
    for (const p of cardboardParts(def)) {
      const cy = p.top - p.h / 2;
      colliders.push(physics.addStaticBox({ x: p.x, y: cy, z: p.z }, { x: p.w / 2, y: p.h / 2, z: p.d / 2 }));
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), cardboard);
      mesh.position.set(p.x, cy, p.z);
      scene.add(mesh);
    }
    this.colliders = colliders;

    // 布（見た目だけ）：底の上に厚み 0.03
    const cloth = new THREE.Mesh(
      new THREE.BoxGeometry(def.w - 2 * def.wall - 0.02, 0.03, def.d - 2 * def.wall - 0.02),
      new THREE.MeshLambertMaterial({ color: 0xe8d9f0 }),
    );
    cloth.position.set(def.x, def.wall + 0.015, def.z);
    scene.add(cloth);

    // 傘の布（見た目だけ）。柄は配置データの「傘の柄」（高さ 1.0、段ボールの右壁の外）
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 0.22, 12),
      new THREE.MeshLambertMaterial({ color: 0x3f7fbf, side: THREE.DoubleSide }),
    );
    canopy.position.set(def.x + def.w / 2 + 0.035, 1.0, def.z);
    canopy.rotation.z = 0.25; // 段ボールの上へ少し傾ける
    scene.add(canopy);
  }

  onClaw(_hit: ClawHit, cat: CatController): boolean {
    if (this.cleared) return false;
    this.cleared = true;
    // 箱の中で丸くなる：体を X 方向（箱の長い方）に向け、底の上に置く
    const center = new THREE.Vector3(this.def.x, this.def.wall + CAT_SHAPE.height / 2 + CAT_SHAPE.offset, this.def.z);
    cat.rest(center, Math.PI / 2);
    this.onGoal();
    return false;
  }
}

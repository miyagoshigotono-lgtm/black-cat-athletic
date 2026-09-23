import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Interactable, ClawHit } from './Interactable';
import type { CatController } from '../player/CatController';
import type { Physics } from '../core/Physics';
import { goalParts, type GoalDef } from '../stages/stageTypes';
import { CAT_SHAPE } from '../player/CatParams';

/**
 * ゴール：爪を当てるとクリアになる物（SPEC 8・9.1）。着いただけでは自動クリアしない。
 *  - 段ボール（森）：傘が差してあり布が敷かれた箱。猫は中に入って丸くなる
 *  - キーボード（工場の事務所）：机の上のキーボード。猫はその上で丸くなる
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
    const keyboard = (def.look ?? 'cardboard') === 'keyboard';
    const base = def.baseY ?? 0;
    const body = new THREE.MeshLambertMaterial({ color: keyboard ? 0x3a3f46 : 0xc9a26b });
    const colliders: RAPIER.Collider[] = [];
    for (const p of goalParts(def)) {
      const cy = p.top - p.h / 2;
      colliders.push(physics.addStaticBox({ x: p.x, y: cy, z: p.z }, { x: p.w / 2, y: p.h / 2, z: p.d / 2 }));
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), body);
      mesh.position.set(p.x, cy, p.z);
      scene.add(mesh);
    }
    this.colliders = colliders;

    if (keyboard) {
      // キーの面（見た目だけ）：本体の上に薄く重ねる
      const keys = new THREE.Mesh(
        new THREE.BoxGeometry(def.w - 0.04, 0.004, def.d - 0.03),
        new THREE.MeshLambertMaterial({ color: 0xd8dde2 }),
      );
      keys.position.set(def.x, base + def.height + 0.002, def.z);
      scene.add(keys);
      return;
    }

    // 布（見た目だけ）：底の上に厚み 0.03
    const cloth = new THREE.Mesh(
      new THREE.BoxGeometry(def.w - 2 * def.wall - 0.02, 0.03, def.d - 2 * def.wall - 0.02),
      new THREE.MeshLambertMaterial({ color: 0xe8d9f0 }),
    );
    cloth.position.set(def.x, base + def.wall + 0.015, def.z);
    scene.add(cloth);

    // 傘の布（見た目だけ）。柄は配置データの「傘の柄」（高さ 1.0、段ボールの右壁の外）
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 0.22, 12),
      new THREE.MeshLambertMaterial({ color: 0x3f7fbf, side: THREE.DoubleSide }),
    );
    canopy.position.set(def.x + def.w / 2 + 0.035, base + 1.0, def.z);
    canopy.rotation.z = 0.25; // 段ボールの上へ少し傾ける
    scene.add(canopy);
  }

  onClaw(_hit: ClawHit, cat: CatController): boolean {
    if (this.cleared) return false;
    this.cleared = true;
    // 体を X 方向（物の長い方）に向けて丸くなる。段ボールは中の底の上、キーボードはその上
    const base = this.def.baseY ?? 0;
    const floor = (this.def.look ?? 'cardboard') === 'keyboard' ? base + this.def.height : base + this.def.wall;
    const center = new THREE.Vector3(this.def.x, floor + CAT_SHAPE.height / 2 + CAT_SHAPE.offset, this.def.z);
    cat.rest(center, Math.PI / 2);
    this.onGoal();
    return false;
  }
}

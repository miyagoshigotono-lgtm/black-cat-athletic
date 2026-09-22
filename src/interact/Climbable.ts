import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Interactable, ClawHit } from './Interactable';
import type { CatController } from '../player/CatController';
import type { ClimbableDef } from '../greybox/protoInteractables';
import type { Physics } from '../core/Physics';

/**
 * 登れる面（金網など）。押している間続く対象（SPEC 6.4）。
 * 爪を当てると猫が面に張り付き、爪を離すと猫の側で登りを終える。
 * 動きそのもの（登り降り・乗り越え）は CatController の「登り状態」が受け持つ。
 */
export class Climbable implements Interactable {
  readonly kind = 'climbable';
  readonly mode = 'hold' as const;
  readonly name: string;
  readonly colliders: readonly RAPIER.Collider[];

  constructor(
    private readonly def: ClimbableDef,
    physics: Physics,
    scene: THREE.Scene,
  ) {
    this.name = def.name;
    const cy = def.top - def.h / 2;
    this.colliders = [physics.addStaticBox({ x: def.x, y: cy, z: def.z }, { x: def.w / 2, y: def.h / 2, z: def.d / 2 })];

    // 見た目：金網らしい格子（グレーボックス段階の仮表現）
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(def.w, def.h, def.d), createMeshMaterial(def.w, def.h, def.d));
    mesh.position.set(def.x, cy, def.z);
    scene.add(mesh);
  }

  onClaw(hit: ClawHit, cat: CatController): boolean {
    // 横向きの面にだけ張り付く（上面を引っかいても登りにはならない）
    if (Math.abs(hit.normal.y) > 0.5) return false;
    // 面の厚み（法線方向の寸法）
    const thickness = Math.abs(hit.normal.x) > Math.abs(hit.normal.z) ? this.def.w : this.def.d;
    return cat.startClimb({
      collider: hit.collider,
      point: hit.point,
      normal: hit.normal,
      topY: this.def.top,
      thickness,
    });
  }

  onRelease(cat: CatController): void {
    cat.stopClimb();
  }
}

/** 格子模様の半透明マテリアル（1マス 5cm） */
function createMeshMaterial(w: number, h: number, d: number): THREE.MeshLambertMaterial {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.strokeStyle = '#8f99a3';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size, size);
    ctx.moveTo(size, 0);
    ctx.lineTo(0, size);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // 広い面に合わせて繰り返す（1マス 0.05m）
  tex.repeat.set(Math.max(w, d) / 0.05, h / 0.05);
  return new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
}

import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Interactable, ClawHit } from './Interactable';
import type { CatController } from '../player/CatController';
import type { ClimbableDef, StageDef } from '../stages/stageTypes';
import type { Physics } from '../core/Physics';

/**
 * 登れる面（金網・ツタ）。押している間続く対象（SPEC 6.4）。見た目が違うだけで動作は同じ。
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
    stage: StageDef,
  ) {
    this.name = def.name;
    const cy = def.top - def.h / 2;
    this.colliders = [
      physics.addStaticBox({ x: def.x, y: cy, z: def.z }, { x: def.w / 2, y: def.h / 2, z: def.d / 2 }, def.sensor ?? false),
    ];

    // 見た目（グレーボックス段階の仮表現）
    const material = def.look === 'vine' ? createVineMaterial(def.w, def.h) : createMeshMaterial(def.w, def.h, def.d);
    const host = stage.solids?.find((o) => o.name === def.embeddedIn);
    if (host && host.kind === 'cylinder') {
      // 丸い幹：幹より 1cm 外側に、登れる範囲の幅だけ巻き付けた帯
      const r = host.r + 0.01;
      const facing = Math.atan2(def.x - host.x, def.z - host.z); // CylinderGeometry の角度は +Z が 0
      const arc = def.w / r;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, def.h, 12, 1, true, facing - arc / 2, arc), material);
      band.position.set(host.x, cy, host.z);
      scene.add(band);
    } else {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(def.w, def.h, def.d), material);
      mesh.position.set(def.x, cy, def.z);
      scene.add(mesh);
    }
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

/** ツタ：葉と蔓を描いた半透明マテリアル（1枚 0.25m 四方を繰り返す） */
function createVineMaterial(w: number, h: number): THREE.MeshLambertMaterial {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // 蔓（縦に波打つ線）
    ctx.strokeStyle = '#3d5a24';
    ctx.lineWidth = 5;
    for (const x0 of [30, 90]) {
      ctx.beginPath();
      for (let y = 0; y <= size; y += 8) {
        const x = x0 + Math.sin((y / size) * Math.PI * 2) * 10;
        if (y === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // 葉（決まった位置に楕円。毎回同じ模様にする）
    const leaves: Array<[number, number, number]> = [
      [20, 12, 0.5], [44, 30, -0.6], [18, 58, 0.4], [42, 84, -0.5], [22, 108, 0.6],
      [80, 20, -0.4], [104, 44, 0.5], [78, 70, -0.6], [102, 96, 0.4], [84, 118, -0.5],
    ];
    ctx.fillStyle = '#5f9a3a';
    for (const [x, y, r] of leaves) {
      ctx.beginPath();
      ctx.ellipse(x, y, 13, 8, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(w / 0.25, h / 0.25);
  return new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
}

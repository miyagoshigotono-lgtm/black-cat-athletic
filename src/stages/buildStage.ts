import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { Physics } from '../core/Physics';
import type { BoxColor, SolidDef, StageDef } from './stageTypes';
import { beamFrame, clumpPoints } from './geometry';

/** 用途別の色（グレーボックス段階の仮の色） */
const COLORS: Record<BoxColor, number> = {
  ground: 0x7c8a6a,
  wall: 0xb9b2a6,
  step: 0xd9a066,
  platform: 0x6d9dc5,
  fence: 0xa0a8b0,
  furniture: 0x8b5a3c,
  tunnel: 0xc47a7a,
  factory: 0x8f8b86,
  bush: 0x3e6a3a,
  bark: 0x6b4a32,
  branch: 0x7d5a3b,
  leaves: 0x4f8a45,
  rock: 0x8c8c86,
  boards: 0xa9804f,
  cardboard: 0xc9a26b,
  metal: 0x9aa3ab,
};

/** 丸い塊（葉・岩）は面ごとに陰影を付けて、形が分かりやすいようにする */
const FLAT_SHADED: ReadonlySet<BoxColor> = new Set<BoxColor>(['leaves', 'rock', 'bush']);

/**
 * 配置データ（StageDef）から、描画用メッシュと当たり判定を生成する。
 * 描画と物理は必ず同じ数値から作る（見た目と判定のずれを防ぐ）。
 * 爪の対象（interactables）は registry.ts が別に作る。
 */
export function buildStage(scene: THREE.Scene, physics: Physics, stage: StageDef): void {
  const materials = new Map<string, THREE.MeshLambertMaterial>();
  const material = (color: BoxColor): THREE.MeshLambertMaterial => {
    let m = materials.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: COLORS[color], flatShading: FLAT_SHADED.has(color) });
      materials.set(color, m);
    }
    return m;
  };

  // --- 軸にそろった箱 ---
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  for (const b of stage.boxes) {
    // 中心 y = 上面 − 厚み/2
    const cy = b.top - b.h / 2;
    const mesh = new THREE.Mesh(unitBox, material(b.color));
    mesh.position.set(b.x, cy, b.z);
    mesh.scale.set(b.w, b.h, b.d);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    scene.add(mesh);
    physics.addStaticBox({ x: b.x, y: cy, z: b.z }, { x: b.w / 2, y: b.h / 2, z: b.d / 2 });
  }

  // --- 自然物（幹・枝・葉の塊・岩） ---
  for (const s of stage.solids ?? []) buildSolid(scene, physics, s, material(s.color));

  if (stage.showGrid) {
    // 地面の目盛り（1m 間隔）。距離感をつかむため
    const grid = new THREE.GridHelper(30, 30, 0x4a5540, 0x5f6b52);
    grid.position.y = 0.002;
    scene.add(grid);
  }
}

function buildSolid(scene: THREE.Scene, physics: Physics, s: SolidDef, mat: THREE.Material): void {
  const world = physics.world;
  switch (s.kind) {
    case 'cylinder': {
      const h = s.top - s.bottom;
      const cy = s.bottom + h / 2;
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(s.x, cy, s.z));
      world.createCollider(RAPIER.ColliderDesc.cylinder(h / 2, s.r), body);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, h, 12), mat);
      mesh.position.set(s.x, cy, s.z);
      scene.add(mesh);
      return;
    }
    case 'beam': {
      const f = beamFrame(s);
      const basis = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...f.axisX),
        new THREE.Vector3(...f.axisY),
        new THREE.Vector3(...f.axisZ),
      );
      const q = new THREE.Quaternion().setFromRotationMatrix(basis);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(f.center[0], f.center[1], f.center[2])
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
      );
      world.createCollider(RAPIER.ColliderDesc.cuboid(f.half[0], f.half[1], f.half[2]), body);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(f.half[0] * 2, f.half[1] * 2, f.half[2] * 2), mat);
      mesh.position.set(f.center[0], f.center[1], f.center[2]);
      mesh.quaternion.copy(q);
      scene.add(mesh);
      return;
    }
    case 'clump': {
      // 見た目も当たり判定も、同じ頂点の凸包から作る
      const pts = clumpPoints(s);
      const flat = new Float32Array(pts.flat());
      const desc = RAPIER.ColliderDesc.convexHull(flat);
      if (!desc) throw new Error(`${s.name}：凸包を作れない`);
      world.createCollider(desc, world.createRigidBody(RAPIER.RigidBodyDesc.fixed()));
      const mesh = new THREE.Mesh(new ConvexGeometry(pts.map((p) => new THREE.Vector3(...p))), mat);
      scene.add(mesh);
      return;
    }
  }
}

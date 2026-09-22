import * as THREE from 'three';
import type { Physics } from '../core/Physics';
import { PROTO_COURSE, type BoxColor } from './protoCourseData';

/** 用途別の色（高さや種類が見分けやすいように） */
const COLORS: Record<BoxColor, number> = {
  ground: 0x7c8a6a,
  wall: 0xb9b2a6,
  step: 0xd9a066,
  platform: 0x6d9dc5,
  fence: 0xa0a8b0,
  furniture: 0x8b5a3c,
  tunnel: 0xc47a7a,
};

/**
 * 配置データ（protoCourseData）から、描画用メッシュと当たり判定を生成する。
 * 描画と物理は必ず同じ数値から作る（見た目と判定のずれを防ぐ）。
 */
export function buildProtoCourse(scene: THREE.Scene, physics: Physics): void {
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map<BoxColor, THREE.MeshLambertMaterial>();

  for (const b of PROTO_COURSE) {
    let mat = materials.get(b.color);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color: COLORS[b.color] });
      materials.set(b.color, mat);
    }
    // 中心 y = 上面 − 厚み/2
    const cy = b.top - b.h / 2;
    const mesh = new THREE.Mesh(unitBox, mat);
    mesh.position.set(b.x, cy, b.z);
    mesh.scale.set(b.w, b.h, b.d);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    scene.add(mesh);

    physics.addStaticBox({ x: b.x, y: cy, z: b.z }, { x: b.w / 2, y: b.h / 2, z: b.d / 2 });
  }

  // 地面の目盛り（1m 間隔）。距離感をつかむため
  const grid = new THREE.GridHelper(30, 30, 0x4a5540, 0x5f6b52);
  grid.position.y = 0.002;
  scene.add(grid);
}

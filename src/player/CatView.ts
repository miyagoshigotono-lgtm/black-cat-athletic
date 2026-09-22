import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CAT_SHAPE } from './CatParams';

/**
 * 猫の見た目（① ではカプセル＋耳＋目の仮モデル）と足元の丸影。
 * 丸影は真下へ光線を飛ばして落ちる位置に置く。ジャンプの着地点を掴みやすくするため。
 */
export class CatView {
  readonly root = new THREE.Group();
  private readonly materials: THREE.MeshLambertMaterial[] = [];
  private readonly shadow: THREE.Mesh;
  private readonly shadowMat: THREE.MeshBasicMaterial;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  constructor(scene: THREE.Scene) {
    const bodyMat = this.mat(0x1a1a1f);
    const eyeMat = this.mat(0xf2c14e);

    // 胴体：当たり判定と同じ寸法のカプセル（中心が root の原点）
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(CAT_SHAPE.radius, CAT_SHAPE.halfHeight * 2, 6, 12),
      bodyMat,
    );
    this.root.add(body);

    // 耳：カプセル上端（中心から +0.20）付近に円錐を2つ
    const top = CAT_SHAPE.height / 2;
    const earGeo = new THREE.ConeGeometry(0.045, 0.09, 4);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, bodyMat);
      ear.position.set(side * 0.06, top - 0.01, -0.02);
      ear.rotation.z = -side * 0.25;
      this.root.add(ear);
    }

    // 目：前（-Z）側。向きが分かるように
    const eyeGeo = new THREE.SphereGeometry(0.022, 8, 6);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * 0.045, top - 0.09, -CAT_SHAPE.radius + 0.01);
      this.root.add(eye);
    }

    scene.add(this.root);

    // 足元の丸影
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(CAT_SHAPE.radius * 1.1, 16), this.shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 1;
    scene.add(this.shadow);
  }

  /**
   * @param center 補間済みのカプセル中心
   * @param facing 猫の向き（Y軸回り）
   * @param opacity カメラが近いときの不透明度（0 で非表示）
   */
  update(world: RAPIER.World, catCollider: RAPIER.Collider, center: THREE.Vector3, facing: number, opacity: number): void {
    this.root.position.copy(center);
    this.root.rotation.y = facing;

    this.root.visible = opacity > 0.01;
    for (const m of this.materials) {
      m.opacity = opacity;
      m.transparent = opacity < 0.999;
      m.depthWrite = !m.transparent;
    }

    // 丸影：カプセル下端から真下へ
    this.ray.origin = { x: center.x, y: center.y - CAT_SHAPE.height / 2 + 0.02, z: center.z };
    const hit = world.castRay(this.ray, 20, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, catCollider);
    if (hit) {
      const drop = hit.timeOfImpact;
      this.shadow.visible = true;
      this.shadow.position.set(center.x, this.ray.origin.y - drop + 0.005, center.z);
      // 高いほど小さく薄く
      const s = THREE.MathUtils.clamp(1 - drop * 0.15, 0.4, 1);
      this.shadow.scale.setScalar(s);
      this.shadowMat.opacity = 0.35 * s;
    } else {
      this.shadow.visible = false;
    }
  }

  private mat(color: number): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color });
    this.materials.push(m);
    return m;
  }
}

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CAT_SHAPE } from './CatParams';

/**
 * 猫の仮の見た目（四本脚・体が水平な姿勢を箱で組んだもの）と足元の影。
 * 本番の見た目（SPEC 3.2：トゥーン表現）は素材差し替えの段階で作る。
 *
 * 寸法の基準：root の原点 = 当たり判定の箱の中心。猫は -Z を向く。
 * 当たり判定の範囲は X ±0.07 / Y ±0.13 / Z ±0.22。
 * 胴・脚・頭はこの範囲に収める。耳（上に 0.035）と尻尾（後ろに 0.04）だけ少しはみ出す。
 */
export class CatView {
  readonly root = new THREE.Group();
  private readonly materials: THREE.MeshLambertMaterial[] = [];
  private readonly shadowRoot = new THREE.Group();
  private readonly shadowMat: THREE.MeshBasicMaterial;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  constructor(scene: THREE.Scene) {
    const fur = this.mat(0x1a1a1f);
    const eye = this.mat(0xf2c14e);
    const nose = this.mat(0x3a2a2e);

    // 脚：0.035 角 × 高さ 0.12。y -0.13〜-0.01（足裏が箱の底）
    for (const x of [-0.04, 0.04]) {
      for (const z of [-0.13, 0.13]) {
        this.box(fur, 0.035, 0.12, 0.035, x, -0.07, z);
      }
    }
    // 胴：幅 0.12 × 高さ 0.11 × 長さ 0.30。y -0.01〜0.10、z -0.12〜0.18
    this.box(fur, 0.12, 0.11, 0.3, 0, 0.045, 0.03);
    // 頭：幅 0.11 × 高さ 0.10 × 奥行き 0.09。y 0.025〜0.125、z -0.205〜-0.115
    this.box(fur, 0.11, 0.1, 0.09, 0, 0.075, -0.16);
    // 鼻先：z -0.22〜-0.205（箱の前端ちょうど）
    this.box(nose, 0.045, 0.035, 0.015, 0, 0.05, -0.2125);
    // 目：頭の前面（z = -0.205）に貼る
    for (const x of [-0.027, 0.027]) {
      this.box(eye, 0.022, 0.016, 0.004, x, 0.09, -0.207);
    }
    // 耳：頭の上面（y = 0.125）から高さ 0.04 の四角錐
    const earGeo = new THREE.ConeGeometry(0.024, 0.04, 4);
    for (const x of [-0.035, 0.035]) {
      const ear = new THREE.Mesh(earGeo, fur);
      ear.position.set(x, 0.145, -0.15);
      ear.rotation.y = Math.PI / 4;
      this.root.add(ear);
    }
    // 尻尾：胴の後ろ上（y 0.09, z 0.18）から後ろ上へ 50° の角度で長さ 0.12
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.09, 0.18);
    tailPivot.rotation.x = THREE.MathUtils.degToRad(50);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.12), fur);
    tail.position.z = 0.06;
    tailPivot.add(tail);
    this.root.add(tailPivot);

    scene.add(this.root);

    // 足元の影：体に合わせた楕円。猫の向きに合わせて回す
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20), this.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(CAT_SHAPE.width * 0.65, CAT_SHAPE.length * 0.55, 1);
    shadow.renderOrder = 1;
    this.shadowRoot.add(shadow);
    scene.add(this.shadowRoot);
  }

  /**
   * @param center 補間済みの当たり判定の中心
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

    // 影：箱の底から真下へ
    this.ray.origin = { x: center.x, y: center.y - CAT_SHAPE.height / 2 + 0.02, z: center.z };
    const hit = world.castRay(this.ray, 20, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, catCollider);
    if (hit) {
      const drop = hit.timeOfImpact;
      this.shadowRoot.visible = true;
      this.shadowRoot.position.set(center.x, this.ray.origin.y - drop + 0.005, center.z);
      this.shadowRoot.rotation.y = facing;
      // 高いほど小さく薄く
      const s = THREE.MathUtils.clamp(1 - drop * 0.15, 0.4, 1);
      this.shadowRoot.scale.setScalar(s);
      this.shadowMat.opacity = 0.35 * s;
    } else {
      this.shadowRoot.visible = false;
    }
  }

  private box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): void {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    this.root.add(m);
  }

  private mat(color: number): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color });
    this.materials.push(m);
    return m;
  }
}

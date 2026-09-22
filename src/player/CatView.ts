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
 *
 * 歩きのアニメーションは手続き的に付ける（本番モデルでは作り直す前提）。
 * - 脚は付け根（胴の底 y = -0.01）を軸に前後へ振る。振っても足先は当たり判定の範囲内
 *   （足先の角は歩きで z ±0.208、空中姿勢で最大 z 0.212。範囲は ±0.22）。
 * - 足運びは猫の常歩（左後 → 左前 → 右後 → 右前 を 1/4 周期ずつずらす）。
 * - 空中では前脚を前へ、後脚を後ろへ伸ばす。
 * - 爪を出したときは右前脚で引っかく仕草をする（SPEC 6.2）。
 * - 登り状態では体を縦（頭が上）にする。姿勢の切り替えは見た目だけなめらかにつなぐ。
 */

/** 引っかく仕草の長さ [s] と、前脚を振り上げる角度 [rad] */
const SWIPE_DURATION = 0.3;
const SWIPE_ANGLE = 1.4;

/** 脚1本分の情報 */
interface Leg {
  pivot: THREE.Group;
  /** 歩行周期内の位相のずれ（0〜1） */
  phaseOffset: number;
  /** 前脚か */
  front: boolean;
}

/** アニメーションの調整値 */
const WALK = {
  /** 1周期で進む距離 [m]（速度 ÷ これ = 1秒あたりの周期数） */
  strideLength: 0.6,
  /** 脚の最大振り角 [rad] */
  swingAngle: 0.55,
  /** この速度で振り幅が最大になる [m/s] */
  fullSwingSpeed: 1.5,
  /** 空中姿勢の前脚・後脚の角度 [rad]（正で前へ） */
  airFront: 0.5,
  airHind: -0.6,
  /** 胴の上下動 [m] */
  bob: 0.004,
};

export class CatView {
  readonly root = new THREE.Group();
  /** 胴・頭・尻尾（上下に揺らす部分） */
  private readonly body = new THREE.Group();
  private readonly legs: Leg[] = [];
  private readonly tailPivot = new THREE.Group();
  /** 歩行周期の位相（0〜1 を繰り返す） */
  private phase = 0;
  /** 歩き・空中の姿勢の効き具合（0〜1、なめらかに変える） */
  private walkBlend = 0;
  private airBlend = 0;
  private time = 0;
  /** 引っかく仕草の経過時間（仕草中でなければ負） */
  private swipeTime = -1;
  /** 見た目の傾き（当たり判定の傾きへなめらかに追いつく） */
  private visualPitch = 0;
  /** 丸くなる姿勢の効き具合（0〜1） */
  private restBlend = 0;
  private resting = false;
  private readonly materials: THREE.MeshLambertMaterial[] = [];
  private readonly shadowRoot = new THREE.Group();
  private readonly shadowMat: THREE.MeshBasicMaterial;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  constructor(scene: THREE.Scene) {
    const fur = this.mat(0x1a1a1f);
    const eye = this.mat(0xf2c14e);
    const nose = this.mat(0x3a2a2e);

    this.root.add(this.body);

    // 脚：0.035 角 × 高さ 0.12。付け根 y -0.01 から下へ、足裏が箱の底（y -0.13）
    // 猫は -Z を向くので、猫の左は -X 側
    const legGeo = new THREE.BoxGeometry(0.035, 0.12, 0.035);
    const legDefs = [
      { x: -0.04, z: 0.13, front: false, phaseOffset: 0 }, // 左後
      { x: -0.04, z: -0.13, front: true, phaseOffset: 0.25 }, // 左前
      { x: 0.04, z: 0.13, front: false, phaseOffset: 0.5 }, // 右後
      { x: 0.04, z: -0.13, front: true, phaseOffset: 0.75 }, // 右前
    ];
    for (const d of legDefs) {
      const pivot = new THREE.Group();
      pivot.position.set(d.x, -0.01, d.z);
      const leg = new THREE.Mesh(legGeo, fur);
      leg.position.y = -0.06;
      pivot.add(leg);
      this.root.add(pivot);
      this.legs.push({ pivot, phaseOffset: d.phaseOffset, front: d.front });
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
      this.body.add(ear);
    }
    // 尻尾：胴の後ろ上（y 0.09, z 0.18）から後ろ上へ 50° の角度で長さ 0.12
    this.tailPivot.position.set(0, 0.09, 0.18);
    this.tailPivot.rotation.order = 'YXZ';
    this.tailPivot.rotation.x = THREE.MathUtils.degToRad(50);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.12), fur);
    tail.position.z = 0.06;
    this.tailPivot.add(tail);
    this.body.add(this.tailPivot);

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
   * @param pitch 体の傾き（0 = 四つ足、π/2 = 登り姿勢）
   * @param opacity カメラが近いときの不透明度（0 で非表示）
   * @param speed 水平方向の速さ [m/s]（歩きアニメーション用）
   * @param grounded 接地しているか
   */
  update(
    dt: number,
    world: RAPIER.World,
    catCollider: RAPIER.Collider,
    center: THREE.Vector3,
    facing: number,
    pitch: number,
    opacity: number,
    speed: number,
    grounded: boolean,
  ): void {
    this.root.position.copy(center);
    this.visualPitch += (pitch - this.visualPitch) * (1 - Math.exp(-18 * dt));
    this.root.rotation.set(this.visualPitch, facing, 0, 'YXZ');
    this.animate(dt, speed, grounded);

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

  /** 引っかく仕草を始める */
  playSwipe(): void {
    this.swipeTime = 0;
  }

  /** 丸くなって休む姿勢にする（ゴール） */
  setResting(resting: boolean): void {
    this.resting = resting;
  }

  /** 歩き・空中の姿勢と尻尾の揺れ */
  private animate(dt: number, speed: number, grounded: boolean): void {
    this.time += dt;
    // 位相は進んだ距離に比例させる（速さが変わっても足が滑って見えにくい）
    if (grounded) this.phase = (this.phase + (speed / WALK.strideLength) * dt) % 1;

    const k = 1 - Math.exp(-12 * dt);
    const walkTarget = grounded ? Math.min(1, speed / WALK.fullSwingSpeed) : 0;
    this.walkBlend += (walkTarget - this.walkBlend) * k;
    this.airBlend += ((grounded ? 0 : 1) - this.airBlend) * k;

    for (const leg of this.legs) {
      const walk = Math.sin((this.phase + leg.phaseOffset) * Math.PI * 2) * WALK.swingAngle * this.walkBlend;
      const air = leg.front ? WALK.airFront : WALK.airHind;
      leg.pivot.rotation.x = THREE.MathUtils.lerp(walk, air, this.airBlend);
    }

    // 引っかく仕草：右前脚を前へ振り上げて戻す（山なりの動き）
    if (this.swipeTime >= 0) {
      this.swipeTime += dt;
      const t = this.swipeTime / SWIPE_DURATION;
      if (t >= 1) {
        this.swipeTime = -1;
      } else {
        const rightFront = this.legs[3];
        rightFront.pivot.rotation.x = Math.sin(t * Math.PI) * SWIPE_ANGLE;
      }
    }

    // 丸くなる：脚を体の下へたたみ、胴を下げ、尻尾を体に巻きつける
    this.restBlend += ((this.resting ? 1 : 0) - this.restBlend) * (1 - Math.exp(-4 * dt));
    if (this.restBlend > 0.001) {
      for (const leg of this.legs) {
        const folded = leg.front ? 1.45 : -1.45;
        leg.pivot.rotation.x = THREE.MathUtils.lerp(leg.pivot.rotation.x, folded, this.restBlend);
      }
    }

    // 胴は1周期に2回、わずかに上下する（丸くなると下がる）
    this.body.position.y = Math.sin(this.phase * Math.PI * 4) * WALK.bob * this.walkBlend - 0.08 * this.restBlend;

    // 尻尾：止まっている時はゆっくり左右に、歩くと少し大きく速く揺れる
    const sway = Math.sin(this.time * (1.6 + this.walkBlend * 2.4)) * (0.12 + this.walkBlend * 0.12);
    this.tailPivot.rotation.y = THREE.MathUtils.lerp(sway, 2.3, this.restBlend);
    this.tailPivot.rotation.x = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(50), -0.3, this.restBlend);
  }

  private box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): void {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    this.body.add(m);
  }

  private mat(color: number): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color });
    this.materials.push(m);
    return m;
  }
}

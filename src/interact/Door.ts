import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Interactable, ClawHit } from './Interactable';
import type { CatController } from '../player/CatController';
import type { DoorDef } from '../stages/stageTypes';

/** 開閉の速さ [rad/s] */
const SWING_SPEED = 2.2;
/** 全開の角度 [rad] */
const OPEN_ANGLE = Math.PI / 2;
/**
 * 猫とぶつかるかの判定で、猫へ向かって動くときに板を実際より厚く・長くする量 [m]。
 * 猫のコントローラーは周りと 0.01 の接触マージンを保つので、それより大きくする。
 */
const CAT_CLEARANCE = 0.02;
/** 猫から離れる向きに動くときの余裕 [m]（猫が板にぴったり寄っていても押して開けられるよう小さくする） */
const CAT_CLEARANCE_AWAY = 0.005;

/**
 * 開閉するドア（押した瞬間に1回で完了する対象）。
 * 状態：閉 ⇔ 開（可逆）。爪を当てるたびに切り替える。
 * 開くときは猫から遠ざかる向きに開く（押して開ける）。
 * 開閉の途中で猫にぶつかる場合は、その場で止まって待つ（猫を押しのけたり、めり込んだりしない）。
 */
export class Door implements Interactable {
  readonly kind = 'door';
  readonly mode = 'instant' as const;
  readonly name: string;
  readonly colliders: readonly RAPIER.Collider[];

  /** 開き角（0 = 閉）と目標の開き角 */
  private angle = 0;
  private targetAngle = 0;

  private readonly body: RAPIER.RigidBody;
  /** 猫との衝突判定用の形：猫へ向かって動くとき（大きめ）／猫から離れる向きに動くとき（ほぼ実寸） */
  private readonly shapeToward: RAPIER.Cuboid;
  private readonly shapeAway: RAPIER.Cuboid;
  private readonly pivot = new THREE.Group();
  private catCollider: RAPIER.Collider | null = null;
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpEuler = new THREE.Euler();
  private readonly tmpPos = new THREE.Vector3();

  constructor(
    private readonly def: DoorDef,
    private readonly world: RAPIER.World,
    scene: THREE.Scene,
  ) {
    this.name = def.name;
    const halfW = def.width / 2;
    const halfH = def.height / 2;
    const halfT = def.thickness / 2;

    // 蝶番の位置を原点にしたキネマティックな剛体。板は +X 方向へ伸びる
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(def.hingeX, 0, def.hingeZ)
        .setRotation(this.yawQuat(0)),
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfW, halfH, halfT).setTranslation(halfW, def.bottomGap + halfH, 0),
      this.body,
    );
    this.colliders = [collider];
    this.shapeToward = new RAPIER.Cuboid(halfW + CAT_CLEARANCE, halfH, halfT + CAT_CLEARANCE);
    this.shapeAway = new RAPIER.Cuboid(halfW + CAT_CLEARANCE_AWAY, halfH, halfT + CAT_CLEARANCE_AWAY);

    // 見た目：板＋取っ手
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(def.width, def.height, def.thickness),
      new THREE.MeshLambertMaterial({ color: 0x9c6b43 }),
    );
    panel.position.set(halfW, def.bottomGap + halfH, 0);
    const knob = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, def.thickness + 0.06),
      new THREE.MeshLambertMaterial({ color: 0xd8c27a }),
    );
    knob.position.set(def.width - 0.08, def.bottomGap + 0.9, 0);
    this.pivot.add(panel, knob);
    this.pivot.position.set(def.hingeX, 0, def.hingeZ);
    this.pivot.rotation.y = def.baseYaw;
    scene.add(this.pivot);
  }

  onClaw(_hit: ClawHit, cat: CatController): boolean {
    this.catCollider = cat.collider;
    if (this.targetAngle === 0) {
      // 閉じている時の板の法線（+Z をドアの向きで回したもの）に対して、猫がどちら側にいるか
      const c = cat.getFootPosition(this.tmpPos);
      const nx = Math.sin(this.def.baseYaw);
      const nz = Math.cos(this.def.baseYaw);
      const side = (c.x - this.def.hingeX) * nx + (c.z - this.def.hingeZ) * nz;
      // Y軸回りに負の角度で回すと板は +法線側へ振れる → 猫と反対側へ開く
      this.targetAngle = side < 0 ? -OPEN_ANGLE : OPEN_ANGLE;
    } else {
      this.targetAngle = 0;
    }
    return false;
  }

  fixedUpdate(dt: number): void {
    if (this.angle === this.targetAngle) return;
    const diff = this.targetAngle - this.angle;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), SWING_SPEED * dt);
    const next = this.angle + step;

    // 動かした先で猫とぶつかるなら、今回は動かさない
    if (this.catCollider && this.hitsCat(next, this.movingTowardCat(step))) return;

    this.angle = next;
    // setNextKinematicRotation（速度を持つ動き）だと、猫のコントローラーが板の速度を猫に移して
    // 押しのけたり引きずったりする（実測）。角度を直接置き換えて、速度を持たせずに回す。
    this.body.setRotation(this.yawQuat(this.angle), true);
    this.pivot.rotation.y = this.def.baseYaw + this.angle;
  }

  /**
   * 今の向きから step だけ回すと、板が猫のいる側へ動くか。
   * 負の角度へ回すと板は（今の板の）+法線側へ振れる。
   */
  private movingTowardCat(step: number): boolean {
    const yaw = this.def.baseYaw + this.angle;
    const c = this.catCollider!.translation();
    const side = (c.x - this.def.hingeX) * Math.sin(yaw) + (c.z - this.def.hingeZ) * Math.cos(yaw);
    const movingSide = step < 0 ? 1 : -1;
    return Math.sign(side) === movingSide;
  }

  /** 開き角 angle のときの板が猫と重なるか（toward：猫へ向かって動くときは大きめの余裕で判定） */
  private hitsCat(angle: number, toward: boolean): boolean {
    const d = this.def;
    const rot = this.yawQuat(angle);
    // 板の中心 = 蝶番 + 回転(板の中心までのずれ)
    const yaw = d.baseYaw + angle;
    const center = {
      x: d.hingeX + Math.cos(yaw) * (d.width / 2),
      y: d.bottomGap + d.height / 2,
      z: d.hingeZ - Math.sin(yaw) * (d.width / 2),
    };
    const catHandle = this.catCollider!.handle;
    const hit = this.world.intersectionWithShape(
      center,
      rot,
      toward ? this.shapeToward : this.shapeAway,
      undefined,
      undefined,
      undefined,
      undefined,
      (c) => c.handle === catHandle,
    );
    return hit !== null;
  }

  private yawQuat(angle: number): RAPIER.Rotation {
    this.tmpQuat.setFromEuler(this.tmpEuler.set(0, this.def.baseYaw + angle, 0));
    return { x: this.tmpQuat.x, y: this.tmpQuat.y, z: this.tmpQuat.z, w: this.tmpQuat.w };
  }
}

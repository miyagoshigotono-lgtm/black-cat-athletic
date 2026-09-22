import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { catParams, CAT_SHAPE } from './CatParams';
import type { InputState } from '../input/InputState';

/**
 * 猫のキネマティック・キャラクターコントローラー。
 * 猫は物理ボディにせず、移動・ジャンプ・落下を手続き的に計算し、
 * 衝突の解決だけを Rapier の KinematicCharacterController に任せる。
 *
 * 位置の基準：
 * - Rapier 上のボディ位置はカプセルの中心
 * - 外部に公開する footPosition は「足元」（中心 − 全高/2）
 */
export class CatController {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;

  /** 現在の速度 [m/s] */
  readonly velocity = new THREE.Vector3();
  /** 接地しているか（直近の物理ステップの結果） */
  grounded = false;
  /** 猫の向き（Y軸回りの角度。0 で -Z を向く） */
  facing = 0;

  /** 補間用：前回と今回の物理ステップ後の中心位置 */
  private readonly prevCenter = new THREE.Vector3();
  private readonly currCenter = new THREE.Vector3();

  /** 最後に接地していた時刻からの経過 [s]（コヨーテタイム用） */
  private timeSinceGrounded = Infinity;
  /** ジャンプ入力を覚えている残り時間 [s] */
  private jumpBuffer = 0;
  /** 上昇中（ジャンプ直後に地面へ吸着させないため） */
  private rising = false;

  private readonly tmpDir = new THREE.Vector3();

  constructor(
    world: RAPIER.World,
    footPosition: { x: number; y: number; z: number },
  ) {
    const cy = footPosition.y + CAT_SHAPE.height / 2 + CAT_SHAPE.offset;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(footPosition.x, cy, footPosition.z),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(CAT_SHAPE.halfHeight, CAT_SHAPE.radius),
      this.body,
    );

    this.controller = world.createCharacterController(CAT_SHAPE.offset);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setSlideEnabled(true);
    this.controller.enableAutostep(CAT_SHAPE.autostepHeight, CAT_SHAPE.radius, false);
    this.controller.enableSnapToGround(CAT_SHAPE.snapToGround);
    this.controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(CAT_SHAPE.maxSlopeClimbDeg));
    this.controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(CAT_SHAPE.minSlopeSlideDeg));

    this.currCenter.set(footPosition.x, cy, footPosition.z);
    this.prevCenter.copy(this.currCenter);
  }

  /**
   * 固定刻みの更新（world.step() の直前に呼ぶ）。
   * @param cameraYaw カメラの水平角。移動入力はカメラ基準で解釈する。
   */
  fixedUpdate(dt: number, input: InputState, cameraYaw: number): void {
    const p = catParams;

    // --- 入力 → 目標の水平速度（カメラの向き基準） ---
    // カメラ前方 = (-sin yaw, 0, -cos yaw)、右 = (cos yaw, 0, -sin yaw)
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    const dir = this.tmpDir.set(
      -sin * input.moveY + cos * input.moveX,
      0,
      -cos * input.moveY - sin * input.moveX,
    );
    const inputLen = Math.min(1, dir.length());
    if (inputLen > 1e-4) dir.normalize();
    const targetVx = dir.x * p.moveSpeed * inputLen;
    const targetVz = dir.z * p.moveSpeed * inputLen;

    // --- 水平速度を目標へ近づける（空中は効きを弱める） ---
    const accel = p.groundAccel * (this.grounded ? 1 : p.airControl);
    const maxDelta = accel * dt;
    const dvx = targetVx - this.velocity.x;
    const dvz = targetVz - this.velocity.z;
    const dvLen = Math.hypot(dvx, dvz);
    if (dvLen <= maxDelta || dvLen < 1e-6) {
      this.velocity.x = targetVx;
      this.velocity.z = targetVz;
    } else {
      this.velocity.x += (dvx / dvLen) * maxDelta;
      this.velocity.z += (dvz / dvLen) * maxDelta;
    }

    // --- ジャンプ（入力の先行受付＋コヨーテタイム） ---
    if (input.consumeJump()) this.jumpBuffer = p.jumpBufferTime;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    if (this.jumpBuffer > 0 && this.timeSinceGrounded <= p.coyoteTime && !this.rising) {
      // 到達高さ h から初速を求める：v = √(2gh)
      this.velocity.y = Math.sqrt(2 * p.gravity * p.jumpHeight);
      this.jumpBuffer = 0;
      this.timeSinceGrounded = Infinity;
      this.rising = true;
    }

    // --- 重力 ---
    // 移動量は「ステップ前後の速度の平均 × dt」で求める（一定加速度なら厳密。
    // 片側だけの速度を使うとジャンプ高さが設定値より約5%低くなる）
    const vyBefore = this.velocity.y;
    this.velocity.y = Math.max(-p.maxFallSpeed, this.velocity.y - p.gravity * dt);
    const vyAverage = (vyBefore + this.velocity.y) / 2;
    if (this.velocity.y <= 0) this.rising = false;

    // 上昇中は地面への吸着を切る（切らないとジャンプ直後に引き戻される）
    if (this.rising) this.controller.disableSnapToGround();
    else this.controller.enableSnapToGround(CAT_SHAPE.snapToGround);

    // --- 衝突を考慮した移動 ---
    const desired = {
      x: this.velocity.x * dt,
      y: vyAverage * dt,
      z: this.velocity.z * dt,
    };
    this.controller.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const moved = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();

    // 天井に頭をぶつけたら上昇をやめる
    if (desired.y > 0 && moved.y < desired.y * 0.5) {
      this.velocity.y = 0;
      this.rising = false;
    }
    // 接地したら落下速度を捨てる
    if (this.grounded && this.velocity.y < 0) this.velocity.y = 0;
    // 壁に当たって進めなかった分の水平速度を捨てる（壁に張り付いて加速し続けないように）
    if (dt > 0) {
      const actualVx = moved.x / dt;
      const actualVz = moved.z / dt;
      if (Math.abs(actualVx) < Math.abs(this.velocity.x)) this.velocity.x = actualVx;
      if (Math.abs(actualVz) < Math.abs(this.velocity.z)) this.velocity.z = actualVz;
    }

    this.timeSinceGrounded = this.grounded ? 0 : this.timeSinceGrounded + dt;

    // --- 向き：移動入力の方向へなめらかに回す ---
    if (inputLen > 0.1) {
      const targetFacing = Math.atan2(-dir.x, -dir.z);
      let diff = targetFacing - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * Math.min(1, dt * 14);
    }

    // --- 位置の確定（次の world.step() で反映される） ---
    const t = this.body.translation();
    this.prevCenter.copy(this.currCenter);
    this.currCenter.set(t.x + moved.x, t.y + moved.y, t.z + moved.z);
    this.body.setNextKinematicTranslation(this.currCenter);
  }

  /** 描画用：物理ステップ間を補間した中心位置 */
  getInterpolatedCenter(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return out.lerpVectors(this.prevCenter, this.currCenter, alpha);
  }

  /** 足元の位置（最新の物理ステップ） */
  getFootPosition(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.currCenter).setY(this.currCenter.y - CAT_SHAPE.height / 2 - CAT_SHAPE.offset);
  }

  /** 検証用：指定位置へ瞬間移動（コース外へ落ちた時の安全策などに使う） */
  teleport(footPosition: { x: number; y: number; z: number }): void {
    const cy = footPosition.y + CAT_SHAPE.height / 2 + CAT_SHAPE.offset;
    this.currCenter.set(footPosition.x, cy, footPosition.z);
    this.prevCenter.copy(this.currCenter);
    this.body.setTranslation(this.currCenter, true);
    this.velocity.set(0, 0, 0);
  }
}

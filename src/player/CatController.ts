import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { catParams, CAT_SHAPE } from './CatParams';
import type { InputState } from '../input/InputState';

/**
 * 猫のキネマティック・キャラクターコントローラー。
 * 猫は物理ボディにせず、移動・ジャンプ・落下を手続き的に計算し、
 * 衝突の解決だけを Rapier の KinematicCharacterController に任せる。
 *
 * 当たり判定は四本脚の体に合わせた角丸の箱（CatParams の CAT_SHAPE）で、猫の向きと一緒に回る。
 * 向きを変える前に、回した後の形が周りとぶつからないかを調べ、ぶつかる場合は回さない
 * （狭い所では向きを保ったまま後ずさり・横歩きで動ける）。
 *
 * 位置の基準：
 * - Rapier 上のボディ位置は箱の中心
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
  /** 向き変更の判定用（本体より少しだけ小さい同じ形） */
  private readonly turnTestShape: RAPIER.RoundCuboid;
  /** 段差の乗り越え判定用（本体と同じ形） */
  private readonly bodyShape: RAPIER.RoundCuboid;
  private readonly castRot = { x: 0, y: 0, z: 0, w: 1 };
  private readonly tmpQuat = { x: 0, y: 0, z: 0, w: 1 };

  constructor(
    private readonly world: RAPIER.World,
    footPosition: { x: number; y: number; z: number },
  ) {
    const cy = footPosition.y + CAT_SHAPE.height / 2 + CAT_SHAPE.offset;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(footPosition.x, cy, footPosition.z),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(CAT_SHAPE.halfX, CAT_SHAPE.halfY, CAT_SHAPE.halfZ, CAT_SHAPE.border),
      this.body,
    );
    this.turnTestShape = new RAPIER.RoundCuboid(
      CAT_SHAPE.halfX,
      CAT_SHAPE.halfY,
      CAT_SHAPE.halfZ,
      CAT_SHAPE.border - CAT_SHAPE.turnTestShrink,
    );
    this.bodyShape = new RAPIER.RoundCuboid(CAT_SHAPE.halfX, CAT_SHAPE.halfY, CAT_SHAPE.halfZ, CAT_SHAPE.border);

    this.controller = world.createCharacterController(CAT_SHAPE.offset);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setSlideEnabled(true);
    // 段差の自動乗り越えは Rapier の機能を使わず tryStepUp() で行う
    // （底が平らな箱では、段の上から次の段へ乗るときに成否がばらついたため）
    this.controller.disableAutostep();
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
    const wasGrounded = this.grounded;
    this.controller.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    let moved: RAPIER.Vector = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();

    // 接地中に前へ進めなかったら、低い段差なら乗り越える
    if (wasGrounded && !this.rising) {
      const stepped = this.tryStepUp(desired, moved);
      if (stepped) {
        moved = stepped;
        this.grounded = true;
      }
    }

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

    // --- 位置の確定（次の world.step() で反映される） ---
    const t = this.body.translation();
    this.prevCenter.copy(this.currCenter);
    this.currCenter.set(t.x + moved.x, t.y + moved.y, t.z + moved.z);
    this.body.setNextKinematicTranslation(this.currCenter);

    // --- 向き：移動入力の方向へなめらかに回す（移動後の位置で、回した形がぶつからない範囲だけ） ---
    if (inputLen > 0.1) {
      const targetFacing = Math.atan2(-dir.x, -dir.z);
      let diff = targetFacing - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const step = diff * Math.min(1, dt * 14);
      // 全量 → 半分 → 1/4 の順に試し、最初に入れた角度を採用する。どれも入らなければ回さない
      for (const f of [1, 0.5, 0.25]) {
        const candidate = this.facing + step * f;
        if (this.canFace(this.currCenter, candidate)) {
          this.facing = candidate;
          break;
        }
      }
    }
    this.body.setNextKinematicRotation(yawQuat(this.facing, this.tmpQuat));
  }

  /**
   * 段差の乗り越え。進行方向への移動が半分未満しかできなかったとき、次の3段階で調べる。
   *  1. 真上へ（段差上限 + マージン）だけ持ち上げられるか（天井）
   *  2. 持ち上げた高さで進行方向へ進めるか
   *  3. 進んだ先で真下へ下ろし、持ち上げた範囲内に着地面があるか
   * すべて満たせば、その位置までの移動量を返す。乗り越えない場合は null。
   */
  private tryStepUp(desired: RAPIER.Vector, moved: RAPIER.Vector): RAPIER.Vector | null {
    const wantH = Math.hypot(desired.x, desired.z);
    if (wantH < 1e-5) return null;
    const dx = desired.x / wantH;
    const dz = desired.z / wantH;
    // 進行方向へ実際に進めた量が十分なら何もしない
    if (moved.x * dx + moved.z * dz >= wantH * 0.5) return null;

    const offset = CAT_SHAPE.offset;
    const pos = this.body.translation();
    const rot = yawQuat(this.facing, this.castRot);
    const flags = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;
    const cast = (from: RAPIER.Vector, dir: RAPIER.Vector, maxDist: number) =>
      this.world.castShape(from, rot, dir, this.bodyShape, 0, maxDist, true, flags, undefined, this.collider);

    // 1. 持ち上げ（天井があればその手前まで）
    const maxLift = CAT_SHAPE.autostepHeight + offset;
    const upHit = cast(pos, { x: 0, y: 1, z: 0 }, maxLift);
    const lift = upHit ? upHit.time_of_impact - offset : maxLift;
    if (lift < 0.02) return null;
    const raised = { x: pos.x, y: pos.y + lift, z: pos.z };

    // 2. 持ち上げた高さで前進（段に当たって止まった直後は速度が小さいので、最低 2cm は進ませる）
    const dist = Math.max(wantH, 0.02);
    const fwdHit = cast(raised, { x: dx, y: 0, z: dz }, dist + offset);
    const forward = fwdHit ? Math.min(dist, fwdHit.time_of_impact - offset) : dist;
    if (forward < 0.005) return null;
    const ahead = { x: raised.x + dx * forward, y: raised.y, z: raised.z + dz * forward };

    // 3. 着地面を探す（持ち上げた分より下に床が無ければ、段ではないので乗り越えない）
    const downHit = cast(ahead, { x: 0, y: -1, z: 0 }, lift);
    if (!downHit) return null;
    const drop = Math.max(0, downHit.time_of_impact - offset);
    const rise = lift - drop;
    if (rise < 0.005) return null;

    return { x: ahead.x - pos.x, y: rise, z: ahead.z - pos.z };
  }

  /** 中心 center で向き facing にしたとき、周りとぶつからないか */
  private canFace(center: THREE.Vector3, facing: number): boolean {
    const hit = this.world.intersectionWithShape(
      center,
      yawQuat(facing, this.tmpQuat),
      this.turnTestShape,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      this.collider,
    );
    return hit === null;
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
    this.body.setRotation(yawQuat(this.facing, this.tmpQuat), true);
    this.velocity.set(0, 0, 0);
  }
}

/** Y軸回りの回転を表すクォータニオン（out に書き込んで返す） */
function yawQuat(yaw: number, out: { x: number; y: number; z: number; w: number }) {
  out.x = 0;
  out.y = Math.sin(yaw / 2);
  out.z = 0;
  out.w = Math.cos(yaw / 2);
  return out;
}

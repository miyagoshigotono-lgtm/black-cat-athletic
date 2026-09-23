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
 * 状態は「通常（歩き・ジャンプ・落下）」と「登り（金網などに張り付く）」の2つ（SPEC 6.4）。
 * 登り状態では体を縦（頭が上）にし、面に沿って上下左右に動く。
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
  /** 体の傾き（0 = 水平の四つ足、π/2 = 頭が上の登り姿勢） */
  pitch = 0;
  /** 状態（resting：ゴールで丸くなって休んでいる。入力を受け付けない） */
  mode: 'normal' | 'climbing' | 'resting' = 'normal';

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
  private readonly threeQuat = new THREE.Quaternion();
  private readonly threeEuler = new THREE.Euler();

  /** 登っている面（登り状態のときだけ） */
  private climbSurface: ClimbSurface | null = null;
  /**
   * 姿勢（位置・向き・傾き）を瞬間的に切り替えた直後か。
   * 切り替えた直後はコライダーの位置が次の world.step() まで古いままなので、その1ステップは移動計算をしない。
   */
  private posePending = false;
  /** 直近の物理ステップで実際に動いた速さ [m/s]（歩きアニメーション用） */
  private movedSpeed = 0;
  /** 登りから離れた直後に、すぐ登り直さないための待ち時間 [s] */
  private climbCooldown = 0;
  /** 登り切った直後の一拍（この間は移動入力を受けない）[s] */
  private mantlePause = 0;

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
    if (this.posePending) {
      this.posePending = false;
      this.prevCenter.copy(this.currCenter);
      this.body.setNextKinematicTranslation(this.currCenter);
      this.body.setNextKinematicRotation(this.poseQuat(this.facing, this.pitch));
      return;
    }
    if (this.mode === 'climbing') {
      this.climbUpdate(dt, input);
      return;
    }
    this.climbCooldown = Math.max(0, this.climbCooldown - dt);
    if (this.mode === 'resting') {
      this.prevCenter.copy(this.currCenter);
      this.movedSpeed = 0;
      input.consumeJump();
      return;
    }
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
    // 登り切った直後は一拍おく（前へ入れっぱなしで、そのまま縁から落ちないように）
    if (this.mantlePause > 0) {
      this.mantlePause = Math.max(0, this.mantlePause - dt);
      dir.set(0, 0, 0);
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
    const inputLen = Math.min(1, dir.length());
    if (inputLen > 1e-4) dir.normalize();
    const targetVx = dir.x * p.moveSpeed * inputLen;
    const targetVz = dir.z * p.moveSpeed * inputLen;

    // --- 水平速度を目標へ近づける（空中は効きを弱める） ---
    // 空中で入力が無いときは勢いを保つ（飛び降り・助走ジャンプの勢いが空中で止まらないように）
    const keepMomentum = !this.grounded && inputLen < 0.1;
    const accel = keepMomentum ? 0 : p.groundAccel * (this.grounded ? 1 : p.airControl);
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
    this.movedSpeed = Math.hypot(moved.x, moved.z) / dt;

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
    this.body.setNextKinematicRotation(this.poseQuat(this.facing, 0));
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
    // 着地面が急な斜面なら乗り越えない（岩の丸い側面などを 12cm ずつ登ってしまうのを防ぐ）
    const normalRay = new RAPIER.Ray({ x: ahead.x, y: ahead.y, z: ahead.z }, { x: 0, y: -1, z: 0 });
    const normalHit = this.world.castRayAndGetNormal(
      normalRay,
      lift + CAT_SHAPE.height / 2 + 0.1,
      true,
      flags,
      undefined,
      this.collider,
    );
    if (!normalHit || normalHit.normal.y < Math.cos(THREE.MathUtils.degToRad(CAT_SHAPE.maxSlopeClimbDeg))) return null;
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

  // =====================================================================
  // 登り状態（SPEC 6.4）
  // =====================================================================

  get isClimbing(): boolean {
    return this.mode === 'climbing';
  }

  get isResting(): boolean {
    return this.mode === 'resting';
  }

  /** 体を押し当てて登り始められる状態か（登り中・休み中・離れた直後は不可） */
  get canAutoClimb(): boolean {
    return this.mode === 'normal' && this.climbCooldown <= 0;
  }

  /** ゴール：指定の位置・向きで丸くなって休む（以後は動かない） */
  rest(center: THREE.Vector3, facing: number): void {
    this.climbSurface = null;
    this.setPose(center, facing, 0);
    this.mode = 'resting';
    this.velocity.set(0, 0, 0);
    this.grounded = true;
  }

  /** 歩きアニメーション用の速さ [m/s] */
  get animSpeed(): number {
    return this.movedSpeed;
  }

  /** 脚で体を支えているか（接地中または登り中）。アニメーション用 */
  get supported(): boolean {
    return this.grounded || this.mode === 'climbing';
  }

  /**
   * 面に張り付いて登り状態に入る。張り付けない（周りが狭い等）場合は false。
   * 登り姿勢：縦の長さ 0.44（体長）、面からの奥行き 0.26（体高）。脚が面を向く。
   */
  startClimb(surface: ClimbSurface): boolean {
    if (this.mode === 'climbing') return false;
    const n = new THREE.Vector3(surface.normal.x, 0, surface.normal.z).normalize();
    // 面の方を向く：向き f の前方 (-sin f, -cos f) = -n
    const facing = Math.atan2(n.x, n.z);
    const foot = this.currCenter.y - CAT_SHAPE.height / 2 - CAT_SHAPE.offset;
    const off = CLIMB_WALL_GAP + CAT_SHAPE.height / 2;
    const center = new THREE.Vector3(
      surface.point.x + n.x * off,
      foot + CAT_SHAPE.length / 2 + CAT_SHAPE.offset + 0.02,
      surface.point.z + n.z * off,
    );
    if (!this.poseFree(center, facing, CLIMB_PITCH)) return false;

    this.setPose(center, facing, CLIMB_PITCH);
    this.mode = 'climbing';
    this.climbSurface = { ...surface, normal: n, point: surface.point.clone() };
    this.velocity.set(0, 0, 0);
    this.rising = false;
    this.controller.disableSnapToGround();
    return true;
  }

  /** 爪を離した：その場で面から離れて落ちる */
  stopClimb(): void {
    if (this.mode !== 'climbing') return;
    this.leaveWall('drop');
  }

  private climbUpdate(dt: number, input: InputState): void {
    const s = this.climbSurface!;
    const n = s.normal;

    // ジャンプ：後ろへ飛び降りる
    if (input.consumeJump()) {
      this.leaveWall('jump');
      return;
    }

    // 面を向いた猫から見た右 = (n.z, 0, -n.x)
    const vUp = input.moveY * CLIMB_SPEED;
    const vSide = input.moveX * CLIMB_SPEED * CLIMB_SIDE_RATIO;
    const desired = { x: n.z * vSide * dt, y: vUp * dt, z: -n.x * vSide * dt };
    this.controller.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const m = this.controller.computedMovement();
    const moved = { x: m.x, y: m.y, z: m.z };
    const t = this.body.translation();
    const next = new THREE.Vector3(t.x + moved.x, t.y + moved.y, t.z + moved.z);

    // 横へ面から外れる移動はさせない（面の端で止まる）
    if (!this.onSurface(next, 0)) {
      moved.x = 0;
      moved.z = 0;
      next.set(t.x, t.y + moved.y, t.z);
    }
    // 上の縁：頭の位置が面から外れたら乗り越える（乗り越えられなければそこで止まる）
    if (vUp > 0 && !this.onSurface(next, CLIMB_HEAD_PROBE)) {
      if (this.mantle()) return;
      moved.y = 0;
      next.set(t.x + moved.x, t.y, t.z + moved.z);
    }
    // 下：降りようとして床に着いたら四つ足に戻る
    if (desired.y < 0 && moved.y > desired.y * 0.5) {
      this.leaveWall('floor');
      return;
    }

    this.prevCenter.copy(this.currCenter);
    this.currCenter.copy(next);
    this.movedSpeed = Math.hypot(moved.x, moved.y, moved.z) / dt;
    this.grounded = false;
    this.body.setNextKinematicTranslation(this.currCenter);
    this.body.setNextKinematicRotation(this.poseQuat(this.facing, this.pitch));
  }

  /** 中心 center（登り姿勢）から、高さ upOffset の所で面に向けた光線が、登っている面に当たるか */
  private onSurface(center: THREE.Vector3, upOffset: number): boolean {
    const s = this.climbSurface!;
    const ray = new RAPIER.Ray(
      { x: center.x, y: center.y + upOffset, z: center.z },
      { x: -s.normal.x, y: 0, z: -s.normal.z },
    );
    const reach = CLIMB_WALL_GAP + CAT_SHAPE.height / 2 + 0.08;
    const handle = s.collider.handle;
    const hit = this.world.castRay(ray, reach, true, undefined, undefined, undefined, undefined, (c) => c.handle === handle);
    return hit !== null;
  }

  /**
   * 上の縁の乗り越え。面の向こう側（厚み＋体の半長＋余裕）へ四つ足で移る。
   * - そこに縁の高さの床があれば（台など）その上に乗る
   * - 無ければ（薄い金網）縁のすぐ上に出て、向こう側へ落ちる
   */
  private mantle(): boolean {
    const s = this.climbSurface!;
    const n = s.normal;
    // 登っていた面の上の点（いまの中心から、面までの距離を戻した所）
    const planeOffset = CLIMB_WALL_GAP + CAT_SHAPE.height / 2;
    const planeX = this.currCenter.x - n.x * planeOffset;
    const planeZ = this.currCenter.z - n.z * planeOffset;

    // まず「縁のすぐ内側」に立てるか（木の股・台など、上に乗れる面がある場合）。
    // 体の後ろ端が面のあたりに来る位置にする。奥まで進めると、そのまま歩いて落ちてしまう。
    const ledgeBack = CAT_SHAPE.length / 2 + 0.02;
    let x = planeX - n.x * ledgeBack;
    let z = planeZ - n.z * ledgeBack;
    const floorAt = (px: number, pz: number): number | null => {
      const ray = new RAPIER.Ray({ x: px, y: s.topY + 0.5, z: pz }, { x: 0, y: -1, z: 0 });
      const hit = this.world.castRay(ray, 0.6, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
      return hit ? s.topY + 0.5 - hit.timeOfImpact : null;
    };
    let floorY = floorAt(x, z);
    let onLedge = floorY !== null && Math.abs(floorY - s.topY) < 0.06;
    if (!onLedge) {
      // 上に乗れる面が無い（薄い金網など）：面の厚みぶん向こう側へ出て、落ちる
      const back = planeOffset + s.thickness + CAT_SHAPE.length / 2 + 0.03;
      x = this.currCenter.x - n.x * back;
      z = this.currCenter.z - n.z * back;
      floorY = floorAt(x, z);
      onLedge = floorY !== null && Math.abs(floorY - s.topY) < 0.06;
    }
    const y = onLedge
      ? floorY! + CAT_SHAPE.height / 2 + CAT_SHAPE.offset
      : s.topY + CAT_SHAPE.height / 2 + CAT_SHAPE.offset + 0.02;
    const center = new THREE.Vector3(x, y, z);
    // 通り道：面の真上（縁のすぐ上）を四つ足の体が通れること（縁の上に屋根や別の壁があれば乗り越えない）
    const planeOff = CLIMB_WALL_GAP + CAT_SHAPE.height / 2 + s.thickness / 2;
    const passage = new THREE.Vector3(
      this.currCenter.x - n.x * planeOff,
      s.topY + CAT_SHAPE.height / 2 + CAT_SHAPE.offset + 0.02,
      this.currCenter.z - n.z * planeOff,
    );
    if (!this.poseFree(passage, this.facing, 0)) return false;
    if (!this.poseFree(center, this.facing, 0)) return false;

    this.setPose(center, this.facing, 0);
    this.mode = 'normal';
    this.climbSurface = null;
    this.climbCooldown = CLIMB_RETRY_DELAY;
    if (onLedge) this.mantlePause = MANTLE_PAUSE;
    // 薄い金網の場合は、向こう側へ少し押し出しながら落とす
    this.velocity.set(onLedge ? 0 : -n.x * 0.8, 0, onLedge ? 0 : -n.z * 0.8);
    this.timeSinceGrounded = Infinity;
    return true;
  }

  /**
   * 面から離れて四つ足に戻る。
   * - drop：爪を離した（面を向いたまま落ちる）
   * - jump：後ろへ飛び降りる（面と反対を向いて跳ぶ）
   * - floor：下まで降りて床に着いた
   */
  private leaveWall(kind: 'drop' | 'jump' | 'floor'): void {
    const s = this.climbSurface!;
    const n = s.normal;
    const facing = kind === 'jump' ? Math.atan2(-n.x, -n.z) : this.facing;
    // 登り姿勢の下端の高さを保ったまま、四つ足の体（長さ 0.44）が面に触れない位置へずらす
    const bottom = this.currCenter.y - CAT_SHAPE.length / 2 - CAT_SHAPE.offset;
    const shift = CAT_SHAPE.length / 2 - CAT_SHAPE.height / 2;
    const y = bottom + CAT_SHAPE.height / 2 + CAT_SHAPE.offset;

    let placed = false;
    for (const extra of [0, 0.05, 0.12]) {
      const center = new THREE.Vector3(
        this.currCenter.x + n.x * (shift + extra),
        y,
        this.currCenter.z + n.z * (shift + extra),
      );
      if (this.poseFree(center, facing, 0)) {
        this.setPose(center, facing, 0);
        placed = true;
        break;
      }
    }
    // どこにも置けない（周りが極端に狭い）ときは、その場で四つ足に戻す
    if (!placed) this.setPose(this.currCenter.clone(), facing, 0);

    this.mode = 'normal';
    this.climbSurface = null;
    this.climbCooldown = CLIMB_RETRY_DELAY;
    this.timeSinceGrounded = Infinity;
    if (kind === 'jump') {
      const p = catParams;
      this.velocity.set(n.x * CLIMB_JUMP_BACK_SPEED, Math.sqrt(2 * p.gravity * CLIMB_JUMP_HEIGHT), n.z * CLIMB_JUMP_BACK_SPEED);
      this.rising = true;
    } else {
      this.velocity.set(0, 0, 0);
      this.rising = false;
    }
  }

  /** 位置・向き・傾きを瞬間的に切り替える */
  private setPose(center: THREE.Vector3, facing: number, pitch: number): void {
    this.currCenter.copy(center);
    this.prevCenter.copy(center);
    this.facing = facing;
    this.pitch = pitch;
    const q = this.poseQuat(facing, pitch);
    this.body.setTranslation(center, true);
    this.body.setRotation(q, true);
    this.body.setNextKinematicTranslation(center);
    this.body.setNextKinematicRotation(q);
    this.posePending = true;
  }

  /** その姿勢で周りとぶつからないか */
  private poseFree(center: THREE.Vector3, facing: number, pitch: number): boolean {
    const hit = this.world.intersectionWithShape(
      center,
      this.poseQuat(facing, pitch),
      this.turnTestShape,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      this.collider,
    );
    return hit === null;
  }

  /** 向き（Y軸回り）と傾き（体の左右軸回り）から回転を作る */
  private poseQuat(facing: number, pitch: number): RAPIER.Rotation {
    // 'YXZ'：先に傾け（X）、その後で向きを変える（Y）
    this.threeQuat.setFromEuler(this.threeEuler.set(pitch, facing, 0, 'YXZ'));
    this.tmpQuat.x = this.threeQuat.x;
    this.tmpQuat.y = this.threeQuat.y;
    this.tmpQuat.z = this.threeQuat.z;
    this.tmpQuat.w = this.threeQuat.w;
    return this.tmpQuat;
  }

  /** 描画用：物理ステップ間を補間した中心位置 */
  getInterpolatedCenter(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return out.lerpVectors(this.prevCenter, this.currCenter, alpha);
  }

  /** 足元の位置（最新の物理ステップ） */
  getFootPosition(out: THREE.Vector3): THREE.Vector3 {
    // 登り姿勢では体長の半分が下へ伸びる
    const half = this.mode === 'climbing' ? CAT_SHAPE.length / 2 : CAT_SHAPE.height / 2;
    return out.copy(this.currCenter).setY(this.currCenter.y - half - CAT_SHAPE.offset);
  }

  /** 検証用：指定位置へ瞬間移動（コース外へ落ちた時の安全策などに使う） */
  teleport(footPosition: { x: number; y: number; z: number }): void {
    const cy = footPosition.y + CAT_SHAPE.height / 2 + CAT_SHAPE.offset;
    this.currCenter.set(footPosition.x, cy, footPosition.z);
    this.prevCenter.copy(this.currCenter);
    this.mode = 'normal';
    this.climbSurface = null;
    this.pitch = 0;
    this.body.setTranslation(this.currCenter, true);
    this.body.setRotation(this.poseQuat(this.facing, 0), true);
    this.velocity.set(0, 0, 0);
  }
}

/** 登っている面の情報 */
export interface ClimbSurface {
  collider: RAPIER.Collider;
  /** 爪が当たった点 */
  point: THREE.Vector3;
  /** 面の外向きの法線 */
  normal: THREE.Vector3;
  /** 面の上端の高さ */
  topY: number;
  /** 面の厚み（乗り越え先の計算用） */
  thickness: number;
}

/** 登り姿勢の傾き（頭が真上） */
const CLIMB_PITCH = Math.PI / 2;
/** 登る速さ [m/s] */
const CLIMB_SPEED = 1.0;
/** 横移動の速さ（登る速さに対する割合） */
const CLIMB_SIDE_RATIO = 0.7;
/** 登り姿勢で面と体の間にあけるすき間 [m] */
const CLIMB_WALL_GAP = 0.015;
/** 縁の検出に使う「頭の位置」（中心からの高さ）[m] */
const CLIMB_HEAD_PROBE = 0.18;
/** 登り切って縁に乗った直後、移動入力を受けない時間 [s] */
const MANTLE_PAUSE = 0.25;
/** 登りから離れた後、すぐ登り直さないための待ち時間 [s] */
const CLIMB_RETRY_DELAY = 0.4;
/** 後ろへ飛び降りるときの水平速度 [m/s] と跳ね上がる高さ [m] */
const CLIMB_JUMP_BACK_SPEED = 2.0;
const CLIMB_JUMP_HEIGHT = 0.3;

/** Y軸回りの回転を表すクォータニオン（out に書き込んで返す） */
function yawQuat(yaw: number, out: { x: number; y: number; z: number; w: number }) {
  out.x = 0;
  out.y = Math.sin(yaw / 2);
  out.z = 0;
  out.w = Math.cos(yaw / 2);
  return out;
}

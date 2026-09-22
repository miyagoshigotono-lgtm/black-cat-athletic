import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { InputState } from '../input/InputState';

/** プレイ用カメラの調整値（デバッグパネルから変更可） */
export const playCameraParams = {
  /** 猫からの標準距離 [m] */
  distance: 1.8,
  /** 注視点の高さ（猫カプセル中心からの上乗せ）[m] */
  targetHeight: 0.15,
  /** 見下ろし角の下限・上限 [rad]（負で見上げ） */
  minPitch: -0.35,
  maxPitch: 1.3,
  /** めり込み判定に飛ばす球の半径 [m]（ニアクリップ面の四隅を覆う大きさ） */
  probeRadius: 0.1,
  /** 障害物が無くなった後に標準距離へ戻る速さ [1/s] */
  returnSpeed: 4,
  /** この距離より近いと猫を半透明にし始める [m] */
  fadeStart: 0.55,
  /** この距離より近いと猫を完全に消す [m] */
  fadeEnd: 0.28,
};

/**
 * 三人称のプレイ用カメラ（注視点の周りを回るオービット型）。
 *
 * 壁・狭所でのめり込み対策（作者と合意した A＋D 案）：
 *  A. 注視点から理想のカメラ位置へ球を飛ばし（Rapier の castShape）、
 *     当たった地点の手前にカメラを置く。寄るときは即座に、離れるときはゆっくり。
 *  D. カメラが猫に近づきすぎたら猫を半透明→非表示にし、画面が猫で埋まらないようにする。
 *
 * 導入演出用カメラとは別系統（SPEC 5章）。切り替えは CameraRig が担当する。
 */
export class PlayCamera {
  /** 水平角。0 のときカメラは猫の +Z 側にいて -Z を向く */
  yaw = 0;
  /** 見下ろし角 */
  pitch = 0.35;
  /** 現在のカメラ距離（めり込み対策で縮む） */
  currentDistance = playCameraParams.distance;
  /** 猫の不透明度（D 案の結果。描画側が使う） */
  catOpacity = 1;

  private probe: RAPIER.Ball;
  private readonly target = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly identityRot = { x: 0, y: 0, z: 0, w: 1 };

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly world: RAPIER.World,
    /** 判定から除外する猫のコライダー */
    private readonly ignoreCollider: RAPIER.Collider,
  ) {
    this.probe = new RAPIER.Ball(playCameraParams.probeRadius);
  }

  /**
   * 描画フレームごとの更新。
   * @param catCenter 補間済みの猫カプセル中心
   */
  update(dt: number, input: InputState, catCenter: THREE.Vector3): void {
    const p = playCameraParams;

    // --- 視点入力 ---
    const look = input.consumeLook();
    this.yaw += look.yaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.pitch, p.minPitch, p.maxPitch);

    // --- 注視点とカメラ方向 ---
    this.target.set(catCenter.x, catCenter.y + p.targetHeight, catCenter.z);
    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    // --- A 案：球を飛ばして障害物までの距離を得る ---
    if (this.probe.radius !== p.probeRadius) this.probe = new RAPIER.Ball(p.probeRadius);
    let allowed = p.distance;
    const hit = this.world.castShape(
      this.target,
      this.identityRot,
      this.dir, // 単位ベクトルなので time_of_impact がそのまま距離[m]になる
      this.probe,
      0,
      p.distance,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      this.ignoreCollider,
    );
    if (hit) allowed = Math.max(0, hit.time_of_impact);

    // 寄るときは即座に（めり込みを1フレームも見せない）、離れるときはなめらかに
    if (allowed < this.currentDistance) {
      this.currentDistance = allowed;
    } else {
      const k = 1 - Math.exp(-p.returnSpeed * dt);
      this.currentDistance += (allowed - this.currentDistance) * k;
    }

    this.camera.position.copy(this.target).addScaledVector(this.dir, this.currentDistance);
    // lookAt は距離0で向きが不定になるため、角度から直接向きを決める
    this.camera.rotation.set(-this.pitch, this.yaw, 0, 'YXZ');

    // --- D 案：近すぎるときは猫を消す ---
    this.catOpacity = THREE.MathUtils.clamp(
      (this.currentDistance - p.fadeEnd) / (p.fadeStart - p.fadeEnd),
      0,
      1,
    );
  }
}

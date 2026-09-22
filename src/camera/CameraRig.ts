import type * as THREE from 'three';
import type { InputState } from '../input/InputState';
import type { PlayCamera } from './PlayCamera';

/**
 * カメラ系統の切り替え役。
 * SPEC 5章「プレイ用カメラと導入演出用カメラは別系統」に備えた土台。
 * ① ではプレイ用のみ。導入演出用（ゴール → 全体 → 猫へズーム）は後の段階で 'intro' として追加する。
 */
export type CameraMode = 'play';

export class CameraRig {
  mode: CameraMode = 'play';

  constructor(readonly play: PlayCamera) {}

  get camera(): THREE.PerspectiveCamera {
    return this.play.camera;
  }

  /** プレイ用カメラから見た水平角（移動入力の基準） */
  get controlYaw(): number {
    return this.play.yaw;
  }

  update(dt: number, input: InputState, catCenter: THREE.Vector3): void {
    switch (this.mode) {
      case 'play':
        this.play.update(dt, input, catCenter);
        break;
    }
  }
}

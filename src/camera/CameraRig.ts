import * as THREE from 'three';
import { InputState } from '../input/InputState';
import type { PlayCamera } from './PlayCamera';
import type { IntroCamera } from './IntroCamera';

/**
 * カメラ系統の切り替え役（SPEC 5章「プレイ用カメラと導入演出用カメラは別系統」）。
 *  - intro：ステージ開始の演出（ゴール → 全体 → 猫へ）。終わると自動で play へ
 *  - play：三人称のプレイ用カメラ
 */
export type CameraMode = 'intro' | 'play';

export class CameraRig {
  mode: CameraMode = 'play';
  private intro: IntroCamera | null = null;
  /** 演出中はプレイ用カメラに入力を渡さないための、空の入力 */
  private readonly idle = new InputState();
  private readonly playPos = new THREE.Vector3();

  constructor(readonly play: PlayCamera) {}

  get camera(): THREE.PerspectiveCamera {
    return this.play.camera;
  }

  /** プレイ用カメラから見た水平角（移動入力の基準） */
  get controlYaw(): number {
    return this.play.yaw;
  }

  /** 導入演出を始める */
  startIntro(intro: IntroCamera): void {
    this.intro = intro;
    this.mode = 'intro';
  }

  /** 演出を飛ばす（画面を触った・キーを押した） */
  skipIntro(): void {
    if (this.mode === 'intro') this.intro?.skip();
  }

  update(dt: number, input: InputState, catCenter: THREE.Vector3): void {
    if (this.mode === 'intro' && this.intro) {
      // 先にプレイ用カメラを更新して「演出の終わりの位置・向き」を得る（猫を追い続ける）
      this.play.update(dt, this.idle, catCenter);
      this.playPos.copy(this.play.camera.position);
      this.intro.update(dt, this.camera, this.playPos, this.play.lookTarget);
      if (this.intro.done) {
        this.intro = null;
        this.mode = 'play';
      }
      return;
    }
    this.play.update(dt, input, catCenter);
  }
}

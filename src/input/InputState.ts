/** 視点操作の感度（デバッグパネルから調整可） */
export const lookParams = {
  /** マウス：1ピクセルあたりの回転量 [rad] */
  mouseSensitivity: 0.0025,
  /** タッチ：1ピクセルあたりの回転量 [rad] */
  touchSensitivity: 0.006,
  /** 上下反転 */
  invertY: false,
};

/**
 * PC・スマホどちらの入力も、この共通の形に揃える。
 * 猫やカメラはこのクラスだけを見れば良く、入力元を意識しない。
 */
export class InputState {
  /** 移動入力（左右）：-1（左）〜 1（右） */
  moveX = 0;
  /** 移動入力（前後）：-1（後ろ）〜 1（前） */
  moveY = 0;

  /** このフレームで溜まった視点回転量（ラジアン）。カメラが読んだら消す */
  lookYaw = 0;
  lookPitch = 0;

  /** ジャンプを押している */
  jumpHeld = false;
  /** 爪を押している（① では動作なし） */
  clawHeld = false;

  /** 押した瞬間のイベント（物理ステップで消費するまで保持） */
  private jumpQueued = false;
  private clawQueued = false;

  // --- 入力元から呼ぶ ---

  pressJump(): void {
    this.jumpQueued = true;
    this.jumpHeld = true;
  }

  releaseJump(): void {
    this.jumpHeld = false;
  }

  pressClaw(): void {
    this.clawQueued = true;
    this.clawHeld = true;
  }

  releaseClaw(): void {
    this.clawHeld = false;
  }

  addLook(yaw: number, pitch: number): void {
    this.lookYaw += yaw;
    this.lookPitch += pitch;
  }

  // --- 利用側から呼ぶ ---

  /** ジャンプの押下を1回分取り出す */
  consumeJump(): boolean {
    const v = this.jumpQueued;
    this.jumpQueued = false;
    return v;
  }

  /** 爪の押下を1回分取り出す（② で使用予定） */
  consumeClaw(): boolean {
    const v = this.clawQueued;
    this.clawQueued = false;
    return v;
  }

  /** 視点回転量を取り出して消す */
  consumeLook(): { yaw: number; pitch: number } {
    const v = { yaw: this.lookYaw, pitch: this.lookPitch };
    this.lookYaw = 0;
    this.lookPitch = 0;
    return v;
  }
}

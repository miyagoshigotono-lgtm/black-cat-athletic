import { InputState, lookParams } from './InputState';
import type { TouchControls } from '../ui/TouchControls';

/** ジョイスティックを受け付ける範囲（画面幅に対する左側の割合） */
const JOYSTICK_AREA_RATIO = 0.45;
/** ジョイスティックの遊び（この割合より小さい傾きは0扱い） */
const JOYSTICK_DEAD_ZONE = 0.12;

/**
 * スマホ用入力。
 * - 画面左側：触れた位置を中心にした仮想ジョイスティックで移動
 * - 画面右側：スワイプで視点
 * - ボタン：ジャンプ、爪
 * 複数の指を pointerId ごとに役割分担して扱う。
 */
export class TouchInput {
  private joyPointer: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private lookPointer: number | null = null;
  private lookLast = { x: 0, y: 0 };

  /** 初めてタッチされたときの通知（タッチUIを表示するため） */
  onFirstTouch: () => void = () => {};

  constructor(
    private readonly input: InputState,
    private readonly ui: TouchControls,
    /** 画面全体のタッチを拾う要素 */
    surface: HTMLElement,
  ) {
    surface.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));

    this.bindButton(ui.jumpButton, () => input.pressJump(), () => input.releaseJump());
    this.bindButton(ui.clawButton, () => input.pressClaw(), () => input.releaseClaw());

    // iOS Safari のピンチ操作による拡大を止める
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    this.onFirstTouch();
    e.preventDefault();

    if (e.clientX < window.innerWidth * JOYSTICK_AREA_RATIO) {
      if (this.joyPointer !== null) return;
      this.joyPointer = e.pointerId;
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.ui.showJoystick(e.clientX, e.clientY);
      this.setMove(0, 0);
    } else {
      if (this.lookPointer !== null) return;
      this.lookPointer = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId === this.joyPointer) {
      const r = this.ui.joystickRadius;
      let dx = e.clientX - this.joyOrigin.x;
      let dy = e.clientY - this.joyOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > r) {
        dx = (dx / len) * r;
        dy = (dy / len) * r;
      }
      this.ui.moveKnob(dx, dy);
      // 画面の上方向（dy が負）を「前」にする
      this.setMove(dx / r, -dy / r);
    } else if (e.pointerId === this.lookPointer) {
      const dx = e.clientX - this.lookLast.x;
      const dy = e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
      const s = lookParams.touchSensitivity;
      const inv = lookParams.invertY ? -1 : 1;
      this.input.addLook(-dx * s, dy * s * inv);
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId === this.joyPointer) {
      this.joyPointer = null;
      this.ui.hideJoystick();
      this.setMove(0, 0);
    } else if (e.pointerId === this.lookPointer) {
      this.lookPointer = null;
    }
  }

  /** 遊びを除いて移動入力に反映する */
  private setMove(x: number, y: number): void {
    const len = Math.hypot(x, y);
    if (len < JOYSTICK_DEAD_ZONE) {
      this.input.moveX = 0;
      this.input.moveY = 0;
      return;
    }
    // 遊びの外側を 0〜1 に引き伸ばす
    const scaled = Math.min(1, (len - JOYSTICK_DEAD_ZONE) / (1 - JOYSTICK_DEAD_ZONE));
    this.input.moveX = (x / len) * scaled;
    this.input.moveY = (y / len) * scaled;
  }

  private bindButton(button: HTMLButtonElement, press: () => void, release: () => void): void {
    button.addEventListener('pointerdown', (e) => {
      // 下の層（ジョイスティック・視点）に伝えない
      e.stopPropagation();
      e.preventDefault();
      this.onFirstTouch();
      this.ui.setPressed(button, true);
      press();
      // 指がボタンの外へずれても離すまで押しっぱなし扱いにする（失敗しても押下は有効）
      try {
        button.setPointerCapture(e.pointerId);
      } catch {
        // 取得できない環境では何もしない
      }
    });
    const up = () => {
      this.ui.setPressed(button, false);
      release();
    };
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
  }
}

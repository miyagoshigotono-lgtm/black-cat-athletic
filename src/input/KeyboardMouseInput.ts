import { InputState, lookParams } from './InputState';

/**
 * PC 用入力：WASD・Space・Shift とマウス視点（ポインターロック）。
 * iOS Safari はポインターロック非対応のため、タッチ入力（TouchInput）とは別系統にしている。
 */
export class KeyboardMouseInput {
  private readonly keys = new Set<string>();
  private readonly listeners: Array<() => void> = [];
  /** 前フレームでキーによる移動入力があったか（離したときに0へ戻すため） */
  private hadKeyMove = false;

  /** ポインターロック状態が変わったときの通知 */
  onLockChange: (locked: boolean) => void = () => {};

  constructor(
    private readonly input: InputState,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.listen(window, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    this.listen(window, 'keyup', (e) => this.onKeyUp(e as KeyboardEvent));
    this.listen(window, 'blur', () => this.releaseAll());
    this.listen(document, 'mousemove', (e) => this.onMouseMove(e as MouseEvent));
    this.listen(document, 'pointerlockchange', () => {
      const locked = this.isLocked;
      if (!locked) this.releaseAll();
      this.onLockChange(locked);
    });
    // マウスでクリックしたときだけポインターロックを要求する（タッチでは要求しない）
    this.listen(canvas, 'pointerdown', (e) => {
      if ((e as PointerEvent).pointerType === 'mouse' && !this.isLocked) this.requestLock();
    });
  }

  get isLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  requestLock(): void {
    // 対応していない環境では何もしない
    if (!('requestPointerLock' in this.canvas)) return;
    try {
      const p = this.canvas.requestPointerLock() as unknown;
      if (p instanceof Promise) p.catch(() => {});
    } catch {
      // 失敗しても操作不能にはしない
    }
  }

  /** 毎フレーム呼び、押しているキーから移動入力を作る */
  update(): void {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    // 斜め移動が速くならないように長さを1にそろえる
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    // タッチ側が入力中でなければキーボードの値を使う
    if (x !== 0 || y !== 0 || this.hadKeyMove) {
      this.input.moveX = x;
      this.input.moveY = y;
    }
    this.hadKeyMove = x !== 0 || y !== 0;
  }

  dispose(): void {
    for (const off of this.listeners) off();
    this.listeners.length = 0;
  }

  private onKeyDown(e: KeyboardEvent): void {
    // デバッグパネルの入力欄などに入力中は無視
    if (isTextInput(e.target)) return;
    this.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'Space') {
      this.input.pressJump();
      e.preventDefault();
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.input.pressClaw();
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
    if (e.code === 'Space') this.input.releaseJump();
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.input.releaseClaw();
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isLocked) return;
    const s = lookParams.mouseSensitivity;
    const inv = lookParams.invertY ? -1 : 1;
    // 右へ動かす → 右を向く（yaw 減少）、上へ動かす → 上を見る（pitch 減少＝カメラが下がる）
    this.input.addLook(-e.movementX * s, e.movementY * s * inv);
  }

  private releaseAll(): void {
    this.keys.clear();
    this.input.releaseJump();
    this.input.releaseClaw();
  }

  private listen(target: EventTarget, type: string, fn: (e: Event) => void): void {
    target.addEventListener(type, fn, { passive: false });
    this.listeners.push(() => target.removeEventListener(type, fn));
  }
}

function isTextInput(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
}

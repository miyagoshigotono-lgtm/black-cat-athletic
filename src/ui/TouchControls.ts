/**
 * スマホ用の画面内操作部品（見た目だけ）。
 * - 左側：仮想ジョイスティック（触れた位置に出る）
 * - 右下：ジャンプボタン、爪ボタン（爪は ① では配置のみ・動作なし）
 * 入力の処理は TouchInput が行う。
 */
export class TouchControls {
  /** タッチを受け付ける全画面の層 */
  readonly layer: HTMLDivElement;
  readonly jumpButton: HTMLButtonElement;
  readonly clawButton: HTMLButtonElement;
  /** ジョイスティックの可動半径 [px] */
  readonly joystickRadius = 56;

  private readonly joyBase: HTMLDivElement;
  private readonly joyKnob: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.layer = el('div', 'touch-layer');
    this.joyBase = el('div', 'joy-base');
    this.joyKnob = el('div', 'joy-knob');
    this.joyBase.appendChild(this.joyKnob);

    this.jumpButton = el('button', 'touch-btn touch-btn-jump');
    this.jumpButton.textContent = 'ジャンプ';
    this.clawButton = el('button', 'touch-btn touch-btn-claw');
    this.clawButton.textContent = '爪';

    for (const b of [this.jumpButton, this.clawButton]) {
      b.type = 'button';
      // 長押しメニューやフォーカス枠を出さない
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    this.layer.append(this.joyBase, this.jumpButton, this.clawButton);
    parent.appendChild(this.layer);
    this.hideJoystick();
  }

  setVisible(visible: boolean): void {
    this.layer.classList.toggle('visible', visible);
  }

  get visible(): boolean {
    return this.layer.classList.contains('visible');
  }

  /** ジョイスティックを画面座標 (x, y) に表示する */
  showJoystick(x: number, y: number): void {
    this.joyBase.style.display = 'block';
    this.joyBase.style.left = `${x}px`;
    this.joyBase.style.top = `${y}px`;
    this.moveKnob(0, 0);
  }

  /** ノブを中心からのずれ (dx, dy)[px] に動かす */
  moveKnob(dx: number, dy: number): void {
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  hideJoystick(): void {
    this.joyBase.style.display = 'none';
  }

  setPressed(button: HTMLButtonElement, pressed: boolean): void {
    button.classList.toggle('pressed', pressed);
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}

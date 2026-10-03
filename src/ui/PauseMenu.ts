/**
 * 一時停止メニュー（SPEC 9.1）。
 *
 * 高い所から落ちて登り直す気が失せたとき、ブラウザを再読み込みするしか手が無いのは不親切なので、
 * ゲーム中からいつでも「最初から」「ステージ選択」に戻れるようにする。
 *
 * 画面右上の小さなボタンで開く。PC では Esc でポインターロックが外れた後に押せる。
 * キーボードからは P でも開閉できる。
 */
export interface PauseActions {
  /** 続ける（メニューを閉じる） */
  onResume: () => void;
  /** 同じステージを最初から */
  onRetry: () => void;
  /** ステージ選択へ戻る */
  onSelect: () => void;
}

export class PauseMenu {
  private readonly button: HTMLButtonElement;
  private readonly overlay: HTMLDivElement;
  private open = false;
  private available = true;

  constructor(parent: HTMLElement, private readonly actions: PauseActions) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'pause-button';
    this.button.textContent = '❚❚';
    this.button.setAttribute('aria-label', '一時停止');
    this.button.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.button.addEventListener('click', () => this.setOpen(true));

    this.overlay = document.createElement('div');
    this.overlay.className = 'pause-overlay';
    const title = document.createElement('div');
    title.className = 'pause-title';
    title.textContent = '一時停止';
    const row = document.createElement('div');
    row.className = 'clear-buttons';
    row.append(
      this.menuButton('続ける', () => { this.setOpen(false); this.actions.onResume(); }, true),
      this.menuButton('最初から', this.actions.onRetry, false),
      this.menuButton('ステージ選択', this.actions.onSelect, false),
    );
    this.overlay.append(title, row);

    parent.append(this.button, this.overlay);
  }

  private menuButton(label: string, run: () => void, primary: boolean): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = primary ? 'clear-retry clear-primary' : 'clear-retry';
    b.textContent = label;
    // ポインターロックの取得やタッチ操作に拾われないようにする
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', run);
    return b;
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** 開閉する（閉じるときは呼び出し側で onResume 相当の後始末をする） */
  setOpen(open: boolean): void {
    this.open = open;
    this.overlay.classList.toggle('visible', open);
    this.syncButton();
  }

  /** ボタンごと隠す（導入演出中・クリア後） */
  setAvailable(available: boolean): void {
    this.available = available;
    if (!available) {
      this.open = false;
      this.overlay.classList.remove('visible');
    }
    this.syncButton();
  }

  /** ボタンは「使える状態」かつ「メニューを開いていない」ときだけ出す */
  private syncButton(): void {
    this.button.classList.toggle('hidden', !this.available || this.open);
  }
}

/**
 * クリア表示（SPEC 9.1）。
 * 「クリア」とステージ名、「次のステージへ」「もう一度」「ステージ選択」を出す。
 */
export interface ClearActions {
  /** もう一度同じステージを遊ぶ */
  onRetry: () => void;
  /** 次のステージへ（次が無ければ渡さない） */
  onNext?: { label: string; run: () => void };
  /** ステージ選択画面へ戻る */
  onSelect: () => void;
}

export class ClearOverlay {
  private readonly el: HTMLDivElement;

  constructor(parent: HTMLElement, stageName: string, actions: ClearActions) {
    this.el = document.createElement('div');
    this.el.className = 'clear-overlay';
    const title = document.createElement('div');
    title.className = 'clear-title';
    title.textContent = 'クリア';
    const sub = document.createElement('div');
    sub.className = 'clear-sub';
    sub.textContent = stageName;
    this.el.append(title, sub);

    const row = document.createElement('div');
    row.className = 'clear-buttons';
    if (actions.onNext) row.appendChild(this.button(actions.onNext.label, actions.onNext.run, true));
    row.appendChild(this.button('もう一度', actions.onRetry, false));
    row.appendChild(this.button('ステージ選択', actions.onSelect, false));
    this.el.appendChild(row);
    parent.appendChild(this.el);
  }

  private button(label: string, run: () => void, primary: boolean): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = primary ? 'clear-retry clear-primary' : 'clear-retry';
    b.textContent = label;
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', run);
    return b;
  }

  show(): void {
    this.el.classList.add('visible');
  }
}

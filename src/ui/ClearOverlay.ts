/**
 * クリア表示（SPEC 9.1）。
 * 「クリア」とステージ名、「もう一度」ボタンを出す。演出の作り込みは後の段階。
 */
export class ClearOverlay {
  private readonly el: HTMLDivElement;

  constructor(parent: HTMLElement, stageName: string, onRetry: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'clear-overlay';
    const title = document.createElement('div');
    title.className = 'clear-title';
    title.textContent = 'クリア';
    const sub = document.createElement('div');
    sub.className = 'clear-sub';
    sub.textContent = stageName;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'clear-retry';
    retry.textContent = 'もう一度';
    retry.addEventListener('pointerdown', (e) => e.stopPropagation());
    retry.addEventListener('click', onRetry);
    this.el.append(title, sub, retry);
    parent.appendChild(this.el);
  }

  show(): void {
    this.el.classList.add('visible');
  }
}

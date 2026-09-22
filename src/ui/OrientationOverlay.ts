/**
 * 横向き固定の補助（SPEC 11章-4）。
 * - マニフェストで orientation: landscape を指定済み（インストール時に効く）
 * - Screen Orientation API でのロックを試す（Android の全画面・PWA 等でのみ成功する。失敗は無視）
 * - 縦向きのときは「端末を横にしてください」を表示する（表示の切り替えは CSS のメディアクエリ）
 *   PC で縦長ウィンドウにしたときに出ないよう、タッチ主体の端末に限る。
 */
export class OrientationOverlay {
  constructor(parent: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'orientation-overlay';
    el.innerHTML = '<div class="orientation-icon">📱↻</div><div>端末を横にしてください</div>';
    parent.appendChild(el);

    // 最初の操作のタイミングでロックを試す（ユーザー操作が必要な環境があるため）
    const tryLock = () => {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      orientation?.lock?.('landscape').catch(() => {});
    };
    window.addEventListener('pointerdown', tryLock, { once: true });
  }
}

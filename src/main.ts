import RAPIER from '@dimforge/rapier3d-compat';
import './style.css';
import { Game } from './core/Game';
import { getStageFromUrl, STAGE_ENTRIES } from './stages';
import { showStageSelect } from './ui/StageSelect';

async function boot(): Promise<void> {
  // Rapier（WASM埋め込み版）は使う前に初期化が必要
  await RAPIER.init();

  const container = document.getElementById('app');
  if (!container) throw new Error('#app が見つかりません');

  // URL で指定が無ければステージ選択画面を出す（?stage=forest などなら、そのまま始める）
  const fromUrl = getStageFromUrl();
  document.getElementById('loading')?.classList.add('hidden');
  const stage = fromUrl ?? await showStageSelect(document.body, STAGE_ENTRIES);

  const game = new Game(container, stage);
  game.start();

  if (import.meta.env.DEV) {
    (window as unknown as { game: Game }).game = game;
    // ルートの自動テスト（開発時のみ読み込む。本番ビルドには含まれない）
    const { runRouteTests } = await import('./dev/routeTests');
    (window as unknown as { runRouteTests: () => string }).runRouteTests = () => runRouteTests(game);
  }
}

boot().catch((err) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `起動に失敗しました：${err instanceof Error ? err.message : String(err)}`;
});

import RAPIER from '@dimforge/rapier3d-compat';
import './style.css';
import { Game } from './core/Game';
import { getStageFromUrl } from './stages';

async function boot(): Promise<void> {
  // Rapier（WASM埋め込み版）は使う前に初期化が必要
  await RAPIER.init();

  const container = document.getElementById('app');
  if (!container) throw new Error('#app が見つかりません');

  const game = new Game(container, getStageFromUrl());
  game.start();
  document.getElementById('loading')?.classList.add('hidden');

  if (import.meta.env.DEV) {
    (window as unknown as { game: Game }).game = game;
  }
}

boot().catch((err) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `起動に失敗しました：${err instanceof Error ? err.message : String(err)}`;
});

import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * 配信パス（base）の決定。
 * - GitHub Actions 上では GITHUB_REPOSITORY（"ユーザー名/リポジトリ名"）から
 *   サブパス "/リポジトリ名/" を自動で決める。
 * - "ユーザー名.github.io" リポジトリ（ユーザーサイト）の場合はルート "/"。
 * - 環境変数 BASE_PATH があればそれを最優先する（手動上書き用）。
 * - ローカル開発では "/"。
 */
function resolveBase(): string {
  if (process.env.BASE_PATH) return process.env.BASE_PATH;
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (!repo || repo.endsWith('.github.io')) return '/';
  return `/${repo}/`;
}

const base = resolveBase();

export default defineConfig({
  base,
  server: {
    // 同じLANの実機スマホから開けるようにする
    host: true,
  },
  preview: {
    host: true,
  },
  build: {
    // Rapier（WASM埋め込み版）を含むため 1 ファイルが大きい。想定内なので警告の閾値を上げる
    chunkSizeWarningLimit: 4000,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: '黒猫アスレチック（仮）',
        short_name: '黒猫',
        description: '猫として空間を攻略する3Dアスレチック（プロトタイプ）',
        lang: 'ja',
        // base・start_url・scope・Service Worker のスコープを揃える
        start_url: base,
        scope: base,
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#101014',
        theme_color: '#101014',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // ビルド成果物を全部プリキャッシュする（一度開けばオフラインでも起動できる）
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        // Rapier（WASM埋め込み版）のJSは2MiBを超えるため上限を引き上げる
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
});

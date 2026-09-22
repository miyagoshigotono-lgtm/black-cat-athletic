import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// public/icon.svg から PWA 用アイコン一式を生成する（npm run icons）
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/icon.svg'],
});

# 黒猫アスレチック（仮）

猫として空間を攻略する3Dアスレチック。仕様は [SPEC.md](SPEC.md) を参照。
現在は **① 最小プロトタイプ**（箱の世界＋猫カプセル＋三人称カメラ＋スマホ操作＋PWA）。

## 必要なもの

- Node.js 24 以上（検算スクリプトが Node の TypeScript 直接実行を使うため）

## 開発

```bash
npm install
npm run dev            # http://localhost:5173 （同じWi-Fiのスマホからは表示される Network のURLで開く）
npm run verify:course  # 検証コースの寸法・高さ・接地の検算
npm run build          # 型チェック＋本番ビルド（dist/）
```

- PC：画面をクリックで操作開始（WASD 移動 / マウス 視点 / Space ジャンプ / Shift 爪（① では動作なし）/ Esc 解除）
- スマホ：左側をなぞって移動、右側をスワイプで視点、右下のボタンでジャンプ
- 右上の「調整（検証用）」パネルで、猫の速度・ジャンプ・カメラ・感度をその場で変更できる

> iOS でホーム画面に追加（PWA）して確認するには https が必要なため、GitHub Pages 上で確認する。

## GitHub Pages へのデプロイ

1. GitHub でリポジトリを作成し、このフォルダを `main` ブランチとして push する
2. リポジトリの Settings → Pages → Build and deployment の Source を **GitHub Actions** にする
3. `main` へ push するたびに `.github/workflows/deploy.yml` が検算・ビルド・公開を行う

公開URLは `https://<ユーザー名>.github.io/<リポジトリ名>/`。
サブパス（`base` / マニフェストの `start_url`・`scope` / Service Worker のスコープ）は、
ビルド時に `GITHUB_REPOSITORY` からリポジトリ名を読み取って自動でそろえるため、リポジトリ名を後から決めても設定変更は不要。

## 構成

```
src/
├─ main.ts                 起動（RAPIER.init() → Game）
├─ core/     Game（固定60Hz物理＋可変描画）、Physics（Rapier World）
├─ player/   CatController（キネマティック・キャラクターコントローラー）、CatView、CatParams（調整値）
├─ camera/   PlayCamera（三人称・めり込み対策）、CameraRig（導入演出カメラ用の切り替え土台）
├─ input/    InputState（共通入力）、KeyboardMouseInput、TouchInput
├─ ui/       TouchControls、OrientationOverlay、DebugHud
└─ greybox/  検証用コース（本番コードとは分離・使い捨て前提）
scripts/verify-course.ts   コースの数値検算
```

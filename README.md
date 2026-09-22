# 黒猫アスレチック（仮）

猫として空間を攻略する3Dアスレチック。仕様は [SPEC.md](SPEC.md) を参照。
現在は **② 爪** まで（箱の検証コース＋四本脚の猫＋三人称カメラ＋スマホ操作＋PWA＋爪の仕組み）。次は ⑤ 森。

## 必要なもの

- Node.js 24 以上（検算スクリプトが Node の TypeScript 直接実行を使うため）

## 開発

```bash
npm install
npm run dev            # http://localhost:5173 （同じWi-Fiのスマホからは表示される Network のURLで開く）
npm run verify:course  # 検証コースの寸法・高さ・接地の検算
npm run build          # 型チェック＋本番ビルド（dist/）
```

- PC：画面をクリックで操作開始（WASD 移動 / マウス 視点 / Space ジャンプ / Shift 爪 / Esc 解除）
- スマホ：左側をなぞって移動、右側をスワイプで視点、右下のボタンでジャンプ・爪
- 爪：何にでも引っかいて爪痕が付く。金網は押している間張り付いて登れる（離すと落ちる、ジャンプで後ろへ飛び降り）。ドアは押すたびに開閉する
  - 検証コースの奥（開始地点から後ろ側）に、自立した金網・金網付きの登り台（高さ 2m）・ドア付きの小部屋がある
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
├─ interact/ 爪の仕組み（InteractionSystem、爪痕、対象：金網 Climbable・ドア Door、種類の登録 registry）
└─ greybox/  検証用コース（本番コードとは分離・使い捨て前提）
scripts/verify-course.ts   コースの数値検算
```

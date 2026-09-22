# 黒猫アスレチック（仮）

猫として空間を攻略する3Dアスレチック。仕様は [SPEC.md](SPEC.md) を参照。
現在は **⑤ 森（グレーボックス）** まで。Stage 1「工場の裏の森」をスタートからゴールまで遊べる。

- 起動すると森が開く。検証コースは URL に `?stage=proto` を付けて開く（例：`http://localhost:5173/?stage=proto`）

## 必要なもの

- Node.js 24 以上（検算スクリプトが Node の TypeScript 直接実行を使うため）

## 開発

```bash
npm install
npm run dev            # http://localhost:5173 （同じWi-Fiのスマホからは表示される Network のURLで開く）
npm run verify:course  # 全ステージの寸法・高さ・接地・ルートの検算
npm run build          # 型チェック＋本番ビルド（dist/）
```

開発サーバーで森を開き、ブラウザのコンソールで `runRouteTests()` を実行すると、3つのルートを自動操作で通して結果を表示する（開発時のみ）。

- PC：画面をクリックで操作開始（WASD 移動 / マウス 視点 / Space ジャンプ / Shift 爪 / Esc 解除）
- スマホ：左側をなぞって移動、右側をスワイプで視点、右下のボタンでジャンプ・爪
- 爪：何にでも引っかいて爪痕が付く。金網は押している間張り付いて登れる（離すと落ちる、ジャンプで後ろへ飛び降り）。ドアは押すたびに開閉する
  - 森：板塀の向こうのゴール（段ボール）へ。越え方は3通り（ツタの木／倒木／岩）
  - 検証コース：開始地点から後ろ側に、自立した金網・金網付きの登り台（高さ 2m）・ドア付きの小部屋がある
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
├─ interact/ 爪の仕組み（InteractionSystem、爪痕、対象：登れる面 Climbable・ドア Door・ゴール Goal・皿 Dish、種類の登録 registry）
├─ stages/   ステージの型・形の計算（geometry）・組み立て・選択、forest/（森の配置データ）
├─ dev/      開発時だけ使う道具（ルートの自動テスト）
└─ greybox/  検証コース（本番コードとは分離・使い捨て前提）
scripts/verify-course.ts   コースの数値検算
```

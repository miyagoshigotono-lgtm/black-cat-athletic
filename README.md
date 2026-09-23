# 黒猫アスレチック（仮）

猫として空間を攻略する3Dアスレチック。仕様は [SPEC.md](SPEC.md) を参照。
現在は **⑥ 工場（グレーボックス）** まで。Stage 1「工場の裏の森」と Stage 2「工場の事務所」をスタートからゴールまで遊べる。

- 起動するとステージ選択画面が出る（1. 森 ／ 2. 工場 ／ 3. 家＝準備中）
- URL に `?stage=<id>` を付けると選択画面を飛ばして直接開ける：`forest` / `factory` / `proto`（検証コース）

## 必要なもの

- Node.js 24 以上（検算スクリプトが Node の TypeScript 直接実行を使うため）

## 開発

```bash
npm install
npm run dev            # http://localhost:5173 （同じWi-Fiのスマホからは表示される Network のURLで開く）
npm run verify:course  # 全ステージの寸法・高さ・接地・ルートの検算
npm run build          # 型チェック＋本番ビルド（dist/）
```

開発サーバーでステージを開き、ブラウザのコンソールで `runRouteTests()` を実行すると、自動操作で通して結果を表示する（開発時のみ）。森は3つのルート、工場は通し1本。

- PC：画面をクリックで操作開始（WASD 移動 / マウス 視点 / Space ジャンプ / Shift 爪 / Esc 解除）
- スマホ：左側をなぞって移動、右側をスワイプで視点、右下のボタンでジャンプ・爪
- 登る：ツタや金網に**体を押し当てるだけ**で張り付いて登れる（爪は不要）。ジャンプで後ろへ飛び降り、上まで登ると乗り越え、下まで降りると四つ足に戻る
- 爪：何にでも引っかいて爪痕が付く。ドアは押すたびに開閉し、ゴールの段ボールは爪でクリア
  - 森：板塀の向こうのゴール（段ボール）へ。越え方は3通り（ツタの木／倒木／岩）。行き止まりの枝・岩・倒木も混ざっている
  - 工場：中を登って天窓から屋根へ出て、事務所の窓から入り、机のキーボードで寝る。1本道だが登り方は所々で選べる
  - 検証コース：開始地点から後ろ側に、自立した金網・金網付きの登り台（高さ 2m）・ドア付きの小部屋がある
- 猫の速さ・ジャンプなどの値は決まったので、調整パネルは廃止した（値は src/player/CatParams.ts）
- 45°より急な面には立てない（岩の丸い側面は滑り落ちる）。低い段差は歩いて乗り越える
- 性能表示（FPS・座標など）は URL に `?debug=1` を付けたときだけ出る

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
├─ ui/       TouchControls、OrientationOverlay、StageSelect、ClearOverlay、DebugHud（?debug=1 のときだけ）
├─ interact/ 爪の仕組み（InteractionSystem、爪痕、対象：登れる面 Climbable・ドア Door・ゴール Goal・皿 Dish、種類の登録 registry）
├─ stages/   ステージの型・形の計算（geometry）・組み立て・選択、forest/・factory/（配置データ）
├─ dev/      開発時だけ使う道具（ルートの自動テスト）
└─ greybox/  検証コース（本番コードとは分離・使い捨て前提）
scripts/verify-course.ts   コースの数値検算
```

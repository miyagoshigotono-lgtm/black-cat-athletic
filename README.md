# 黒猫アスレチック（仮）

猫として空間を攻略する3Dアスレチック。仕様は [SPEC.md](SPEC.md) を参照。
現在は **⑦ 家（グレーボックス）** まで。3ステージすべてをスタートからゴールまで遊べる。

- 起動するとステージ選択画面が出る（1. 森 ／ 2. 工場 ／ 3. 家）
- URL に `?stage=<id>` を付けると選択画面を飛ばして直接開ける：`forest` / `factory` / `house` / `proto`（検証コース）

## 必要なもの

- Node.js 24 以上（検算スクリプトが Node の TypeScript 直接実行を使うため）

## 開発

```bash
npm install
npm run dev            # http://localhost:5173 （同じWi-Fiのスマホからは表示される Network のURLで開く）
npm run verify:course  # 全ステージの寸法・高さ・接地・ルートの検算
npm run build          # 型チェック＋本番ビルド（dist/）
```

開発サーバーでステージを開き、ブラウザのコンソールで `runRouteTests()` を実行すると、自動操作で通して結果を表示する（開発時のみ）。森3本・工場2本・家2本の計7本。
一度の読み込みで通るのは1回だけ（ギミックの状態が残るため、2回目は再読み込みしてから実行する）。

- PC：画面をクリックで操作開始（WASD 移動 / **Shift 走る** / マウス 視点 / Space ジャンプ / **左クリック・E 爪** / Esc 解除）
- スマホ：左側をなぞって移動、右側をスワイプで視点、右下のボタンでジャンプ・爪・走る
- **歩き 1.0 m/s・走り 3.0 m/s**。走っている勢いはそのままジャンプに乗るので、跳べる距離は 0.63m と 1.90m の二択になる（高さは 1.0m で共通）。細い枝・梁・棚は歩いて渡り、長い跳躍は走って跳ぶ
- 登る：ツタや金網に**体を押し当てるだけ**で張り付いて登れる（爪は不要）。ジャンプで後ろへ飛び降り、上まで登ると乗り越え、下まで降りると四つ足に戻る
- 爪：何にでも引っかいて爪痕が付く。ドアは押すたびに開閉し、ゴールの段ボールは爪でクリア
  - 森：全長 40m。板塀の越え方は4通り（木から木へ枝分かれ。岩では越えられない）。塀の先は**木のてっぺんを飛び石のように渡り**、崖（4m）の上の森にあるゴールへ
  - 工場：シャッターの下（全幅 0.4 だけ開いている）をくぐって中へ。登って天窓から屋根へ出て、事務所の窓から入り、机のキーボードで寝る。途中、鉄骨まで登ったら**吊り荷へ跳び降りて**スイッチを入れ、コンベアでさらに上へ
  - 家：庭から始まる。網戸のすき間をすり抜けて中へ入り、吹き抜けを登って梁の上の猫ベッドへ
  - 登れる物（押し当てて登る）：ツタ・金網・点検はしご・荷崩れ防止ネット・立てかけた木パレット・麻ひもの柱
  - ギミック（可逆）：ドアの開閉、スイッチで動くコンベア、押せる台車、タンスの引き出し
  - ステージの最初にゴールを見せる演出が入る（画面を触る・クリック・キーで飛ばせる）
  - 画面右上のボタン（または P キー）で一時停止。「続ける」「最初から」「ステージ選択」が選べる
  - クリアすると「次へ」で次のステージへ進める。クリア済みはこの端末に記録され、ステージ選択に出る
  - 検証コース：開始地点から後ろ側に、自立した金網・金網付きの登り台（高さ 2m）・ドア付きの小部屋がある
- 調整パネルは廃止した（値は src/player/CatParams.ts）
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
├─ camera/   PlayCamera（三人称・めり込み対策）、IntroCamera（導入演出）、CameraRig（切り替え）
├─ input/    InputState（共通入力）、KeyboardMouseInput、TouchInput
├─ ui/       TouchControls、OrientationOverlay、StageSelect、ClearOverlay、PauseMenu、DebugHud（?debug=1 のときだけ）
├─ interact/ 爪の仕組み（InteractionSystem、爪痕、対象：Climbable・Door・Goal・Dish・Switch・Conveyor・Movable、registry）
├─ stages/   ステージの型・形の計算（geometry）・組み立て・選択、forest/・factory/・house/（配置データ）
├─ dev/      開発時だけ使う道具（ルートの自動テスト）
└─ greybox/  検証コース（本番コードとは分離・使い捨て前提）
scripts/verify-course.ts   コースの数値検算
```

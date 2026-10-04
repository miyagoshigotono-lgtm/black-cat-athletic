import * as THREE from 'three';
import type { Game } from '../core/Game';

/**
 * ルートの自動テスト（開発時のみ。本番ビルドには含めない）。
 * 猫を自動操作（目標地点へ歩く・跳ぶ・ツタを登る）して、各ルートで塀の向こうまで行けるかを確かめる。
 * 物理は描画と関係なく固定刻みで直接進めるので、画面が止まっていても動く。
 * 使い方：ブラウザのコンソールで  await runRouteTests()
 */

const DT = 1 / 60;
type Debug = Game['debug'];

class Bot {
  private readonly tmp = new THREE.Vector3();
  readonly log: string[] = [];
  /**
   * 走っているか。猫はふだん走っていて、歩くボタンを押している間だけ遅くなる。
   * コースの跳躍はすべて走り（3.0）を前提に引いてあるので、ふだんは走り。
   * 細い枝や梁の上など、行き過ぎると落ちる所だけ歩き（1.0）に落とす。
   */
  private running = true;

  constructor(private readonly g: Debug) {}

  /** 以後の移動を走りにする／歩きにする */
  setRunning(on: boolean): void {
    this.running = on;
    this.g.input.walkHeld = !on;
  }

  get pos(): THREE.Vector3 {
    return this.g.cat.getFootPosition(this.tmp).clone();
  }

  private step(): void {
    this.g.interactions.fixedUpdate(DT, this.g.input);
    this.g.cat.fixedUpdate(DT, this.g.input, 0); // カメラの水平角 0：前 = -Z
    this.g.physics.step(DT);
  }

  /** 目標 (x, z) の方へスティックを倒す */
  private steer(x: number, z: number): number {
    const p = this.pos;
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    this.g.input.walkHeld = !this.running;
    if (d > 1e-4) {
      this.g.input.moveX = dx / d;
      this.g.input.moveY = -dz / d;
    }
    return d;
  }

  private release(): void {
    this.g.input.moveX = 0;
    this.g.input.moveY = 0;
  }

  start(x: number, y: number, z: number, facing = 0): void {
    this.g.cat.facing = facing;
    this.g.cat.teleport({ x, y, z });
    this.wait(0.3);
  }

  wait(sec: number): void {
    this.release();
    for (let i = 0; i < Math.round(sec / DT); i++) this.step();
  }

  /** 目標へ歩く。着いたら 'ok'、進めなくなったら 'stuck'、時間切れは 'timeout' */
  goto(x: number, z: number, tol = 0.12, timeout = 6): 'ok' | 'stuck' | 'timeout' {
    let t = 0;
    let last = this.pos;
    let still = 0;
    while (t < timeout) {
      if (this.steer(x, z) < tol) { this.release(); return 'ok'; }
      this.step();
      t += DT;
      const p = this.pos;
      still = p.distanceTo(last) < 0.004 ? still + DT : 0;
      last = p;
      if (still > 0.4) { this.release(); return 'stuck'; }
    }
    this.release();
    return 'timeout';
  }

  /** 目標の方へ走りながら跳び、着地するまで目標へスティックを倒し続ける */
  /**
   * 目標の方へ跳ぶ。
   * @param mode run：いまの勢いのまま跳ぶ（遠くへ届く）／stand：勢いを消してその場から跳ぶ（狭い足場用）
   */
  jumpToward(x: number, z: number, timeout = 3, mode: 'run' | 'stand' = 'run'): void {
    if (mode === 'stand') {
      // 勢いを消してその場から跳ぶ（狭い足場用）
      this.release();
      for (let i = 0; i < 10 && this.g.cat.velocity.lengthSq() > 0.04; i++) this.step();
      this.steer(x, z);
      this.step();
    } else {
      // 少し助走してから跳ぶ（立ち止まったまま跳ぶと届かないため）
      for (let i = 0; i < 8; i++) {
        this.steer(x, z);
        const p = this.pos;
        const dx = x - p.x;
        const dz = z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        const v = this.g.cat.velocity;
        if ((v.x * dx + v.z * dz) / d > 1.5) break;
        this.step();
      }
    }
    this.g.input.pressJump();
    let t = 0;
    let airborne = false;
    while (t < timeout) {
      this.steer(x, z);
      this.step();
      t += DT;
      if (!this.g.cat.grounded) airborne = true;
      else if (airborne) break;
    }
    this.g.input.releaseJump();
    // 着地した直後も少しだけ目標へ入力を続ける（縁に乗っただけで止まると落ちるため）。
    // 狭い足場（stand）では踏み外すので、その場に止める
    if (mode === 'run') { for (let i = 0; i < 6; i++) { this.steer(x, z); this.step(); } }
    this.release();
    // 着地して落ち着くまで待つ（次の跳躍を空中で始めないため）
    let settled = 0;
    let t2 = 0;
    while (t2 < 1.0 && settled < 6) {
      this.step();
      t2 += DT;
      settled = this.g.cat.grounded ? settled + 1 : 0;
    }
    this.wait(0.1);
  }

  /** 目の前の登れる面に体を押し当てて登り切る（爪は使わない）。向きは (dirX, dirZ) */
  climb(dirX = 0, dirZ = -1, timeout = 8): boolean {
    let t = 0;
    this.g.input.moveX = dirX;
    this.g.input.moveY = -dirZ;
    // 押し当てて登り始めるのを待つ
    while (t < 1 && !this.g.cat.isClimbing) { this.step(); t += DT; }
    if (!this.g.cat.isClimbing) { this.release(); return false; }
    // 張り付いたら、上方向の入力に切り替えて登る（登り中は上下＝登り降り）
    this.g.input.moveX = 0;
    this.g.input.moveY = 1;
    while (t < timeout && this.g.cat.isClimbing) { this.step(); t += DT; }
    this.release();
    this.wait(0.4);
    return !this.g.cat.isClimbing;
  }

  /** 届くまで何回か跳んでみる（際どい跳躍の確認用）。届いたら true */
  jumpUntil(x: number, z: number, minY: number, tries = 3, mode: 'run' | 'stand' = 'run'): boolean {
    for (let i = 0; i < tries; i++) {
      this.jumpToward(x, z, 3, mode);
      if (this.pos.y >= minY) return true;
    }
    return false;
  }

  /**
   * その場で目標の方へ向き直る。
   * 爪は鼻先の前に当たるので、引き出しのように「隣に立って横を向いて使う物」は
   * 歩いて行っただけでは向きがそろわない。CatController と同じ式で facing を決める。
   */
  face(x: number, z: number): void {
    const p = this.pos;
    this.g.cat.facing = Math.atan2(-(x - p.x), -(z - p.z));
    this.release();
    this.step();
  }

  claw(): void {
    this.g.input.pressClaw();
    this.step();
    this.g.input.releaseClaw();
    this.log.push('  爪 → ' + this.g.interactions.lastResult);
    this.wait(0.1);
  }

  note(label: string): void {
    const p = this.pos;
    this.log.push(`${label}：(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) ${this.g.cat.mode}`);
  }
}

/**
 * 急な斜面を「跳んで登れない」ことの確認（不具合の再発防止）。
 *
 * 斜面の下に猫を置き、上り方向へ走りながらジャンプを繰り返して、高さが上がらないことを見る。
 * 以前は、立てない角度の面でも足元の判定が働かず、ジャンプを連打するとどんな斜面でも
 * 登れてしまっていた（止まっているコンベアを登ってスイッチを無視できた）。
 *
 * @param limit 跳び終わったあと猫がいてよい高さの上限。これを超えていたら登れてしまっている
 */
function cannotClimb(g: Debug, label: string, from: [number, number, number], toward: [number, number], limit: number): string {
  const bot = new Bot(g);
  bot.start(from[0], from[1], from[2]);
  for (let i = 0; i < 6; i++) bot.jumpToward(toward[0], toward[1], 2);
  const y = bot.pos.y;
  return `${label}：${y <= limit ? '✓ 登れない' : '✗ 登れてしまう'}（跳んだ後の高さ ${y.toFixed(2)} / 上限 ${limit}）`;
}

/** 塀の向こう（z < -7.3）の沢の地面にいるか */
function inRavine(b: Bot): boolean {
  const p = b.pos;
  return p.z < -7.3 && p.y < 0.2;
}

/** 崖の上（台地・上面 4.0）にいるか */
function onPlateau(b: Bot): boolean {
  const p = b.pos;
  return p.z < -16.0 && p.y > 3.9 && p.y < 4.2;
}

/**
 * 林冠を渡る共通部分（第4版）。
 * 樹冠の上は平らな所が狭いので、中心をねらって1本ずつ跳び移る。
 * O(4.40) → O2(4.50) → P(4.60) → Q(4.80) → R(5.00) → S(5.20) → T(5.30) → 台地(4.0)
 */
function crossCanopy(bot: Bot): void {
  bot.jumpUntil(0.0, -9.0, 4.4); bot.note('林冠の木O2(4.50)');
  bot.jumpUntil(0.8, -9.8, 4.5); bot.note('林冠の木P(4.60)');
  bot.jumpUntil(-0.5, -10.8, 4.7); bot.note('林冠の木Q(4.80)');
  bot.jumpUntil(0.7, -11.9, 4.9); bot.note('林冠の木R(5.00)');
  bot.jumpUntil(-0.6, -12.9, 5.1); bot.note('林冠の木S(5.20)');
  bot.jumpUntil(0.6, -14.0, 5.2); bot.note('林冠の木T(5.30)');
  // 崖の上（4.0）へ 2.0m 先・1.3 下り。走って跳ばないと届かない
  bot.jumpToward(0.6, -16.8, 3); bot.note('崖の上へ跳び移る');
  bot.goto(0.4, -18.0, 0.3, 6); bot.note('台地の上');
}

/** 台地のゴール（段ボール）まで歩いて爪を立てる */
function reachGoal(bot: Bot): void {
  bot.goto(0.0, -22.0, 0.3, 10);
  bot.goto(0.0, -25.4, 0.2, 8); bot.note('段ボールの手前');
  bot.goto(0.0, -26.3, 0.12, 5); bot.claw(); bot.note('段ボールに爪');
}

export function runRouteTests(game: Game): string {
  const g = game.debug;
  if (g.stage.id === 'factory') return runFactoryTest(game);
  if (g.stage.id === 'house') return runHouseTest(game);
  if (g.stage.id !== 'forest') return '森・工場・家のステージで実行してください';
  const s = g.stage.start;
  const results: string[] = [];
  const nl = String.fromCharCode(10);

  // ---------- ルートA：ツタ → ① → ② → ③ → 塀の上の葉 → 林冠 → 台地 ----------
  {
    for (const item of g.interactions.all) (item as { reset?: () => void }).reset?.();
    const bot = new Bot(g);
    bot.start(s.x, s.y, s.z, s.facing);
    bot.goto(0.2, 3.5, 0.06, 5); bot.note('ツタの前（幹に当たって止まる）');
    const climbed = bot.climb(); bot.note(`ツタを登る(${climbed ? '登り切り' : '失敗'})`);
    // ①の枝（西）の先へ。枝の上は狭いので歩きに落とす
    bot.setRunning(false);
    bot.goto(0.0, 2.45, 0.12, 4); bot.goto(-1.25, 1.45, 0.1, 5); bot.note('①の枝（西）の先(2.45)');
    bot.setRunning(true);
    bot.jumpUntil(-2.6, 0.2, 2.6); bot.note('②の股(2.7)へ跳ぶ');
    bot.setRunning(false);
    bot.goto(-2.95, -1.9, 0.1, 5); bot.note('②の枝（北）の先(3.1)');
    bot.setRunning(true);
    bot.jumpUntil(-3.6, -3.6, 3.4); bot.note('③の股(3.5)へ跳ぶ');
    bot.setRunning(false);
    bot.goto(-3.3, -4.3, 0.1, 4); bot.goto(-2.65, -5.85, 0.08, 5); bot.note('③の細い枝の先(3.6)');
    bot.setRunning(true);
    bot.jumpUntil(-2.2, -7.0, 3.9); bot.note('塀の上の葉(4.05)');
    bot.jumpUntil(-1.2, -8.2, 4.3); bot.note('林冠の木O(4.40)');
    crossCanopy(bot);
    const up = onPlateau(bot);
    reachGoal(bot);
    results.push(`ルートA（ツタ→林冠）：${g.cat.isResting ? '✓ クリア' : up ? '△ 崖の上までは行けた' : '✗ 届かなかった'}`
      + nl + '  ' + bot.log.join(nl + '  '));
  }

  // ---------- ルートB：倒木 → ⑥ → ④ → 塀を跳び越える → 登り返しのツタ → 林冠 ----------
  {
    for (const item of g.interactions.all) (item as { reset?: () => void }).reset?.();
    const bot = new Bot(g);
    bot.start(s.x, s.y, s.z, s.facing);
    bot.goto(5.7, 4.3, 0.25, 8); bot.note('倒木の下の端');
    bot.jumpToward(5.2, 3.5); bot.note('倒木に跳び乗る');
    // 倒木の中心線に沿って登る（斜めに横切ると脇から落ちる）
    bot.setRunning(false);
    bot.goto(4.8, 2.9, 0.12, 4); bot.goto(4.2, 2.1, 0.12, 4); bot.goto(3.6, 1.2, 0.12, 5); bot.note('倒木の上の端(2.2)');
    bot.setRunning(true);
    bot.jumpUntil(3.2, 0.6, 2.5); bot.note('⑥の股(2.6)');
    bot.setRunning(false);
    bot.goto(3.18, 0.3, 0.1, 4); // 枝の中心線へ乗る（ここを外すと幹と枝の間から落ちる）
    bot.goto(3.05, -1.5, 0.1, 5); bot.note('⑥の枝（北）の先(3.0)');
    bot.setRunning(true);
    bot.jumpUntil(2.6, -3.2, 3.1); bot.note('④の股(3.2)');
    bot.setRunning(false);
    bot.goto(2.6, -3.55, 0.1, 4); // ④の枝（北）の根もとへ
    bot.goto(2.42, -4.6, 0.1, 4); bot.goto(2.25, -5.65, 0.08, 4); bot.note('④の枝（北）の先(3.5)');
    bot.setRunning(true);
    bot.jumpToward(2.1, -8.2, 3); bot.wait(0.8); bot.note('塀を跳び越えて沢へ降りる');
    const over = inRavine(bot);
    // 登り返しのツタ（唯一の戻り道）で林冠へ
    bot.goto(3.0, -7.95, 0.14, 6); bot.note('登り返しの木の前');
    const climbed = bot.climb(); bot.note(`登り返しのツタを登る(${climbed ? '登り切り' : '失敗'})`);
    bot.setRunning(false);
    bot.goto(2.2, -9.1, 0.12, 5); bot.note('登り返しの木の枝の先(4.1)');
    bot.setRunning(true);
    bot.jumpUntil(0.8, -9.8, 4.5); bot.note('林冠の木P(4.60)');
    bot.jumpUntil(-0.5, -10.8, 4.7); bot.note('林冠の木Q(4.80)');
    bot.jumpUntil(0.7, -11.9, 4.9); bot.note('林冠の木R(5.00)');
    bot.jumpUntil(-0.6, -12.9, 5.1); bot.note('林冠の木S(5.20)');
    bot.jumpUntil(0.6, -14.0, 5.2); bot.note('林冠の木T(5.30)');
    bot.jumpToward(0.6, -16.8, 3); bot.note('崖の上へ跳び移る');
    bot.goto(0.4, -18.0, 0.3, 6); bot.note('台地の上');
    const up = onPlateau(bot);
    reachGoal(bot);
    results.push(`ルートB（倒木→塀越え→登り返し）：${g.cat.isResting ? '✓ クリア' : up ? '△ 崖の上までは行けた' : over ? '△ 塀は越えた' : '✗ 塀を越えられない'}`
      + nl + '  ' + bot.log.join(nl + '  '));
  }

  // ---------- ルートC：④の枝（東）→ ⑤ → 塀を跳び越える（越え方の3本目） ----------
  {
    for (const item of g.interactions.all) (item as { reset?: () => void }).reset?.();
    const bot = new Bot(g);
    bot.start(s.x, s.y, s.z, s.facing);
    bot.goto(5.7, 4.3, 0.25, 8);
    bot.jumpToward(5.2, 3.5);
    bot.setRunning(false);
    bot.goto(4.8, 2.9, 0.12, 4); bot.goto(4.2, 2.1, 0.12, 4); bot.goto(3.6, 1.2, 0.12, 5); bot.note('倒木の上の端');
    bot.setRunning(true);
    bot.jumpUntil(3.2, 0.6, 2.5); bot.note('⑥の股(2.6)');
    bot.setRunning(false);
    bot.goto(3.18, 0.3, 0.1, 4); bot.goto(3.05, -1.5, 0.1, 5);
    bot.setRunning(true);
    bot.jumpUntil(2.6, -3.2, 3.1); bot.note('④の股(3.2)');
    bot.setRunning(false);
    // 枝の向き（1.4, −1.1）に沿って刻む。斜めに横切ると体の長さ 0.44 が枝からはみ出して落ちる
    bot.goto(2.75, -3.28, 0.1, 4); bot.goto(3.15, -3.59, 0.1, 4);
    bot.goto(3.55, -3.90, 0.1, 4); bot.goto(3.95, -4.21, 0.08, 4); bot.note('④の枝（東）の先(3.4)');
    bot.setRunning(true);
    bot.jumpUntil(5.4, -5.0, 3.5); bot.note('⑤の股(3.6)');
    bot.setRunning(false);
    bot.goto(5.1, -6.25, 0.1, 4); bot.note('⑤の枝（北）の先(3.8)');
    bot.setRunning(true);
    bot.jumpToward(5.0, -8.6, 3); bot.wait(0.8); bot.note('塀を跳び越える');
    results.push(`ルートC（⑤から塀越え）：${inRavine(bot) ? '✓ 塀を越えた' : '✗ 越えられない'}`
      + nl + '  ' + bot.log.join(nl + '  '));
  }

  // 岩づたいには登れないこと（第4版で廃止した道が復活していないか）
  results.push(cannotClimb(g, '岩C（上面 1.2）を跳んで登る', [-4.8, 0, -2.3], [-4.8, -3.4], 0.5));

  const report = results.join(nl);
  console.log(report);
  return report;
}

/**
 * 工場ステージの通しテスト（第2版）。
 * A：木箱 → コンベア → 機械B → ダクト（横） → 斜めの通路 → キャットウォーク
 * B：点検はしご → 中2階の踊り場 → ダクト（東） → 機械C → 機械B → ダクト（横） → 吊り下げ照明の架台
 * どちらもキャットウォークから先は同じ。
 * 鉄骨A(8.6) → 吊り荷（大）(7.2) へ**跳び降り**、スイッチを入れて急なコンベアで鉄骨B(10.4)へ上がる。
 */
function runFactoryTest(game: Game): string {
  const g = game.debug;
  const results: string[] = [];
  const nl = String.fromCharCode(10);

  for (const route of ['A', 'B'] as const) {
    // 同じページで2回目以降も試せるよう、ゴールとスイッチの状態を戻す
    for (const item of g.interactions.all) (item as { reset?: () => void }).reset?.();
    const s = g.stage.start;
    const bot = new Bot(g);
    bot.start(s.x, s.y, s.z, s.facing);

    // シャッターは下が端から端まで 0.4 開いている（第2版）。どこからでも入れる
    bot.goto(3.0, 21.6, 0.25, 8); bot.note('シャッターの前');
    bot.goto(1.7, 19.2, 0.2, 6); bot.note('シャッターの下をくぐって中へ');

    if (route === 'A') {
      bot.goto(3.6, 16.8, 0.2, 8); bot.note('パレットの上(0.12)');
      bot.jumpToward(3.6, 16.0); bot.note('木箱A(0.7)');
      bot.goto(3.6, 15.4, 0.12, 4); bot.jumpToward(3.6, 14.5); bot.note('木箱B(1.35)');
      bot.goto(3.5, 13.9, 0.12, 4); bot.jumpToward(3.2, 13.2); bot.note('木箱C(2.0)');
      bot.goto(2.7, 12.9, 0.12, 4); bot.jumpToward(2.0, 12.7); bot.note('コンベアの下端(2.6)');
      bot.goto(0.6, 12.0, 0.15); bot.goto(-1.5, 11.1, 0.15); bot.goto(-3.6, 10.2, 0.15, 5); bot.note('コンベアの上端(4.5)');
      bot.goto(-5.0, 9.6, 0.15, 5); bot.note('機械Bの上(4.4)');
    } else {
      // 踊り場の縁に立てかけた点検はしごを登って中2階へ。そこからダクト・機械を伝って機械Bへ
      // 木箱の山を避けて、東壁ぎわを南から北へ回る
      bot.goto(2.2, 18.0, 0.3, 8); bot.goto(1.6, 14.5, 0.3, 8); bot.goto(1.5, 11.0, 0.3, 8);
      // はしご（x 4.35〜5.25、z 4.70〜5.00）の上を通ると、南がわ＝踊り場の下に張り付いてしまう。
      // 東の壁ぎわ（x 5.8）を通って、はしごの北へ回り込む
      bot.goto(3.0, 8.0, 0.3, 8); bot.goto(5.8, 6.6, 0.25, 8);
      bot.goto(5.8, 3.4, 0.25, 8); bot.goto(4.8, 3.4, 0.25, 8);
      // 走ったまま寄るとはしごを通り越して、踊り場の下（南がわ）で張り付いてしまう
      bot.setRunning(false);
      bot.goto(4.8, 4.25, 0.12, 5); bot.note('点検はしごの前');
      const climbed = bot.climb(0, 1); bot.note('点検はしご（東）を登る(' + (climbed ? '登り切り' : '失敗') + ')');
      bot.setRunning(true);
      bot.goto(4.8, 6.0, 0.2, 6); bot.note('中2階の踊り場(3.2)');
      bot.jumpUntil(3.9, 6.0, 3.9); bot.note('ダクト（東）(4.0)');
      bot.goto(1.0, 6.0, 0.2, 8); bot.goto(-0.9, 6.0, 0.15, 6); bot.note('ダクト（東）の西の端(4.3)');
      bot.jumpUntil(-2.4, 5.8, 3.6); bot.note('機械C(3.7)');
      bot.goto(-3.3, 6.6, 0.2, 5); bot.note('機械Cの北西');
      bot.jumpUntil(-4.4, 7.6, 4.3); bot.note('機械B(4.4)');
      bot.goto(-5.0, 9.6, 0.2, 6); bot.note('機械Bの上');
    }

    // 機械B → ダクト（横） → キャットウォーク（A は斜めの通路、B は吊り下げ照明の架台）
    bot.goto(-7.6, 9.0, 0.15, 5); bot.note('機械Bの西の端');
    bot.jumpToward(-8.8, 9.0); bot.note('ダクト（横）(5.2)');
    if (route === 'A') {
      bot.goto(-11.5, 9.0, 0.15, 5); bot.goto(-12.34, 8.75, 0.15, 4); bot.note('ダクトの西寄り');
      bot.jumpToward(-12.34, 8.2); bot.note('斜めの通路（下）へ');
      bot.goto(-12.34, 6.2, 0.15, 5); bot.goto(-12.34, 4.9, 0.15, 4); bot.note('斜めの通路の上端(6.9)');
      bot.goto(-13.3, 4.6, 0.15, 4); bot.note('キャットウォーク(6.9)');
    } else {
      bot.goto(-11.4, 9.2, 0.15, 6); bot.note('ダクトの南寄り');
      bot.jumpUntil(-11.4, 10.4, 5.7); bot.note('吊り下げ照明の架台(5.8)');
      bot.goto(-11.6, 10.85, 0.12, 4); // 架台の南の縁まで出てから跳ぶ（中央から跳ぶと 1.96m で届かない）
      bot.jumpUntil(-11.9, 12.0, 6.4); bot.note('配管の棚(6.5)');
      bot.jumpUntil(-13.3, 12.0, 6.8); bot.note('キャットウォーク(6.9)');
      bot.goto(-13.3, 4.6, 0.25, 10); bot.note('キャットウォークを南へ');
    }

    // キャットウォーク → 斜めの通路（上） → 鉄骨A
    bot.goto(-13.2, 3.6, 0.12, 4); bot.note('斜めの通路（上）の下端');
    bot.goto(-12.2, 2.3, 0.15, 4); bot.goto(-11.4, 1.35, 0.12, 4); bot.goto(-11.0, 1.0, 0.08, 4);
    bot.note('鉄骨A(8.6)');
    // 鉄骨Aを東へ歩き、吊り荷（大）へ跳び降りる（鉄骨Bへは直接行けない）
    bot.setRunning(false);
    bot.goto(-5.5, 1.0, 0.12, 10); bot.note('吊り荷の真上あたり');
    bot.goto(-5.5, 1.8, 0.2, 4); bot.wait(0.6); bot.note('吊り荷（大）(7.2)へ降りる');
    bot.setRunning(true);
    // スイッチを爪で入れてから、急なコンベアに乗る
    bot.goto(-5.9, 2.1, 0.12, 5); bot.face(-5.9, 2.6); bot.claw(); bot.note('コンベアのスイッチ');
    // ベルトは 53° で、止まっていても動いていても歩いては上れない。跳び乗ってから運ばれる
    // 吊り荷の中央にはホイストの吊り具（x −5.56〜−5.44）が立っているので、南がわを回る
    bot.goto(-5.5, 2.25, 0.12, 4);
    bot.goto(-4.9, 1.9, 0.12, 5); bot.note('ベルトの手前');
    bot.jumpUntil(-4.0, 1.9, 7.6); bot.note('ベルトに乗る');
    bot.wait(4.0); bot.note('運ばれて上がる');
    bot.goto(-1.6, 1.9, 0.25, 6); bot.note('ベルトの降り口(10.4)');
    bot.jumpUntil(-1.6, 3.0, 10.3); bot.note('鉄骨B(10.4)');
    bot.setRunning(false);
    bot.goto(-6.0, 3.0, 0.15, 10); bot.note('鉄骨Bを西へ');
    bot.goto(-6.0, 2.0, 0.15, 5); bot.note('天窓へのダクト');
    bot.goto(-6.0, 0.0, 0.15, 5); bot.goto(-6.0, -1.5, 0.15, 5); bot.note('天窓を抜ける');
    bot.setRunning(true);
    bot.goto(-6.0, -3.0, 0.2, 5); bot.note('屋根の上(12.3)');
    bot.goto(-6.0, -6.5, 0.2, 8); bot.note('屋根を北へ');
    // 屋外は足場が狭く、走ると行き過ぎて落ちるので歩きに落とす
    bot.setRunning(false);
    bot.goto(-6.0, -7.9, 0.15, 6); bot.wait(0.6); bot.note('屋外ダクト(9.8)へ降りる');
    bot.goto(-6.6, -8.1, 0.15, 4); bot.note('ダクトの西寄り');
    bot.setRunning(true);
    bot.jumpToward(-8.8, -8.6, 3); bot.wait(0.8); bot.note('室外機(8.2)へ跳び降りる');
    bot.jumpToward(-8.8, -11.6); bot.wait(0.8); bot.note('事務所の屋根(7.6)');
    bot.setRunning(false);
    bot.goto(-12.0, -11.4, 0.2, 8); bot.note('屋根の南西の端');
    bot.goto(-12.0, -10.4, 0.2, 5); bot.wait(0.8); bot.note('事務所のダクト(5.6)へ降りる');
    bot.goto(-10.3, -10.4, 0.15, 6); bot.note('ダクトの東の端');
    bot.jumpToward(-9.3, -10.7, 3, 'stand'); bot.wait(0.6); bot.note('窓台(4.52)');
    bot.goto(-8.75, -11.9, 0.2, 5); bot.wait(0.6); bot.note('窓から事務所の中へ');
    // 椅子（4.45）を踏まなくても、床（4.0）から机の天板（4.72）へ直接跳べる
    bot.goto(-4.3, -19.0, 0.2, 12); bot.note('机の東どなり');
    // 天板の東の縁（x −5.2）を 4.72 以上で越える必要がある。近くから跳ぶと机の下へ潜る
    bot.jumpUntil(-5.5, -19.0, 4.65); bot.note('事務机の天板(4.72)');
    bot.goto(-6.0, -19.0, 0.15, 4);
    bot.goto(-6.0, -19.05, 0.1, 4); bot.claw(); bot.note('キーボードに爪');
    const cleared = g.cat.isResting;
    results.push(`工場ルート${route}：${cleared ? '✓ クリア' : '✗ 届かなかった'}` + nl + '  ' + bot.log.join(nl + '  '));
  }
  // スイッチを入れずに、止まっているコンベア（53°）を跳んで登れないこと
  for (const item of g.interactions.all) (item as { reset?: () => void }).reset?.();
  results.push(cannotClimb(g, '止まっているコンベアを跳んで登る', [-4.2, 7.3, 1.9], [-2.1, 1.9], 7.6));

  const report = results.join(nl);
  console.log(report);
  return report;
}

function runHouseTest(game: Game): string {
  const g = game.debug;
  const results: string[] = [];
  const nl = String.fromCharCode(10);

  for (const route of ['A', 'B'] as const) {
    // ゴールも引き出しも、前のルートの結果を持ち越すと次のルートが別物になる
    // （開いたままの引き出しに爪を当てると閉じてしまう）。ルートごとに元へ戻す
    for (const item of g.interactions.all) (item as { reset?: () => void }).reset?.();
    const s = g.stage.start;
    const bot = new Bot(g);
    bot.start(s.x, s.y, s.z, s.facing);

    // 庭 → 網戸のすき間（x −3.3〜−3.0）をくぐって家の中へ
    bot.goto(-3.15, 8.2, 0.2, 8); bot.note('窓の前');
    bot.jumpToward(-3.15, 7.3, 3, 'stand'); bot.note('サッシ(0.15)に乗る');
    bot.goto(-3.15, 6.6, 0.15, 5); bot.note('すき間をくぐってリビングへ');

    if (route === 'A') {
      // 吹き抜けの飾り棚を5段のぼって 2階の床（南）へ
      bot.goto(-6.9, 5.0, 0.25, 8); bot.goto(-6.9, 0.5, 0.25, 8); bot.goto(-6.75, -3.95, 0.07, 12);
      bot.note('飾り棚の北がわ');
      // 段の間隔は 0.40。走ると行き過ぎるので歩いて1段ずつ上がる
      bot.setRunning(false);
      // 跳ぶたびに南へ寄っていくので、毎回いったん段の北の端まで戻ってから次を跳ぶ
      for (const [i, z] of [-3.25, -2.80, -2.35, -1.90, -1.45].entries()) {
        bot.jumpUntil(-6.7, z, 0.5 + i * 0.48, 3, 'stand');
        bot.goto(-6.7, z - 0.16, 0.07, 3);
        bot.note(`飾り棚の段${i + 1}(${(0.6 + i * 0.48).toFixed(2)})`);
      }
      bot.jumpUntil(-6.7, -0.9, 2.9, 3, 'stand'); bot.note('2階の床（南）(3.0)');
      bot.setRunning(true);
      // 吹き抜けを東まわりにぐるっと回って、2階の床（北）へ
      // 2階の本棚（x −5.3〜−4.7、z −0.75〜0.15）に当たらないよう、いったん南へ出てから東へ回る
      bot.goto(-6.5, 0.6, 0.25, 8); bot.goto(-3.0, 0.6, 0.25, 10); bot.goto(-1.2, 0.0, 0.25, 8);
      bot.note('本棚の南を回って吹き抜けの東がわへ');
      bot.goto(-1.2, -6.0, 0.25, 12); bot.note('吹き抜けの東を北へ');
      bot.goto(-3.3, -5.6, 0.2, 8); bot.note('2階の床（北）へ');
    } else {
      // 吹き抜けの北のふちに立つ「麻ひもの柱」を登って 2階の床（北）へ
      // ローテーブルの脚に挟まるので、西の壁ぎわを回ってから柱へ寄る
      bot.goto(-6.9, 5.0, 0.25, 8); bot.goto(-6.9, 0.5, 0.25, 8); bot.goto(-5.5, -1.0, 0.25, 8);
      bot.goto(-5.9, -4.1, 0.2, 8); bot.note('麻ひもの柱の前');
      const climbed = bot.climb(); bot.note(`柱を登る(${climbed ? '登り切り' : '失敗'})`);
      bot.goto(-5.9, -5.7, 0.25, 6); bot.note('2階の床（北）(3.0)');
      bot.goto(-3.3, -5.6, 0.2, 8); bot.note('タンスの前へ');
    }

    // タンスの引き出しを爪で開け、段にして梁へ上がる
    // タンスの南西に寄り、北を向いて引き出しに爪を当てる（引き出しは西へ出る）
    bot.goto(-4.3, -5.9, 0.1, 6); bot.note('タンスの南西');
    bot.face(-4.3, -6.5); bot.claw(); bot.note('引き出しを爪で開ける');
    // 開いた引き出し（x −5.3〜−4.0、天端 3.6）のうち、タンスから出ている x −5.3〜−4.5 に乗る
    bot.goto(-6.1, -6.5, 0.15, 6); bot.note('引き出しの西どなり（助走をとる）');
    // 東へ寄りすぎるとタンスの西面（x −4.50）に体の端が食い込んで動けなくなる
    bot.jumpUntil(-5.2, -6.5, 3.5); bot.note('引き出し(3.6)に乗る');
    // 引き出しの西の端まで下がってから、助走してタンスの上へ
    bot.goto(-5.15, -6.5, 0.1, 4); bot.note('引き出しの西の端');
    bot.jumpUntil(-4.2, -6.5, 4.2); bot.note('タンスの上(4.3)');
    // タンスの上の箱（天端 4.75）を踏み台にして梁へ。直接跳ぶと +0.75 で梁の縁にしか乗れない
    bot.goto(-4.15, -6.5, 0.1, 4);
    bot.jumpUntil(-3.6, -6.5, 4.7, 3, 'stand'); bot.note('タンスの上の箱(4.75)');
    // 箱の上なら頭が梁の下面(4.83)より高いので、ぶつからずに西へ跳び移れる
    bot.jumpUntil(-4.58, -6.5, 4.95, 3, 'stand'); bot.note('梁（南北）(5.05)へ跳ぶ');
    bot.goto(-4.58, -6.3, 0.08, 4); bot.note('梁の中心へ寄る');
    // 幅 0.45 の梁の上を、中心線に沿って少しずつ南へ渡る
    bot.goto(-4.58, -5.6, 0.1, 6); bot.goto(-4.58, -4.5, 0.1, 6); bot.goto(-4.55, -3.5, 0.1, 6);
    bot.note('梁の十字へ');
    bot.goto(-3.6, -3.5, 0.1, 6); bot.goto(-2.9, -3.5, 0.12, 6); bot.claw(); bot.note('猫ベッドに爪');
    const cleared = g.cat.isResting;
    results.push(`家ルート${route}：${cleared ? '✓ クリア' : '✗ 届かなかった'}` + nl + '  ' + bot.log.join(nl + '  '));
  }
  const report = results.join(nl);
  console.log(report);
  return report;
}

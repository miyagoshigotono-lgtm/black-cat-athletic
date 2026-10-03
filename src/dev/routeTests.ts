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

  constructor(private readonly g: Debug) {}

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

/** 塀の向こう（z < -6.3）の地面にいるか */
function beyondFence(b: Bot): boolean {
  const p = b.pos;
  return p.z < -6.3 && p.y < 0.1;
}

export function runRouteTests(game: Game): string {
  const g = game.debug;
  if (g.stage.id === 'factory') return runFactoryTest(game);
  if (g.stage.id === 'house') return runHouseTest(game);
  if (g.stage.id !== 'forest') return '森・工場・家のステージで実行してください';
  const s = g.stage.start;
  const results: string[] = [];

  // ---------------- ルート A：ツタ → ① → ② → ③ → 塀の上の葉 ----------------
  {
    const bot = new Bot(g);
    bot.start(s.x, s.y, s.z, s.facing);
    bot.goto(0.2, 3.4, 0.06, 4); bot.note('ツタの前（幹に当たって止まる）');
    const climbed = bot.climb(); bot.note(`ツタを登る(${climbed ? '登り切り' : '失敗'})`);
    bot.goto(0.2, 2.55, 0.1); bot.goto(-0.93, 1.29, 0.08); bot.note('①の枝（西）の先');
    bot.jumpToward(-1.9, 0.6); bot.note('②の股へ跳ぶ');
    bot.goto(-2.48, -1.55, 0.08); bot.note('②の枝（北）の先');
    bot.jumpToward(-3.0, -2.6); bot.note('③の木へ跳ぶ');
    bot.goto(-2.25, -4.8, 0.06, 4); bot.note('細い枝（葉に当たって止まる）');
    bot.jumpToward(-1.9, -5.9); bot.note('塀の上の葉へ跳ぶ');
    bot.goto(-1.9, -7.6, 0.12, 4); bot.wait(1.0); bot.note('葉の向こうへ降りる');
    const ok = beyondFence(bot);
    bot.goto(0, -10.4, 0.05, 8); bot.claw(); bot.note('段ボールに爪');
    const cleared = g.cat.isResting;
    results.push(`ルートA（ツタ）：${ok ? '✓ 塀を越えた' : '✗ 越えられない'}${cleared ? '・クリア' : ''}\n  ${bot.log.join('\n  ')}`);
  }

  // ---------------- ルート B：倒木 → 岩E → ④の枝 → ⑤の枝 ----------------
  {
    const bot = new Bot(g);
    bot.start(s.x, s.y, s.z, s.facing);
    bot.goto(4.66, 2.83, 0.15, 6); bot.note('倒木の下の端');
    bot.jumpToward(4.2, 1.9); bot.note('倒木に跳び乗る');
    // 倒木の中心線に沿って登る（斜めに横切ると脇から落ちる）
    bot.goto(4.1, 1.77, 0.12); bot.goto(3.7, 0.93, 0.12); bot.goto(3.35, 0.2, 0.12); bot.goto(3.1, -0.4, 0.12, 4); bot.note('倒木の上の端（幹に当たって止まる）');
    bot.jumpToward(3.0, -1.15); bot.note('④の枝へ跳ぶ');
    bot.goto(3.12, -1.9, 0.1); bot.goto(3.28, -2.85, 0.1); bot.goto(3.33, -3.2, 0.08); bot.note('④の枝の先');
    bot.jumpToward(3.9, -3.3); bot.note('⑤の枝へ跳ぶ');
    // 細い枝は中心線に沿って歩く（直線で追うと踏み外す）
    bot.goto(3.85, -3.6, 0.08); bot.goto(3.6, -4.4, 0.08); bot.goto(3.45, -5.05, 0.08); bot.note('⑤の枝の先');
    bot.jumpToward(3.3, -7.2); bot.wait(0.8); bot.note('塀を跳び越える');
    results.push(`ルートB（倒木）：${beyondFence(bot) ? '✓ 塀を越えた' : '✗ 越えられない'}\n  ${bot.log.join('\n  ')}`);
  }

  // ---------------- ルート C：岩 → 塀の上 ----------------
  {
    const bot = new Bot(g);
    bot.start(s.x, s.y, s.z, s.facing);
    bot.goto(-4.05, 0.55, 0.15, 6); bot.note('岩Aの手前');
    bot.jumpToward(-4.2, -0.15); bot.note('岩Aの上(0.56)');
    bot.goto(-4.36, -0.91, 0.06); bot.jumpToward(-4.8, -1.75); bot.note('岩Bへ');
    bot.goto(-4.74, -1.99, 0.06); bot.jumpToward(-4.5, -2.9); bot.note('岩Cへ');
    bot.goto(-4.61, -3.12, 0.06); bot.jumpToward(-5.05, -4.0); bot.note('岩Dへ');
    bot.goto(-4.98, -4.21, 0.06); bot.jumpToward(-4.7, -5.1); bot.note('塀ぎわの岩へ');
    bot.goto(-4.7, -5.3, 0.06); bot.jumpToward(-4.7, -6.8); bot.note('塀を跳び越える');
    bot.goto(-4.7, -7.5, 0.15, 4); bot.wait(0.8); bot.note('塀の向こうへ');
    results.push(`ルートC（岩）：${beyondFence(bot) ? '✓ 塀を越えた' : '✗ 越えられない'}\n  ${bot.log.join('\n  ')}`);
  }

  const report = results.join('\n');
  console.log(report);
  return report;
}

/**
 * 工場ステージの通しテスト。
 * A：木箱 → コンベア → 機械B → ダクト → 斜めの通路 → キャットウォーク → …
 * B：スイッチを入れて急なコンベアに乗り、一気にキャットウォークへ（ギミックの道）
 * どちらもキャットウォークから先は同じ（鉄骨 → 天窓 → 屋根 → 事務所 → キーボード）。
 */
function runFactoryTest(game: Game): string {
  const g = game.debug;
  const results: string[] = [];
  const nl = String.fromCharCode(10);

  for (const route of ['A', 'B'] as const) {
    // 同じページで2回目以降も試せるよう、ゴールの状態を戻す
    const goal = g.interactions.all.find((o) => o.kind === 'goal') as { reset?: () => void } | undefined;
    goal?.reset?.();
    const s = g.stage.start;
    const bot = new Bot(g);
    bot.start(s.x, s.y, s.z, s.facing);

    bot.goto(3.0, 21.6, 0.25, 8); bot.note('シャッターの前を西へ');
    bot.goto(1.7, 21.1, 0.15, 5); bot.note('開いている所の前');
    bot.goto(1.7, 19.2, 0.2, 5); bot.note('シャッターの下をくぐって中へ');

    if (route === 'A') {
      bot.goto(3.6, 16.8, 0.2, 8); bot.note('パレットの上(0.12)');
      bot.jumpToward(3.6, 16.0); bot.note('木箱A(0.7)');
      bot.goto(3.6, 15.4, 0.12, 4); bot.jumpToward(3.6, 14.5); bot.note('木箱B(1.35)');
      bot.goto(3.5, 13.9, 0.12, 4); bot.jumpToward(3.2, 13.2); bot.note('木箱C(2.0)');
      bot.goto(2.7, 12.9, 0.12, 4); bot.jumpToward(2.0, 12.7); bot.note('コンベアの下端(2.6)');
      bot.goto(0.6, 12.0, 0.15); bot.goto(-1.5, 11.1, 0.15); bot.goto(-3.6, 10.2, 0.15, 5); bot.note('コンベアの上端(4.5)');
      bot.goto(-5.0, 9.6, 0.15, 5); bot.note('機械Bの上(4.4)');
      bot.goto(-7.6, 9.0, 0.15, 5); bot.note('機械Bの西の端');
      bot.jumpToward(-8.8, 9.0); bot.note('ダクト（横）(5.2)');
      bot.goto(-11.5, 9.0, 0.15, 5); bot.goto(-12.34, 8.75, 0.15, 4); bot.note('ダクトの西寄り');
      bot.jumpToward(-12.34, 8.2); bot.note('斜めの通路（下）へ');
      bot.goto(-12.34, 6.2, 0.15, 5); bot.goto(-12.34, 4.9, 0.15, 4); bot.note('斜めの通路の上端(6.9)');
      bot.goto(-13.3, 4.6, 0.15, 4); bot.note('キャットウォーク(6.9)');
    } else {
      // 北の壁のスイッチを爪で入れてから、急なコンベアに乗る
      bot.goto(2.6, 17.2, 0.3, 8); bot.goto(1.6, 14.5, 0.3, 8); bot.goto(0.8, 11.0, 0.3, 8);
      bot.goto(0.2, 7.0, 0.3, 8); bot.goto(-0.2, 2.0, 0.3, 8);
      bot.goto(-0.5, -2.0, 0.3, 8);
      bot.goto(-4.2, -5.4, 0.3, 10); bot.goto(-5.0, -5.9, 0.2, 6); bot.goto(-5.0, -6.6, 0.08, 5);
      bot.note('スイッチの前');
      bot.claw(); bot.note('スイッチを入れる');
      bot.goto(-6.3, -5.0, 0.25, 8); bot.jumpToward(-7.15, -5.0); bot.note('ベルトの乗り場(0.45)');
      bot.jumpToward(-8.1, -5.0); bot.note('ベルトに乗る');
      bot.wait(5.0); bot.note('運ばれて上がる');
      bot.goto(-13.3, -5.0, 0.3, 6); bot.note('キャットウォーク(6.9)');
      bot.goto(-13.3, 0.0, 0.3, 8); bot.goto(-13.3, 4.6, 0.25, 8); bot.note('キャットウォークを南へ');
    }

  bot.goto(-13.2, 3.6, 0.12, 4); bot.note('斜めの通路（上）の下端');
  bot.goto(-12.2, 2.3, 0.15, 4); bot.goto(-11.4, 1.35, 0.12, 4); bot.goto(-11.0, 1.0, 0.08, 4);
  bot.note('鉄骨A(8.6)');
  bot.goto(-10.4, 1.0, 0.15, 8); bot.note('筋交いの下端');
  bot.goto(-9.8, 1.25, 0.12, 4);
  // 筋交いの中心線に沿って上る
  bot.goto(-9.0, 1.5, 0.12, 4); bot.goto(-8.0, 2.0, 0.12, 4); bot.goto(-6.9, 2.55, 0.12, 4);
  bot.goto(-6.5, 2.75, 0.12, 4); bot.note('鉄骨B(10.4)');
  bot.goto(-6.0, 2.9, 0.12, 4); bot.goto(-6.0, 2.0, 0.15, 5); bot.note('天窓へのダクト');
  bot.goto(-6.0, 0.0, 0.15, 5); bot.goto(-6.0, -1.5, 0.15, 5); bot.note('天窓を抜ける');
  bot.goto(-6.0, -3.0, 0.2, 5); bot.note('屋根の上(12.3)');
  bot.goto(-6.0, -6.5, 0.2, 8); bot.note('屋根を北へ');
  bot.goto(-6.0, -7.9, 0.2, 5); bot.wait(0.6); bot.note('屋外ダクト(9.8)へ降りる');
  bot.goto(-8.8, -8.6, 0.2, 5); bot.wait(0.6); bot.note('室外機(8.2)へ降りる');
  bot.jumpToward(-8.8, -11.6); bot.wait(0.8); bot.note('事務所の屋根(7.6)');
  bot.goto(-12.0, -11.4, 0.2, 6); bot.note('屋根の南西の端');
  bot.goto(-12.0, -10.2, 0.25, 4); bot.wait(0.8); bot.note('事務所のダクト(5.6)へ降りる');
  bot.goto(-10.2, -10.5, 0.2, 5); bot.note('ダクトの東の端');
  bot.jumpToward(-9.3, -10.7); bot.wait(0.6); bot.note('窓台(4.52)');
  bot.goto(-8.75, -11.9, 0.2, 5); bot.wait(0.6); bot.note('窓から事務所の中へ');
  bot.goto(-6.0, -17.3, 0.2, 10); bot.note('椅子の手前');
  bot.jumpToward(-6.0, -17.9); bot.note('椅子の上(4.45)');
  bot.jumpToward(-6.0, -18.75); bot.note('机の上(4.72)');
  bot.goto(-6.0, -18.95, 0.08, 4); bot.claw(); bot.note('キーボードに爪');
    const cleared = g.cat.isResting;
    results.push(`工場ルート${route}：${cleared ? '✓ クリア' : '✗ 届かなかった'}` + nl + '  ' + bot.log.join(nl + '  '));
  }
  const report = results.join(nl);
  console.log(report);
  return report;
}

/**
 * 家ステージの通しテスト。
 * A：網戸のすき間 → リビングの本棚 → 2階 → 手すり → 梁 → 猫ベッド
 * B：網戸のすき間 → 吹き抜けのカーテン → 出窓の棚 → 2階 → 2階の本棚 → 南北の梁 → 猫ベッド
 */
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
      bot.goto(-6.9, 5.0, 0.25, 8); bot.goto(-6.9, 0.5, 0.25, 8); bot.goto(-6.75, -5.62, 0.07, 12);
      bot.note('飾り棚の北がわ');
      bot.jumpToward(-6.7, -4.7, 3, 'stand'); bot.note('飾り棚の段1(0.6)');
      bot.jumpToward(-6.7, -3.95, 3, 'stand'); bot.note('飾り棚の段2(1.08)');
      bot.jumpToward(-6.7, -3.2, 3, 'stand'); bot.note('飾り棚の段3(1.56)');
      bot.jumpToward(-6.7, -2.45, 3, 'stand'); bot.note('飾り棚の段4(2.04)');
      bot.jumpToward(-6.7, -1.7, 3, 'stand'); bot.note('飾り棚の段5(2.52)');
      bot.jumpUntil(-6.7, -0.75, 2.9); bot.note('2階の床（南）(3.0)');
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
    bot.jumpUntil(-4.9, -6.5, 3.5); bot.note('引き出し(3.6)に乗る');
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

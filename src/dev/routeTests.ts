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
  jumpToward(x: number, z: number, timeout = 3): void {
    this.steer(x, z);
    this.step();
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
    this.release();
    this.wait(0.15);
  }

  /** 目の前の登れる面に爪を押し続けて登り切る */
  climb(timeout = 6): boolean {
    this.g.input.pressClaw();
    this.step();
    if (!this.g.cat.isClimbing) { this.g.input.releaseClaw(); return false; }
    let t = 0;
    this.g.input.moveX = 0;
    this.g.input.moveY = 1;
    while (t < timeout && this.g.cat.isClimbing) { this.step(); t += DT; }
    this.g.input.releaseClaw();
    this.release();
    this.wait(0.2);
    return !this.g.cat.isClimbing;
  }

  claw(): void {
    this.g.input.pressClaw();
    this.step();
    this.g.input.releaseClaw();
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
  if (g.stage.id !== 'forest') return '森のステージで実行してください（URL に ?stage= を付けない）';
  const s = g.stage.start;
  const results: string[] = [];

  // ---------------- ルート A：ツタ → ① → ② → ③ → 塀の上の葉 ----------------
  {
    const bot = new Bot(g);
    bot.start(s.x, s.y, s.z, s.facing);
    bot.goto(0.2, 3.4, 0.06, 4); bot.note('ツタの前（幹に当たって止まる）');
    const climbed = bot.climb(); bot.note(`ツタを登る(${climbed ? '登り切り' : '失敗'})`);
    bot.goto(-0.55, 1.72, 0.08); bot.note('①の枝（西）の先');
    bot.jumpToward(-1.9, 0.6); bot.note('②の股へ跳ぶ');
    bot.goto(-2.33, -1.1, 0.08); bot.note('②の枝（北）の先');
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
    bot.goto(3.1, 0.35, 0.15, 5); bot.note('倒木を登って岩Eの上へ');
    bot.jumpToward(2.9, -0.9); bot.note('④の枝へ跳ぶ');
    bot.goto(3.55, -1.8, 0.08); bot.note('④の枝の先');
    bot.jumpToward(3.97, -3.03); bot.note('⑤の枝へ跳ぶ');
    // 細い枝は中心線に沿って歩く（直線で追うと踏み外す）
    bot.goto(3.85, -3.6, 0.08); bot.goto(3.6, -4.4, 0.08); bot.goto(3.45, -5.05, 0.08); bot.note('⑤の枝の先');
    bot.jumpToward(3.3, -7.2); bot.wait(0.8); bot.note('塀を跳び越える');
    results.push(`ルートB（倒木）：${beyondFence(bot) ? '✓ 塀を越えた' : '✗ 越えられない'}\n  ${bot.log.join('\n  ')}`);
  }

  // ---------------- ルート C：岩 → 塀の上 ----------------
  {
    const bot = new Bot(g);
    bot.start(s.x, s.y, s.z, s.facing);
    bot.goto(-3.9, 0.3, 0.15, 6); bot.note('岩Aの手前');
    bot.jumpToward(-4.2, -0.6); bot.note('岩Aへ');
    bot.goto(-4.4, -1.0, 0.06); bot.jumpToward(-4.9, -2.0); bot.note('岩Bへ');
    bot.goto(-4.82, -2.3, 0.06); bot.jumpToward(-4.6, -3.6); bot.note('岩Cへ');
    bot.goto(-4.75, -3.9, 0.06); bot.jumpToward(-5.2, -4.6); bot.note('岩Dへ');
    bot.goto(-5.2, -4.85, 0.06); bot.jumpToward(-5.2, -6.5); bot.note('塀の方へ跳ぶ');
    bot.goto(-5.2, -7.5, 0.15, 4); bot.wait(0.8); bot.note('塀の向こうへ');
    results.push(`ルートC（岩）：${beyondFence(bot) ? '✓ 塀を越えた' : '✗ 越えられない'}\n  ${bot.log.join('\n  ')}`);
  }

  const report = results.join('\n');
  console.log(report);
  return report;
}

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

  // ---------------- ルート A ----------------
  {
    const b = new Bot(g);
    b.start(s.x, s.y, s.z, s.facing);
    b.goto(0, 3.15, 0.05, 4); b.note('ツタの前（幹に当たって止まる）');
    const climbed = b.climb(); b.note(`ツタを登る(${climbed ? '登り切り' : '失敗'})`);
    b.goto(-0.42, 1.48, 0.08); b.note('①の枝先');
    b.jumpToward(-1.2, 0.0); b.note('②の股へ跳ぶ');
    b.goto(-1.0, -0.25); b.goto(-0.6, -1.7); b.goto(-0.2, -3.0); b.note('②→③の枝を渡る');
    b.goto(0.1, -3.7); b.note('③の股');
    b.goto(0.4, -5.2, 0.05, 3); b.note('張り出し枝（葉に当たって止まる）');
    b.jumpToward(0.6, -6.0); b.note('塀の上の葉へ跳ぶ');
    b.goto(0.6, -8.0, 0.1, 4); b.wait(1.0); b.note('葉の向こうへ降りる');
    const ok = beyondFence(b);
    // ゴールまで行ってクリアできるか
    b.goto(0, -10.05, 0.05, 6); b.claw(); b.note('段ボールに爪');
    const cleared = g.cat.isResting;
    results.push(`ルートA（ツタ）：${ok ? '✓ 塀を越えた' : '✗ 越えられない'}${cleared ? '・クリア' : ''}\n  ${b.log.join('\n  ')}`);
  }

  // ---------------- ルート B ----------------
  {
    const b = new Bot(g);
    b.start(s.x, s.y, s.z, s.facing);
    b.goto(3.5, 1.8); b.note('倒木の下の端');
    b.jumpToward(3.1, 0.85); b.note('倒木に跳び乗る');
    b.goto(2.45, -0.6, 0.08, 4); b.note('倒木を登る（幹に当たって止まる）');
    b.jumpToward(2.45, -1.9); b.note('④の横枝へ跳ぶ');
    b.goto(2.85, -4.95, 0.1); b.note('横枝の先');
    b.jumpToward(3.0, -7.2); b.wait(0.8); b.note('塀を跳び越える');
    results.push(`ルートB（倒木）：${beyondFence(b) ? '✓ 塀を越えた' : '✗ 越えられない'}\n  ${b.log.join('\n  ')}`);
  }

  // ---------------- ルート C ----------------
  {
    const b = new Bot(g);
    b.start(s.x, s.y, s.z, s.facing);
    b.goto(-3.3, -1.2); b.note('岩①の手前');
    b.jumpToward(-3.6, -2.0); b.note('岩①へ');
    b.goto(-3.71, -2.22, 0.06); b.jumpToward(-4.3, -3.4); b.note('岩②へ');
    b.goto(-4.34, -3.6, 0.06); b.jumpToward(-4.6, -4.9); b.note('岩③へ');
    b.goto(-4.6, -5.05, 0.06); b.jumpToward(-4.6, -6.6); b.note('塀の方へ跳ぶ');
    b.goto(-4.6, -7.5, 0.1, 3); b.wait(0.8); b.note('塀の向こうへ');
    results.push(`ルートC（岩）：${beyondFence(b) ? '✓ 塀を越えた' : '✗ 越えられない'}\n  ${b.log.join('\n  ')}`);
  }

  const report = results.join('\n');
  console.log(report);
  return report;
}

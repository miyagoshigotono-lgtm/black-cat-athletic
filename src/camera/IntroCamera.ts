import * as THREE from 'three';

/** 導入演出の長さ [s] */
const DURATION = 7.0;
/** 最初にゴールを見せている割合（この間はカメラだけ動き、注視点はゴールのまま） */
const LOOK_HOLD = 0.25;

/**
 * 導入演出のカメラ（SPEC 9.2）。
 * ゴールを映す → ドローンのように引いて高い所から全体を見せる → 猫へ寄る → そのままプレイ視点へ。
 *
 * 通る点は「ゴールのそば → ステージが指定した道（introPath）→ プレイ用カメラの位置」。
 * 最後の点は毎フレーム、プレイ用カメラの今の位置を入れるので、終わった瞬間に位置と向きがそろう。
 * 画面のどこかを触る・クリック・キーを押すと飛ばせる。
 */
export class IntroCamera {
  private elapsed = 0;
  private finished = false;
  private readonly curve = new THREE.CatmullRomCurve3(
    [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    false,
    'catmullrom',
    0.4,
  );
  private readonly points: THREE.Vector3[];
  private readonly look = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();

  constructor(
    /** ゴールの位置（最初に映す所） */
    private readonly goal: THREE.Vector3,
    /** 途中で通る点（ステージごと。窓の外・屋根の上など） */
    path: ReadonlyArray<readonly [number, number, number]>,
  ) {
    // ゴールの少し斜め上 → 指定の点 → （最後はプレイ用カメラの位置。毎フレーム入れ替える）
    this.points = [
      new THREE.Vector3(goal.x + 0.75, goal.y + 0.5, goal.z + 0.8),
      new THREE.Vector3(goal.x + 1.8, goal.y + 1.6, goal.z + 2.4),
      ...path.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      new THREE.Vector3(),
    ];
    this.curve.points = this.points;
  }

  get done(): boolean {
    return this.finished;
  }

  /** 飛ばす（入力があったとき） */
  skip(): void {
    this.finished = true;
  }

  /**
   * カメラを演出の位置へ動かす。
   * @param playPos プレイ用カメラの今の位置（演出の最後の点）
   * @param playLook プレイ用カメラの注視点（猫）
   */
  update(dt: number, camera: THREE.PerspectiveCamera, playPos: THREE.Vector3, playLook: THREE.Vector3): void {
    this.points[this.points.length - 1].copy(playPos);
    this.elapsed += dt;
    const raw = Math.min(1, this.elapsed / DURATION);
    // ゆっくり始まり、ゆっくり終わる
    const s = raw * raw * (3 - 2 * raw);
    this.curve.getPoint(s, this.pos);
    camera.position.copy(this.pos);

    // 注視点：しばらくゴールを見てから、猫へ移す
    const m = Math.min(1, Math.max(0, (s - LOOK_HOLD) / (1 - LOOK_HOLD)));
    this.look.copy(this.goal).lerp(playLook, m * m * (3 - 2 * m));
    camera.lookAt(this.look);

    if (raw >= 1) this.finished = true;
  }
}

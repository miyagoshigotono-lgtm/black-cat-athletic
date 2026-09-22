import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Rapier の World を包むクラス。
 * 猫はキネマティック制御なので、ここでの重力は将来の背景物理（揺れる物など）用。
 */
export class Physics {
  readonly world: RAPIER.World;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  }

  /** 固定刻みで1ステップ進める */
  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  /**
   * 動かない箱のコライダーを追加する。
   * @param center 中心座標
   * @param half 各軸の半分の長さ
   */
  addStaticBox(center: { x: number; y: number; z: number }, half: { x: number; y: number; z: number }): RAPIER.Collider {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z),
    );
    return this.world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z), body);
  }

  /**
   * 空間検索（castShape 等）はステップ時に更新されるため、
   * コライダーをまとめて追加した直後に1回呼んで検索用データを最新にする。
   */
  refreshQueries(): void {
    // 動く物体はまだ無いので、通常の刻みで1回進めても状態は変わらない
    this.step(1 / 60);
  }
}

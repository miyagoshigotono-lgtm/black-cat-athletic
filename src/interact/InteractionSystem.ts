import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Interactable, ClawHit } from './Interactable';
import type { ScratchMarks } from './ScratchMarks';
import type { CatController } from '../player/CatController';
import type { InputState } from '../input/InputState';
import { CAT_SHAPE } from '../player/CatParams';

/** 爪が届く距離（鼻先からの距離）[m] */
const CLAW_REACH = 0.15;
/** 爪の判定に使う光線の、体の中心線からの左右のずれ [m] */
const RAY_SIDE_OFFSETS = [0, -0.05, 0.05];
/** 爪の判定の高さ（体の中心からの上乗せ、胸のあたり）[m] */
const RAY_HEIGHT = 0.03;
/**
 * 前方の光線が何にも当たらなかったときに使う、斜め下の光線（床に置いた皿など低い物用）。
 * 角度 20°・長さ 0.45 なら、胸の高さ（地面から 0.17）からは床に届かない（床は前方 0.47 で当たる）ので、
 * 何もない所で爪を出しても床に爪痕は付かない。
 */
const DOWN_RAY_ANGLE = (20 * Math.PI) / 180;
const DOWN_RAY_LENGTH = 0.45;
/**
 * 対象（インタラクタブル）を優先する距離の差 [m]。
 * 幹に埋め込んだツタのように、対象と普通の物の表面が同じ位置にあるとき、対象の方を選ぶ。
 */
const PREFER_INTERACTABLE = 0.01;

/**
 * 爪ボタンの処理（SPEC 6）。
 * - 爪を押すたびに、必ず「引っかく仕草」をし、何かに当たれば「爪痕」を付ける（対象かどうかに関係なく同じ）。
 * - 当たった物が対象（インタラクタブル）なら、その動作を起こす。
 * - 対象の選び方：猫の鼻先から前方へ光線を3本飛ばし、いちばん近くで当たった物（距離＋猫の向きで決まる）。
 *   画面上には候補もハイライトも出さない。
 */
export class InteractionSystem {
  private readonly items: Interactable[] = [];
  private readonly byCollider = new Map<number, Interactable>();
  /** 押している間続く動作の最中の対象 */
  private active: Interactable | null = null;

  /** 引っかく仕草を再生する（CatView につなぐ） */
  onSwipe: () => void = () => {};
  /** 直近に爪が当たった物の説明（デバッグ表示用） */
  lastResult = '—';

  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });

  constructor(
    private readonly world: RAPIER.World,
    private readonly cat: CatController,
    private readonly scratches: ScratchMarks,
  ) {}

  add(item: Interactable): void {
    this.items.push(item);
    for (const c of item.colliders) this.byCollider.set(c.handle, item);
  }

  /** 物理ステップごと（猫の更新の前）に呼ぶ */
  fixedUpdate(dt: number, input: InputState): void {
    // 押している間続く動作：爪を離した、または猫の側で終わった（乗り越え・飛び降り等）
    if (this.active) {
      if (!this.cat.isClimbing) {
        this.active = null;
      } else if (!input.clawHeld) {
        this.active.onRelease?.(this.cat);
        this.active = null;
      }
    }

    // 休んでいる（ゴール後）間は爪を出さない
    if (input.consumeClaw() && !this.active && !this.cat.isResting) this.claw();

    for (const item of this.items) item.fixedUpdate?.(dt);
  }

  private claw(): void {
    this.onSwipe();
    const hit = this.probe();
    if (!hit) {
      this.lastResult = '空振り';
      return;
    }
    this.scratches.add(hit.point, hit.normal);
    const item = this.byCollider.get(hit.collider.handle);
    if (!item) {
      this.lastResult = '爪痕のみ';
      return;
    }
    const engaged = item.onClaw(hit, this.cat);
    if (item.mode === 'hold' && engaged) this.active = item;
    this.lastResult = `${item.name}${item.mode === 'hold' ? (engaged ? '（開始）' : '（不可）') : ''}`;
  }

  /** 猫の前方で、いちばん近くに当たった物 */
  private probe(): ClawHit | null {
    const center = this.cat.getInterpolatedCenter(1, new THREE.Vector3());
    const f = this.cat.facing;
    const dir = { x: -Math.sin(f), y: 0, z: -Math.cos(f) };
    const right = { x: Math.cos(f), z: -Math.sin(f) };
    const maxDist = CAT_SHAPE.length / 2 + CLAW_REACH;

    let best: RAPIER.RayColliderIntersection | null = null;
    let bestOrigin = { x: 0, y: 0, z: 0 };
    for (const side of RAY_SIDE_OFFSETS) {
      const origin = {
        x: center.x + right.x * side,
        y: center.y + RAY_HEIGHT,
        z: center.z + right.z * side,
      };
      this.ray.origin = origin;
      this.ray.dir = dir;
      const hit = this.world.castRayAndGetNormal(
        this.ray,
        maxDist,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        this.cat.collider,
      );
      if (hit && (!best || hit.timeOfImpact < best.timeOfImpact)) {
        best = hit;
        bestOrigin = origin;
      }
      // 表面が重なっている場合（埋め込み）や、当たり判定を持たない登れる範囲（センサー）に備え、
      // 対象だけに当たる光線も飛ばし、ほぼ同じ距離（またはより近く）なら対象を選ぶ
      const target = this.world.castRayAndGetNormal(
        this.ray,
        maxDist,
        true,
        undefined,
        undefined,
        this.cat.collider,
        undefined,
        (c) => this.byCollider.has(c.handle),
      );
      const bestIsTarget = best !== null && this.byCollider.has(best.collider.handle);
      if (target && (!best || (!bestIsTarget && target.timeOfImpact <= best.timeOfImpact + PREFER_INTERACTABLE))) {
        best = target;
        bestOrigin = origin;
      }
    }
    if (!best) {
      // 前方に何もなければ、斜め下（床の上の低い物）を探す
      const origin = { x: center.x, y: center.y + RAY_HEIGHT, z: center.z };
      const down = {
        x: dir.x * Math.cos(DOWN_RAY_ANGLE),
        y: -Math.sin(DOWN_RAY_ANGLE),
        z: dir.z * Math.cos(DOWN_RAY_ANGLE),
      };
      this.ray.origin = origin;
      this.ray.dir = down;
      const hit = this.world.castRayAndGetNormal(
        this.ray,
        DOWN_RAY_LENGTH,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        this.cat.collider,
      );
      if (!hit) return null;
      const t = hit.timeOfImpact;
      return {
        collider: hit.collider,
        point: new THREE.Vector3(origin.x + down.x * t, origin.y + down.y * t, origin.z + down.z * t),
        normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z).normalize(),
      };
    }
    return {
      collider: best.collider,
      point: new THREE.Vector3(
        bestOrigin.x + dir.x * best.timeOfImpact,
        bestOrigin.y,
        bestOrigin.z + dir.z * best.timeOfImpact,
      ),
      normal: new THREE.Vector3(best.normal.x, best.normal.y, best.normal.z).normalize(),
    };
  }
}

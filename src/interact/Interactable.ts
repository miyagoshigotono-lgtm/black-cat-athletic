import type RAPIER from '@dimforge/rapier3d-compat';
import type * as THREE from 'three';
import type { CatController } from '../player/CatController';

/**
 * 爪の対象（インタラクタブル）の共通の形（SPEC 6.3）。
 *
 * - 押した瞬間に1回で完了する物（ドア等）は mode = 'instant'
 * - 体を押し当てると始まる物（登れる面）は mode = 'touch'。onTouch が true を返すとその状態に入る
 * - 爪を押している間続く物は mode = 'hold'（onClaw が true を返し、離すと onRelease）
 * - ギミックは可逆な状態機械として作る（開けたら閉められる）。
 *
 * 新しい種類を増やすときは、このインターフェースを満たすクラスを1つ作り、registry.ts に登録する。
 */
export interface Interactable {
  /** 種類（配置データの kind と同じ） */
  readonly kind: string;
  /** 配置データの名前（デバッグ表示用） */
  readonly name: string;
  /** instant：爪で1回。hold：爪を押している間。touch：体を押し当てると始まる（爪不要） */
  readonly mode: 'instant' | 'hold' | 'touch';
  /** 爪が当たったと判定する当たり判定 */
  readonly colliders: readonly RAPIER.Collider[];

  /**
   * 爪が当たったとき。
   * @returns hold の場合、押している間の状態に入れたら true
   */
  onClaw(hit: ClawHit, cat: CatController): boolean;

  /**
   * 体を押し当てたときに始まる動作（爪を使わない）。登れる面（ツタ・金網）で使う。
   * 猫が前へ進もうとしてこの対象に当たっているとき、毎ステップ呼ばれる。
   */
  onTouch?(hit: ClawHit, cat: CatController): boolean;

  /** hold の対象で、爪を離したとき（または猫側の都合で終わったとき） */
  onRelease?(cat: CatController): void;

  /** 毎物理ステップの更新（開閉の動きなど）。world.step() の前に呼ばれる */
  fixedUpdate?(dt: number): void;
}

/** 爪が当たった場所 */
export interface ClawHit {
  collider: RAPIER.Collider;
  /** 当たった点（ワールド座標） */
  point: THREE.Vector3;
  /** 当たった面の外向きの法線（ワールド座標、単位ベクトル） */
  normal: THREE.Vector3;
}

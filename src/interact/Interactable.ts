import type RAPIER from '@dimforge/rapier3d-compat';
import type * as THREE from 'three';
import type { CatController } from '../player/CatController';

/**
 * 爪の対象（インタラクタブル）の共通の形（SPEC 6.3）。
 *
 * - 押した瞬間に1回で完了する物（ドア等）は mode = 'instant'
 * - 押している間続く物（登る等）は mode = 'hold'。onClaw が true を返すと「押している間」の状態に入り、
 *   爪を離したら onRelease が呼ばれる。
 * - ギミックは可逆な状態機械として作る（開けたら閉められる）。
 *
 * 新しい種類を増やすときは、このインターフェースを満たすクラスを1つ作り、registry.ts に登録する。
 */
export interface Interactable {
  /** 種類（配置データの kind と同じ） */
  readonly kind: string;
  /** 配置データの名前（デバッグ表示用） */
  readonly name: string;
  readonly mode: 'instant' | 'hold';
  /** 爪が当たったと判定する当たり判定 */
  readonly colliders: readonly RAPIER.Collider[];

  /**
   * 爪が当たったとき。
   * @returns hold の場合、押している間の状態に入れたら true
   */
  onClaw(hit: ClawHit, cat: CatController): boolean;

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

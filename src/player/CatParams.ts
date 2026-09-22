import { CAT_HALF_HEIGHT, CAT_RADIUS } from '../greybox/protoCourseData';

/**
 * 猫の調整値（SPEC「未決事項」：プロトタイプで調整）。
 * デバッグパネル（lil-gui）から実行中に変更できる。
 */
export const catParams = {
  /** 移動速度 [m/s] */
  moveSpeed: 3.0,
  /** ジャンプの高さ（足元が上がる高さ）[m] */
  jumpHeight: 1.0,
  /** 重力加速度 [m/s²]（現実の9.81より強めにしてふわつきを抑える） */
  gravity: 20,
  /** 空中での操作の効き（地上に対する割合 0〜1） */
  airControl: 0.3,
  /** 地上での加速度 [m/s²]（目標速度へ近づく速さ） */
  groundAccel: 40,
  /** 落下速度の上限 [m/s] */
  maxFallSpeed: 30,
  /** 足場の端から落ちた直後でもジャンプを受け付ける猶予 [s] */
  coyoteTime: 0.1,
  /** 着地の少し前に押したジャンプを覚えておく時間 [s] */
  jumpBufferTime: 0.1,
};

/** 当たり判定の寸法（変更不可。コース検算と一致させる） */
export const CAT_SHAPE = {
  radius: CAT_RADIUS,
  halfHeight: CAT_HALF_HEIGHT,
  /** 全高 = 2 × (半球中心までの距離 + 半径) = 0.40m */
  height: 2 * (CAT_HALF_HEIGHT + CAT_RADIUS),
  /** Rapier キャラクターコントローラーの接触マージン [m] */
  offset: 0.01,
  /** 自動で乗り越えられる段差の高さ [m] */
  autostepHeight: 0.1,
  /** 地面に吸着する距離 [m]（下り段差や坂で浮かないように） */
  snapToGround: 0.1,
  /** 登れる坂の最大角度 [度] */
  maxSlopeClimbDeg: 45,
  /** これより急な坂では滑り落ちる [度] */
  minSlopeSlideDeg: 30,
} as const;

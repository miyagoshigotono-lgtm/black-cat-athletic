import { CAT_HEIGHT, CAT_LENGTH, CAT_WIDTH } from '../greybox/protoCourseData.ts';

/**
 * 猫の調整値（SPEC「未決事項」：プロトタイプで調整して決めた値）。
 * コースの検算（scripts/verify-course.ts）もこの値を読むので、変えたら必ず検算し直す。
 */
export const catParams = {
  /** 移動速度 [m/s] */
  moveSpeed: 2.0,
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

/** 角丸の半径 [m]（角が引っかからないよう丸める） */
const BORDER = 0.03;

/**
 * 当たり判定の寸法（コース検算と一致させる）。
 * 四本脚の体に合わせた角丸の箱で、猫の向き（Y軸回り）と一緒に回る。
 * 外寸 = 2 × (半分の長さ + 角丸の半径)。
 */
export const CAT_SHAPE = {
  /** 外寸：幅（X）0.14 / 高さ（Y）0.26 / 長さ（Z）0.44 */
  width: CAT_WIDTH,
  height: CAT_HEIGHT,
  length: CAT_LENGTH,
  /** Rapier に渡す半分の長さ（角丸の半径を除いた芯の部分） */
  halfX: CAT_WIDTH / 2 - BORDER,
  halfY: CAT_HEIGHT / 2 - BORDER,
  halfZ: CAT_LENGTH / 2 - BORDER,
  border: BORDER,
  /** 向きを変えられるか調べるときに縮める量 [m]（接地・壁際の接触を「ぶつかり」と誤判定しないため。offset より小さくする） */
  turnTestShrink: 0.004,
  /** Rapier キャラクターコントローラーの接触マージン [m] */
  offset: 0.01,
  /**
   * 自動で乗り越えられる段差の高さ [m]。
   * 設計上は「0.1m の段は歩いて乗れる、0.2m は止まる」。底が平らな箱は接触マージン分だけ
   * 判定がぎりぎりになり 0.1m の段で止まることがあるため、少し余裕を持たせて 0.12 にしている。
   */
  autostepHeight: 0.12,
  /** 地面に吸着する距離 [m]（下り段差や坂で浮かないように） */
  snapToGround: 0.1,
  /** 登れる坂の最大角度 [度] */
  maxSlopeClimbDeg: 45,
  /** これより急な坂では滑り落ちる [度] */
  minSlopeSlideDeg: 30,
} as const;

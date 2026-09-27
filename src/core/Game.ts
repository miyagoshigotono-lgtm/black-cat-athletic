import * as THREE from 'three';
import { Physics } from './Physics';
import { CatController } from '../player/CatController';
import { CatView } from '../player/CatView';
import { PlayCamera } from '../camera/PlayCamera';
import { CameraRig } from '../camera/CameraRig';
import { IntroCamera } from '../camera/IntroCamera';
import { InputState } from '../input/InputState';
import { KeyboardMouseInput } from '../input/KeyboardMouseInput';
import { TouchInput } from '../input/TouchInput';
import { TouchControls } from '../ui/TouchControls';
import { DebugHud } from '../ui/DebugHud';
import { OrientationOverlay } from '../ui/OrientationOverlay';
import { buildStage } from '../stages/buildStage';
import type { StageDef } from '../stages/stageTypes';
import { ClearOverlay } from '../ui/ClearOverlay';
import { markCleared } from './progress';
import { nextStage } from '../stages';
import { InteractionSystem } from '../interact/InteractionSystem';
import { ScratchMarks } from '../interact/ScratchMarks';
import { createInteractable } from '../interact/registry';

/** 物理の固定刻み [s] */
const FIXED_DT = 1 / 60;
/** 1描画フレームで進める物理ステップの上限（処理落ち時に追いつこうとして固まるのを防ぐ） */
const MAX_STEPS_PER_FRAME = 5;
/** この高さより下に落ちたら開始地点へ戻す（ステージの外に抜けた時の安全策。本番のリスポーンではない） */
const OUT_OF_WORLD_Y = -5;

/** 解像度倍率の上限（スマホの負荷を抑えるため） */
const MAX_PIXEL_RATIO = 2;
/** 性能表示（FPS・座標など）を出すかどうか。URL に ?debug=1 を付けたときだけ */
const SHOW_DEBUG_HUD = new URLSearchParams(location.search).get('debug') === '1';

/**
 * ゲーム全体のまとめ役。
 * 物理は固定刻み、描画は可変フレームで回し、猫の表示位置はステップ間を補間する。
 */
export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly physics = new Physics();
  private readonly input = new InputState();
  /** 導入演出の間に猫へ渡す、何も押していない入力 */
  private readonly idleInput = new InputState();
  private readonly cat: CatController;
  private readonly catView: CatView;
  private readonly rig: CameraRig;
  private readonly keyboardMouse: KeyboardMouseInput;
  private readonly touchControls: TouchControls;
  private readonly hud: DebugHud | null;
  private readonly lockHint: HTMLDivElement;
  private readonly interactions: InteractionSystem;
  private readonly scratches: ScratchMarks;
  private readonly clearOverlay: ClearOverlay;
  private readonly startPosition: { x: number; y: number; z: number };
  private readonly skipHint: HTMLDivElement | null;
  private skipHandlers: (() => void) | null;

  /** ゴール済み（操作案内を出さない） */
  private cleared = false;
  private accumulator = 0;
  private lastTime = 0;
  private readonly catCenter = new THREE.Vector3();
  private readonly footTmp = new THREE.Vector3();

  constructor(
    container: HTMLElement,
    private readonly stage: StageDef,
  ) {
    // --- 描画 ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.applyPixelRatio();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(stage.sky);
    this.scene.fog = new THREE.Fog(stage.sky, 25, 60);
    this.scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x5a6450, 2.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(6, 12, 4);
    this.scene.add(sun);

    // ニアクリップを小さくして、狭所でカメラが壁に寄っても手前が欠けにくくする
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.03, 120);

    // --- ワールド ---
    buildStage(this.scene, this.physics, stage);
    this.startPosition = { x: stage.start.x, y: stage.start.y, z: stage.start.z };
    this.cat = new CatController(this.physics.world, this.startPosition);
    this.cat.facing = stage.start.facing;
    this.cat.teleport(this.startPosition); // 向きを当たり判定にも反映する
    this.scratches = new ScratchMarks(this.scene);
    this.interactions = new InteractionSystem(this.physics.world, this.cat, this.scratches);
    const next = nextStage(stage.id);
    this.clearOverlay = new ClearOverlay(document.body, stage.name, {
      onRetry: () => location.reload(),
      onSelect: () => { location.href = location.pathname; },
      ...(next ? { onNext: { label: `次へ：${next.label.replace(/^d+.s*/, '')}`, run: () => { location.href = `${location.pathname}?stage=${next.id}`; } } } : {}),
    });
    const ctx = { physics: this.physics, scene: this.scene, stage, onGoal: () => this.onGoal() };
    for (const def of stage.interactables) {
      this.interactions.add(createInteractable(def, ctx));
    }
    this.interactions.link();
    this.physics.refreshQueries();
    this.catView = new CatView(this.scene);
    this.interactions.onSwipe = () => this.catView.playSwipe();
    const playCamera = new PlayCamera(camera, this.physics.world, this.cat.collider);
    // カメラは猫の真後ろから始める（カメラの水平角 = 猫の向き）
    playCamera.yaw = stage.start.facing;
    this.rig = new CameraRig(playCamera);

    // --- 入力と UI ---
    const canvas = this.renderer.domElement;
    this.keyboardMouse = new KeyboardMouseInput(this.input, canvas);
    this.touchControls = new TouchControls(document.body);
    const touch = new TouchInput(this.input, this.touchControls, document.body);

    this.lockHint = document.createElement('div');
    this.lockHint.className = 'lock-hint';
    this.lockHint.textContent = 'クリックで操作開始（WASD 移動 / マウス 視点 / Space ジャンプ / Esc 解除）';
    document.body.appendChild(this.lockHint);

    // --- 導入演出（ゴールを見せてから猫へ寄る。触ると飛ばせる） ---
    const goal = stage.interactables.find((d) => d.kind === 'goal');
    if (goal && goal.kind === 'goal') {
      this.skipHint = document.createElement('div');
      this.skipHint.className = 'lock-hint';
      this.skipHint.textContent = '画面を触る・クリックで演出を飛ばす';
      document.body.appendChild(this.skipHint);
      const goalPos = new THREE.Vector3(goal.x, (goal.baseY ?? 0) + goal.height, goal.z);
      this.rig.startIntro(new IntroCamera(goalPos, stage.introPath ?? [[goalPos.x, goalPos.y + 12, goalPos.z]]));
      this.lockHint.classList.add('hidden'); // 演出中は操作案内を出さない
      const skip = () => this.endIntro();
      this.skipHandlers = skip;
      window.addEventListener('pointerdown', skip);
      window.addEventListener('keydown', skip);
    } else {
      this.skipHint = null;
      this.skipHandlers = null;
    }

    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    this.setTouchMode(isTouchDevice);
    // 途中でタッチされた場合（タッチ対応PCなど）もタッチ操作に切り替える
    touch.onFirstTouch = () => {
      if (!this.touchControls.visible) this.setTouchMode(true);
    };
    this.keyboardMouse.onLockChange = (locked) => {
      this.lockHint.classList.toggle('hidden', locked || this.touchControls.visible || this.cleared);
    };

    // 性能の確認用（?debug=1 のときだけ）。ふだんの画面には何も出さない
    this.hud = SHOW_DEBUG_HUD ? new DebugHud(document.body) : null;
    new OrientationOverlay(document.body);

    window.addEventListener('resize', () => this.onResize());
    window.visualViewport?.addEventListener('resize', () => this.onResize());
  }

  start(): void {
    this.lastTime = performance.now();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private frame(now: number): void {
    // タブ復帰直後などの大きな間隔は切り詰める
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    this.keyboardMouse.update();
    const intro = this.rig.mode === 'intro';
    // 演出中は操作を受け付けない（猫はその場で立っている）
    const input = intro ? this.idleInput : this.input;

    // --- 物理（固定刻み） ---
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      // 爪の処理（登りの開始・終了、ドアの開閉など）→ 猫の移動 → 物理
      this.interactions.fixedUpdate(FIXED_DT, input);
      this.cat.fixedUpdate(FIXED_DT, input, this.rig.controlYaw);
      this.physics.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;

    const foot = this.cat.getFootPosition(this.footTmp);
    if (foot.y < OUT_OF_WORLD_Y) this.cat.teleport(this.startPosition);

    // --- 描画 ---
    const alpha = this.accumulator / FIXED_DT;
    this.cat.getInterpolatedCenter(alpha, this.catCenter);
    this.rig.update(dt, input, this.catCenter);
    if (intro && this.rig.mode === 'play') this.endIntro();
    this.catView.update(
      dt,
      this.physics.world,
      this.cat.collider,
      this.catCenter,
      this.cat.facing,
      this.cat.pitch,
      this.rig.play.catOpacity,
      this.cat.animSpeed,
      this.cat.supported,
    );
    this.scratches.update(dt);

    this.renderer.render(this.scene, this.rig.camera);

    if (this.hud) {
      this.hud.setExtra(
        `足元 (${foot.x.toFixed(2)}, ${foot.y.toFixed(2)}, ${foot.z.toFixed(2)}) ${this.cat.isClimbing ? '登り' : this.cat.grounded ? '接地' : '空中'}\n` +
        `爪：${this.interactions.lastResult}\n` +
        `速さ ${this.cat.animSpeed.toFixed(2)} m/s / カメラ距離 ${this.rig.play.currentDistance.toFixed(2)} m`,
      );
      this.hud.update(dt, this.renderer);
    }
  }

  /** 導入演出を終える（飛ばした・最後まで再生した） */
  private endIntro(): void {
    this.rig.skipIntro();
    this.skipHint?.classList.add('hidden');
    this.lockHint.classList.toggle('hidden',
      this.touchControls.visible || this.keyboardMouse.isLocked || this.cleared);
    if (this.skipHandlers) {
      window.removeEventListener('pointerdown', this.skipHandlers);
      window.removeEventListener('keydown', this.skipHandlers);
      this.skipHandlers = null;
    }
  }

  /** ゴールに爪を当てた：猫は丸くなり、少し間をおいてクリア表示 */
  private onGoal(): void {
    this.cleared = true;
    markCleared(this.stage.id);
    this.catView.setResting(true);
    window.setTimeout(() => {
      this.clearOverlay.show();
      this.lockHint.classList.add('hidden');
      if (document.pointerLockElement) document.exitPointerLock();
    }, 1200);
  }

  private setTouchMode(enabled: boolean): void {
    this.touchControls.setVisible(enabled);
    this.lockHint.classList.toggle('hidden', enabled || this.keyboardMouse.isLocked);
  }

  private applyPixelRatio(): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.rig.camera.aspect = w / h;
    this.rig.camera.updateProjectionMatrix();
  }

  /** 開発時の確認用（コンソールから状態を見る） */
  get debug() {
    return { cat: this.cat, rig: this.rig, input: this.input, renderer: this.renderer, physics: this.physics, interactions: this.interactions, stage: this.stage };
  }
}

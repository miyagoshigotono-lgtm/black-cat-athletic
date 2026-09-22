import * as THREE from 'three';
import GUI from 'lil-gui';
import { Physics } from './Physics';
import { CatController } from '../player/CatController';
import { CatView } from '../player/CatView';
import { catParams } from '../player/CatParams';
import { PlayCamera, playCameraParams } from '../camera/PlayCamera';
import { CameraRig } from '../camera/CameraRig';
import { InputState, lookParams } from '../input/InputState';
import { KeyboardMouseInput } from '../input/KeyboardMouseInput';
import { TouchInput } from '../input/TouchInput';
import { TouchControls } from '../ui/TouchControls';
import { DebugHud } from '../ui/DebugHud';
import { OrientationOverlay } from '../ui/OrientationOverlay';
import { buildProtoCourse } from '../greybox/ProtoCourse';
import { START_POSITION } from '../greybox/protoCourseData';
import { PROTO_INTERACTABLES } from '../greybox/protoInteractables';
import { InteractionSystem } from '../interact/InteractionSystem';
import { ScratchMarks } from '../interact/ScratchMarks';
import { createInteractable } from '../interact/registry';

/** 物理の固定刻み [s] */
const FIXED_DT = 1 / 60;
/** 1描画フレームで進める物理ステップの上限（処理落ち時に追いつこうとして固まるのを防ぐ） */
const MAX_STEPS_PER_FRAME = 5;
/** この高さより下に落ちたら開始地点へ戻す（検証コース外に抜けた時の安全策。本番のリスポーンではない） */
const OUT_OF_WORLD_Y = -5;

/** 描画設定（デバッグパネルから変更可） */
const renderParams = {
  /** 解像度倍率の上限（スマホの負荷調整用） */
  maxPixelRatio: 2,
};

/**
 * ゲーム全体のまとめ役。
 * 物理は固定刻み、描画は可変フレームで回し、猫の表示位置はステップ間を補間する。
 */
export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly physics = new Physics();
  private readonly input = new InputState();
  private readonly cat: CatController;
  private readonly catView: CatView;
  private readonly rig: CameraRig;
  private readonly keyboardMouse: KeyboardMouseInput;
  private readonly touchControls: TouchControls;
  private readonly hud: DebugHud;
  private readonly lockHint: HTMLDivElement;
  private readonly interactions: InteractionSystem;
  private readonly scratches: ScratchMarks;

  private accumulator = 0;
  private lastTime = 0;
  private readonly catCenter = new THREE.Vector3();
  private readonly footTmp = new THREE.Vector3();

  constructor(container: HTMLElement) {
    // --- 描画 ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.applyPixelRatio();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0xa9c8e8);
    this.scene.fog = new THREE.Fog(0xa9c8e8, 25, 60);
    this.scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x5a6450, 2.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(6, 12, 4);
    this.scene.add(sun);

    // ニアクリップを小さくして、狭所でカメラが壁に寄っても手前が欠けにくくする
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.03, 120);

    // --- ワールド ---
    buildProtoCourse(this.scene, this.physics);
    this.cat = new CatController(this.physics.world, START_POSITION);
    this.scratches = new ScratchMarks(this.scene);
    this.interactions = new InteractionSystem(this.physics.world, this.cat, this.scratches);
    for (const def of PROTO_INTERACTABLES) {
      this.interactions.add(createInteractable(def, this.physics, this.scene));
    }
    this.physics.refreshQueries();
    this.catView = new CatView(this.scene);
    this.interactions.onSwipe = () => this.catView.playSwipe();
    this.rig = new CameraRig(new PlayCamera(camera, this.physics.world, this.cat.collider));

    // --- 入力と UI ---
    const canvas = this.renderer.domElement;
    this.keyboardMouse = new KeyboardMouseInput(this.input, canvas);
    this.touchControls = new TouchControls(document.body);
    const touch = new TouchInput(this.input, this.touchControls, document.body);

    this.lockHint = document.createElement('div');
    this.lockHint.className = 'lock-hint';
    this.lockHint.textContent = 'クリックで操作開始（WASD 移動 / マウス 視点 / Space ジャンプ / Esc 解除）';
    document.body.appendChild(this.lockHint);

    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    this.setTouchMode(isTouchDevice);
    // 途中でタッチされた場合（タッチ対応PCなど）もタッチ操作に切り替える
    touch.onFirstTouch = () => {
      if (!this.touchControls.visible) this.setTouchMode(true);
    };
    this.keyboardMouse.onLockChange = (locked) => {
      this.lockHint.classList.toggle('hidden', locked || this.touchControls.visible);
    };

    this.hud = new DebugHud(document.body);
    new OrientationOverlay(document.body);
    this.createDebugPanel(isTouchDevice);

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

    // --- 物理（固定刻み） ---
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      // 爪の処理（登りの開始・終了、ドアの開閉など）→ 猫の移動 → 物理
      this.interactions.fixedUpdate(FIXED_DT, this.input);
      this.cat.fixedUpdate(FIXED_DT, this.input, this.rig.controlYaw);
      this.physics.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;

    const foot = this.cat.getFootPosition(this.footTmp);
    if (foot.y < OUT_OF_WORLD_Y) this.cat.teleport(START_POSITION);

    // --- 描画 ---
    const alpha = this.accumulator / FIXED_DT;
    this.cat.getInterpolatedCenter(alpha, this.catCenter);
    this.rig.update(dt, this.input, this.catCenter);
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

    this.hud.setExtra(
      `足元 (${foot.x.toFixed(2)}, ${foot.y.toFixed(2)}, ${foot.z.toFixed(2)}) ${this.cat.isClimbing ? '登り' : this.cat.grounded ? '接地' : '空中'}\n` +
      `爪：${this.interactions.lastResult}\n` +
      `速さ ${this.cat.animSpeed.toFixed(2)} m/s / カメラ距離 ${this.rig.play.currentDistance.toFixed(2)} m`,
    );
    this.hud.update(dt, this.renderer);
  }

  private setTouchMode(enabled: boolean): void {
    this.touchControls.setVisible(enabled);
    this.lockHint.classList.toggle('hidden', enabled || this.keyboardMouse.isLocked);
  }

  private applyPixelRatio(): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, renderParams.maxPixelRatio));
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.rig.camera.aspect = w / h;
    this.rig.camera.updateProjectionMatrix();
  }

  /** 調整値のパネル（SPEC 未決事項「移動速度・ジャンプ力・空中操作」をその場で調整するため） */
  private createDebugPanel(startClosed: boolean): void {
    // スマホでは画面を隠しすぎないよう細くする
    const gui = new GUI({ title: '調整（検証用）', width: startClosed ? 210 : 260 });
    const catFolder = gui.addFolder('猫');
    catFolder.add(catParams, 'moveSpeed', 0.5, 8, 0.1).name('移動速度 m/s');
    catFolder.add(catParams, 'jumpHeight', 0.2, 2.5, 0.05).name('ジャンプ高さ m');
    catFolder.add(catParams, 'gravity', 5, 40, 0.5).name('重力 m/s²');
    catFolder.add(catParams, 'airControl', 0, 1, 0.05).name('空中操作の効き');
    catFolder.add(catParams, 'groundAccel', 5, 100, 1).name('地上の加速度');
    catFolder.add({ reset: () => this.cat.teleport(START_POSITION) }, 'reset').name('開始地点へ戻す（検証用）');

    const camFolder = gui.addFolder('カメラ');
    camFolder.add(playCameraParams, 'distance', 0.6, 5, 0.1).name('距離 m');
    camFolder.add(playCameraParams, 'targetHeight', 0, 0.6, 0.01).name('注視点の高さ m');
    camFolder.add(playCameraParams, 'probeRadius', 0.03, 0.3, 0.01).name('判定球の半径 m');
    camFolder.add(playCameraParams, 'returnSpeed', 0.5, 15, 0.5).name('戻る速さ');
    camFolder.add(playCameraParams, 'fadeStart', 0.1, 1.5, 0.01).name('猫が薄くなる距離');
    camFolder.add(playCameraParams, 'fadeEnd', 0, 1, 0.01).name('猫が消える距離');

    const inputFolder = gui.addFolder('操作');
    inputFolder.add(lookParams, 'mouseSensitivity', 0.0005, 0.01, 0.0001).name('マウス感度');
    inputFolder.add(lookParams, 'touchSensitivity', 0.001, 0.02, 0.0005).name('スワイプ感度');
    inputFolder.add(lookParams, 'invertY').name('上下反転');

    const renderFolder = gui.addFolder('描画');
    renderFolder.add(renderParams, 'maxPixelRatio', 0.5, 3, 0.25).name('解像度倍率の上限').onChange(() => {
      this.applyPixelRatio();
      this.onResize();
    });

    catFolder.close();
    camFolder.close();
    inputFolder.close();
    renderFolder.close();
    if (startClosed) gui.close();
  }

  /** 開発時の確認用（コンソールから状態を見る） */
  get debug() {
    return { cat: this.cat, rig: this.rig, input: this.input, renderer: this.renderer, physics: this.physics, interactions: this.interactions };
  }
}

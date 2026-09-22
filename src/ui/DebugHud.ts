import type * as THREE from 'three';

/** Chrome 系だけが持つ JS ヒープ情報 */
interface PerformanceMemory {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

/**
 * 性能計測の簡易表示（SPEC 11章-6：モバイル性能予算を ① から計測する）。
 * FPS、ドローコール数、三角形数、ジオメトリ数・テクスチャ数、JSヒープ（対応環境のみ）。
 */
export class DebugHud {
  private readonly el: HTMLDivElement;
  private frames = 0;
  private elapsed = 0;
  private fps = 0;
  private worstMs = 0;
  private extra = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'debug-hud';
    this.el.textContent = '計測中…';
    parent.appendChild(this.el);
  }

  /** 追加で表示する行（猫の状態など） */
  setExtra(text: string): void {
    this.extra = text;
  }

  /** renderer.render() の直後に呼ぶ（info はその描画分の値を持っている） */
  update(dt: number, renderer: THREE.WebGLRenderer): void {
    this.frames++;
    this.elapsed += dt;
    this.worstMs = Math.max(this.worstMs, dt * 1000);
    if (this.elapsed < 0.5) return;

    this.fps = this.frames / this.elapsed;
    const info = renderer.info;
    const mem = (performance as Performance & { memory?: PerformanceMemory }).memory;
    const heap = mem ? `${(mem.usedJSHeapSize / 1048576).toFixed(0)} / ${(mem.jsHeapSizeLimit / 1048576).toFixed(0)} MB` : '—';
    const px = renderer.getPixelRatio();

    this.el.textContent = [
      `FPS ${this.fps.toFixed(0)}（最悪 ${this.worstMs.toFixed(1)}ms）`,
      `描画 ${info.render.calls} 回 / 三角形 ${info.render.triangles.toLocaleString()}`,
      `ジオメトリ ${info.memory.geometries} / テクスチャ ${info.memory.textures}`,
      `JSヒープ ${heap} / 解像度倍率 ${px.toFixed(2)}`,
      this.extra,
    ].filter(Boolean).join('\n');

    this.frames = 0;
    this.elapsed = 0;
    this.worstMs = 0;
  }
}

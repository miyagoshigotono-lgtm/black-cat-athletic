import * as THREE from 'three';

/** 爪痕が消えるまでの時間 [s]（最後の1秒でフェードアウト） */
const LIFETIME = 4;
/** 同時に出せる爪痕の数（古いものから使い回す） */
const POOL_SIZE = 12;
/** 爪痕の大きさ [m] */
const SIZE = 0.09;

/**
 * 爪痕（SPEC 6.2：爪を出したときの反応）。
 * 当たった面に3本線の模様を貼り、しばらくすると消える。対象かどうかに関係なく同じものを出す。
 */
export class ScratchMarks {
  private readonly marks: Array<{ mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; age: number }> = [];
  private next = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const texture = createScratchTexture();
    const geometry = new THREE.PlaneGeometry(SIZE, SIZE);
    for (let i = 0; i < POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        // 面と同じ位置に描くとちらつくので、手前へずらして描く
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      this.marks.push({ mesh, material, age: LIFETIME });
    }
  }

  /** 点 point の、法線 normal を向いた面に爪痕を付ける */
  add(point: THREE.Vector3, normal: THREE.Vector3): void {
    const m = this.marks[this.next];
    this.next = (this.next + 1) % POOL_SIZE;
    m.mesh.position.copy(point).addScaledVector(normal, 0.002);
    m.mesh.lookAt(this.tmp.copy(m.mesh.position).add(normal));
    // 毎回少し傾けて、同じ模様が並んで見えないようにする
    m.mesh.rotateZ((Math.random() - 0.5) * 0.6);
    m.mesh.visible = true;
    m.material.opacity = 1;
    m.age = 0;
  }

  update(dt: number): void {
    for (const m of this.marks) {
      if (!m.mesh.visible) continue;
      m.age += dt;
      m.material.opacity = Math.min(1, LIFETIME - m.age);
      if (m.age >= LIFETIME) m.mesh.visible = false;
    }
  }
}

/** 斜めの3本線を描いたテクスチャ */
function createScratchTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.strokeStyle = 'rgba(30, 20, 15, 0.85)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      const x = 16 + i * 14;
      ctx.beginPath();
      ctx.moveTo(x - 6, 10);
      ctx.lineTo(x + 6, 54);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

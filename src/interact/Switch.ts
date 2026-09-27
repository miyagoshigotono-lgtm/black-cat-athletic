import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Interactable, ClawHit } from './Interactable';
import type { CatController } from '../player/CatController';
import type { Physics } from '../core/Physics';
import type { SwitchDef } from '../stages/stageTypes';
import { Conveyor } from './Conveyor';

/** レバーの色（止まっている／動いている） */
const COLOR_OFF = 0xb04a3a;
const COLOR_ON = 0x4aa85a;

/**
 * スイッチ（SPEC 6.1 の環境操作系）。
 * 爪を当てるたびに、つながっている物（コンベアなど）が動く／止まる。可逆。
 * 盤の板とレバーで出来ていて、レバーの色と傾きで今の状態が分かる。
 */
export class Switch implements Interactable {
  readonly kind = 'switch';
  readonly mode = 'instant' as const;
  readonly name: string;
  readonly colliders: readonly RAPIER.Collider[];

  private on: boolean;
  private readonly targetNames: readonly string[];
  private targets: Conveyor[] = [];
  private readonly lever: THREE.Mesh;
  private readonly leverMaterial: THREE.MeshLambertMaterial;

  constructor(def: SwitchDef, physics: Physics, scene: THREE.Scene) {
    this.name = def.name;
    this.on = def.on ?? false;
    this.targetNames = def.targets;

    const collider = physics.addStaticBox(
      { x: def.x, y: def.y, z: def.z },
      { x: def.w / 2, y: def.height / 2, z: def.d / 2 },
    );
    this.colliders = [collider];

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(def.w, def.height, def.d),
      new THREE.MeshLambertMaterial({ color: 0x565d66 }),
    );
    panel.position.set(def.x, def.y, def.z);
    scene.add(panel);

    // レバー（見た目だけ）。盤の手前に出す
    this.leverMaterial = new THREE.MeshLambertMaterial({ color: this.on ? COLOR_ON : COLOR_OFF });
    const thin = Math.min(def.w, def.d);
    this.lever = new THREE.Mesh(new THREE.BoxGeometry(thin * 0.5, def.height * 0.7, thin * 0.5), this.leverMaterial);
    this.lever.position.set(def.x, def.y, def.z);
    // 盤の薄い向き（壁から出ている向き）へ少しずらす
    if (def.d <= def.w) this.lever.position.z += def.d * 0.8;
    else this.lever.position.x += def.w * 0.8;
    this.lever.rotation.x = this.on ? -0.4 : 0.4;
    scene.add(this.lever);
  }

  /** 名前でつながっている物を解決する（すべての対象を作った後に呼ばれる） */
  link(find: (name: string) => Interactable | undefined): void {
    this.targets = this.targetNames
      .map((n) => find(n))
      .filter((o): o is Conveyor => o instanceof Conveyor);
  }

  onClaw(_hit: ClawHit, _cat: CatController): boolean {
    this.on = !this.on;
    this.leverMaterial.color.setHex(this.on ? COLOR_ON : COLOR_OFF);
    this.lever.rotation.x = this.on ? -0.4 : 0.4;
    for (const t of this.targets) {
      // つながっている物の状態を、スイッチに合わせる
      if (t.isRunning !== this.on) t.toggle();
    }
    return false;
  }
}

/*
[INPUT]: 真实水晶中袋补缝网格与当前六袋/上下椭圆剖面
[OUTPUT]: 150/153mm口袋后壁闭合、整个袋腔投影不被旧补缝截断
[POS]: 对Scene3D真实消费的结构做独立射线回归，不使用角色元数据代替几何
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { POCKETS, pocketLocalToWorld } from '../physics';
import { createCrystalStructure } from '../scene/crystal-style';
import { pocketRenderProfile, pocketWellCrossSectionAtY } from './profile';
import { pocketSeamContract } from './seam-contract';
import { tableFrameEnvelope } from './frame-geometry';

describe('enlarged middle-pocket seam closure', () => {
  it('closes both rear seams while leaving every well cross-section open', () => {
    const root = createCrystalStructure();
    root.updateMatrixWorld(true);
    const caps = root.getObjectByName('crystal-middle-pocket-seam-caps') as THREE.Mesh;
    const envelope = tableFrameEnvelope(POCKETS.map(p => pocketSeamContract(p, pocketRenderProfile(p))));
    const ray = new THREE.Raycaster();
    for (const pocket of POCKETS.filter(p => p.kind === 'side')) {
      const profile = pocketRenderProfile(pocket);
      const side = pocket.outward.x;
      ray.set(new THREE.Vector3(side * (envelope.halfWidth + .1), -.037, 0), new THREE.Vector3(-side, 0, 0));
      expect(ray.intersectObject(caps).length).toBeGreaterThan(0);
      for (let row = 0; row <= 10; row++) {
        const y = THREE.MathUtils.lerp(profile.wellTopY, profile.wellBottomY, row / 10);
        const section = pocketWellCrossSectionAtY(profile, y);
        for (const radius of [0, .5, .98, 1]) for (let step = 0; step < 36; step++) {
          const a = step / 36 * Math.PI * 2;
          const p = pocketLocalToWorld(pocket, section.centerDepth + Math.cos(a) * section.depthRadius * radius,
            Math.sin(a) * section.lateralRadius * radius);
          ray.set(new THREE.Vector3(p.x, .05, p.z), new THREE.Vector3(0, -1, 0));
          expect(ray.intersectObject(caps), `p${pocket.index} row${row} radius${radius} angle${step}`).toHaveLength(0);
        }
      }
    }
    root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
  });
});

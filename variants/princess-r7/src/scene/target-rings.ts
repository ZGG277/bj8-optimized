import * as THREE from 'three';
import type { BilliardsWorld } from '../physics';
/** Same legal-target markers, rendered in one front-facing batch above the cloth. */
export function createTargetRingBatch(radius: number) {
  const geometry = new THREE.RingGeometry(radius * 1.12, radius * 1.4, 28);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x9fe8c0, transparent: true, opacity: .55, side: THREE.FrontSide, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geometry, material, 16);
  mesh.name = 'legal-target-ring-batch'; mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const matrix = new THREE.Matrix4();
  return {
    mesh,
    sync(world: BilliardsWorld, targets: Set<number>, aiming: boolean, planActive: boolean) {
      let count = 0;
      if (aiming && !world.moving && !planActive) {
        for (const ball of world.balls) {
          if (!ball.active || !targets.has(ball.number)) continue;
          mesh.setMatrixAt(count++, matrix.makeTranslation(ball.x, .0025, ball.z));
        }
      }
      mesh.count = count; mesh.visible = count > 0; mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

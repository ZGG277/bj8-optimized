import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createTableDetails } from './table-details';
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('./glb-loader', () => ({ loadGlb: load }));
it('远景隐藏针脚、近景恢复，包边始终保留', async () => {
  const asset = new THREE.Group(); asset.name = 'BJ8_PocketCraft';
  for (const name of ['BJ8_Stitching', 'BJ8_EdgeBinding']) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    mesh.name = name; asset.add(mesh);
  }
  load.mockResolvedValue({ scene: asset });
  const details = createTableDetails(() => {});
  expect(await details.ready).toBe(true);
  const lod = details.root.getObjectByName('pocket-stitching-lod') as THREE.LOD;
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 5, 0); camera.updateMatrixWorld(); lod.update(camera);
  expect(asset.getObjectByName('BJ8_Stitching')!.visible).toBe(false);
  expect(asset.getObjectByName('BJ8_EdgeBinding')!.visible).toBe(true);
  camera.position.set(0, 1, 0); camera.updateMatrixWorld(); lod.update(camera);
  expect(asset.getObjectByName('BJ8_Stitching')!.visible).toBe(true);
  details.dispose();
});

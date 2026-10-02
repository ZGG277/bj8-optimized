/*
[INPUT]: Blender 双道针脚/细包边 GLB 与按需重绘回调
[OUTPUT]: 可异步装卸、远景隐藏亚像素针脚的袋口细节；加载失败保留既有完整皮壳与袋腔
[POS]: 台内模型的装配边界；无物理写操作、无独立动画时钟
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';
import detailUrl from './assets/table-craft-v2.glb?url';
import { loadGlb } from './glb-loader';

export type TableDetails = { root: THREE.Group; ready: Promise<boolean>; dispose: () => void };

// 本资产经字节门禁保证不含纹理；已挂载资源由 Scene3D 统一去重释放。
function disposeDetached(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

export function createTableDetails(onReady: () => void): TableDetails {
  const root = new THREE.Group();
  root.name = 'table-details';
  root.userData.assetState = 'loading';
  let disposed = false;
  const ready = loadGlb(detailUrl).then(({ scene: asset }) => {
    if (disposed) { disposeDetached(asset); return false; }
    if (!asset.getObjectByName('BJ8_PocketCraft') || !asset.getObjectByName('BJ8_Stitching')
      || !asset.getObjectByName('BJ8_EdgeBinding')) {
      disposeDetached(asset);
      throw new Error('Incomplete table detail asset');
    }
    asset.name = 'blender-table-craft-v2';
    asset.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.receiveShadow = true;
      // 亚毫米针脚无需额外投影；细节本身保留真实法线高光。
      object.castShadow = false;
    });
    // 针脚在远处已小于一个像素：保留原始网格供近景，远景省去 16,640 个三角形。
    const stitching = asset.getObjectByName('BJ8_Stitching')!;
    const parent = stitching.parent!;
    const lod = new THREE.LOD();
    lod.name = 'pocket-stitching-lod';
    parent.add(lod);
    lod.addLevel(stitching, 0);
    lod.addLevel(new THREE.Group(), 2.5, 0.15);
    root.add(asset);
    root.userData.assetState = 'ready';
    onReady();
    return true;
  }).catch(error => {
    if (!disposed) {
      root.userData.assetState = 'fallback';
      console.warn('袋口细节加载失败，保留完整基础球桌。', error);
      onReady();
    }
    return false;
  });
  return { root, ready, dispose() { disposed = true; root.userData.assetState = 'disposed'; } };
}

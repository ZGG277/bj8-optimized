/**
 * [INPUT]: 单次AutoDL混元候选的本地减面GLB、独立城堡壳体与按需重绘回调。
 * [OUTPUT]: 球桌后方的罗马柱拱门/花台实验；失败保留原平台，晚到资产和纹理独占释放。
 * [POS]: 仅外围视觉，不改球、桌体、相机或碰撞；hunyuan=0可回看原外围。
 * [PROTOCOL]: 变更时检查 scene/CLAUDE.md
 */
import * as THREE from 'three';
import { loadGlb } from './glb-loader';
import { ownedWorldShell, type WorldShell, type WorldShellContext } from './world-shell';
import { createCastlePlatform } from './castle-platform';
import archUrl from './assets/daylight/hunyuan-arch-mobile.glb?url';

function ownModel(root: THREE.Group) {
  const textures = new Set<THREE.Texture>();
  root.traverse(object => {
    object.raycast = () => {};
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = true;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  const owned = ownedWorldShell(root, [...textures]);
  return { ...owned, dispose() {
    for (const texture of textures) {
      if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) texture.image.close();
    }
    owned.dispose();
  } };
}

export function createHunyuanTerrace(context: WorldShellContext): WorldShell {
  const base = createCastlePlatform();
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('hunyuan') === '0') return base;
  let disposed = false;
  let hot = false;
  let model: WorldShell | undefined;
  base.root.userData.hunyuanAsset = 'loading';
  const ready = loadGlb(archUrl).then(gltf => {
    const owned = ownModel(gltf.scene);
    if (disposed) { owned.dispose(); return true; }
    model = owned;
    model.root.name = 'hunyuan-roman-archway';
    model.root.visible = !hot;
    model.root.scale.setScalar(.72);
    model.root.position.set(0, -.69, -4.0);
    base.root.add(model.root);
    base.root.userData.hunyuanAsset = 'ready';
    context.requestRender();
    return true;
  }).catch(error => {
    if (!disposed) {
      base.root.userData.hunyuanAsset = 'fallback';
      base.root.userData.hunyuanError = String(error);
      context.requestRender();
    }
    // The complete original platform stays playable when the experimental asset fails.
    return true;
  });
  return { root: base.root, ready, setHot(value) {
    hot = value;
    if (model) model.root.visible = !hot;
  }, dispose() {
    if (disposed) return;
    disposed = true;
    model?.dispose();
    base.dispose();
  } };
}

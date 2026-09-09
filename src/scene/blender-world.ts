/*
[INPUT]: 本地 Blender GLB、独立外围与临时暗静区
[OUTPUT]: 按命名根装配真实环境/地面，资源失败回退及异步安全释放
[POS]: 纯视觉资产适配层，不改桌体、灯光、相机、物理或时钟
*/
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { WorldShell } from './world-shell';

export type BlenderWorldAsset = Readonly<{ url: string; shellName: string; quietName: string }>;

function release(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const texture of textures) {
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) texture.image.close();
    texture.dispose();
  }
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
  root.clear();
}

/** GLB 两个根共享材质/贴图时仍由同一所有者回收，避免只关外围损坏地板。 */
export function attachBlenderWorld(shell: WorldShell, quiet: THREE.Group, asset: BlenderWorldAsset, requestRender: () => void): WorldShell {
  let disposed = false;
  let model: THREE.Group | undefined;
  let worldRoot: THREE.Object3D | undefined;
  let quietRoot: THREE.Object3D | undefined;
  shell.root.userData.blenderAsset = 'loading';
  const loaded = new GLTFLoader().loadAsync(asset.url).then(gltf => {
    if (disposed) { release(gltf.scene); return false; }
    const world = gltf.scene.getObjectByName(asset.shellName);
    const floor = gltf.scene.getObjectByName(asset.quietName);
    if (!world || !floor) {
      release(gltf.scene);
      throw new Error('Blender world is missing its named environment or quiet-zone root');
    }
    model = gltf.scene;
    worldRoot = world;
    quietRoot = floor;
    model.traverse(object => {
      object.raycast = () => {};
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.fog = false;
        const bamboo = asset.shellName.endsWith('Bamboo');
        const aurora = asset.shellName.endsWith('Aurora');
        if ((bamboo || aurora) && material instanceof THREE.MeshStandardMaterial && !material.transparent) {
          const hazeColor = new THREE.Color(bamboo ? 0x536368 : 0x192837);
          material.onBeforeCompile = shader => {
            shader.uniforms.worldHazeColor = { value: hazeColor };
            shader.vertexShader = `varying float worldHazeDepth;\n${shader.vertexShader}`
              .replace('#include <begin_vertex>', '#include <begin_vertex>\nworldHazeDepth = length((modelViewMatrix * vec4(transformed, 1.0)).xyz);');
            shader.fragmentShader = `varying float worldHazeDepth; uniform vec3 worldHazeColor;\n${shader.fragmentShader}`
              .replace('#include <opaque_fragment>', `outgoingLight = mix(outgoingLight, worldHazeColor, smoothstep(${bamboo ? '6.0, 28.0' : '14.0, 42.0'}, worldHazeDepth) * .96);\n#include <opaque_fragment>`);
          };
          material.customProgramCacheKey = () => 'blender-world-haze-' + asset.shellName;
        }
      }
    });
    floor.traverse(object => { if (object instanceof THREE.Mesh) object.receiveShadow = true; });
    model.updateMatrixWorld(true);
    shell.root.attach(world);
    // Only discard this factory's temporary floor, never the inherited game table.
    const fallback = new THREE.Group();
    for (const child of [...quiet.children]) fallback.add(child);
    release(fallback);
    quiet.attach(floor);
    floor.name = 'quiet-platform';
    quiet.userData.blenderAsset = asset.quietName;
    shell.root.userData.blenderAsset = 'ready';
    requestRender();
    return true;
  }).catch(error => {
    if (!disposed) {
      shell.root.userData.blenderAsset = 'fallback';
      shell.root.userData.blenderError = String(error);
      console.warn('Blender 环境加载失败，保留基础地面。', asset.shellName, error);
      requestRender();
    }
    return false;
  });
  return {
    root: shell.root,
    ready: Promise.all([shell.ready, loaded]).then(values => values.every(Boolean)),
    dispose() {
      if (disposed) return;
      disposed = true;
      if (model) {
        if (worldRoot) model.add(worldRoot);
        if (quietRoot) model.add(quietRoot);
        release(model);
      }
      shell.dispose();
    },
  };
}

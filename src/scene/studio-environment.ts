/*
[INPUT]: Blender 自包含 GLB、既有木纹纹理、Three.js renderer 与阴影预算
[OUTPUT]: 独立球房/桌体外壳、摄影灯光、异步加载/回退及相机高度可见性接口
[POS]: 纯视觉资产适配层；不读取或写入物理世界，不持有动画时钟
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import roomAssetUrl from './assets/billiards-room-v1.glb?url';

export type StudioEnvironment = {
  root: THREE.Group;
  ready: Promise<boolean>;
  setCameraHeight: (height: number) => void;
  dispose: () => void;
};

/** 灯光与环境纹理由 Scene3D 的统一资源清理回收。仅主光投射实时阴影。 */
export function setupStudioLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer, shadowSize: number) {
  scene.background = new THREE.Color(0x111a18);
  scene.fog = new THREE.Fog(0x111a18, 6, 15);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const reflectionRoom = new RoomEnvironment();
  scene.environment = pmrem.fromScene(reflectionRoom, .04).texture;
  scene.environmentIntensity = .38;
  reflectionRoom.dispose();
  pmrem.dispose();

  RectAreaLightUniformsLib.init();
  scene.add(new THREE.AmbientLight(0xe2ece5, .12));
  const key = new THREE.DirectionalLight(0xfff5e8, 2.0);
  key.position.set(.45, 3.2, .3);
  key.castShadow = true;
  key.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(key.shadow.camera, { near: .5, far: 7, left: -1.8, right: 1.8, top: 2.8, bottom: -2.8 });
  key.shadow.bias = -.00025;
  key.shadow.normalBias = .001;
  key.shadow.radius = 3;
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key);
  const softbox = new THREE.RectAreaLight(0xffeed8, 1.45, .9, 1.9);
  softbox.position.set(0, 1.85, 0);
  softbox.lookAt(0, 0, 0);
  scene.add(softbox);
  const fill = new THREE.HemisphereLight(0xd7e7e2, 0x393127, .38);
  scene.add(fill);
  return key;
}

/** 只用于加载晚于卸载时的孤立 GLB；成功装配资源归 Scene3D 统一释放。 */
function disposeUnattached(root: THREE.Object3D) {
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
}

export function createStudioEnvironment(woodTexture: THREE.Texture, onReady: () => void): StudioEnvironment {
  const root = new THREE.Group();
  root.name = 'studio-environment';
  root.userData.assetState = 'loading';
  const fallback = new THREE.Group();
  fallback.name = 'studio-fallback';
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24),
    new THREE.MeshStandardMaterial({ color: 0x282d28, roughness: .92 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.82;
  floor.receiveShadow = true;
  fallback.add(floor);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, .15, 2.68),
    new THREE.MeshStandardMaterial({ color: 0x30251c, roughness: .5 }));
  base.position.y = -.285;
  base.castShadow = base.receiveShadow = true;
  fallback.add(base);
  root.add(fallback);

  let disposed = false;
  let cameraHeight = 0;
  let pendant: THREE.Object3D | undefined;
  const ready = new GLTFLoader().loadAsync(roomAssetUrl).then(gltf => {
    if (disposed) {
      disposeUnattached(gltf.scene);
      return false;
    }
    const model = gltf.scene;
    model.name = 'blender-room-v1';
    const tableShell = model.getObjectByName('BJ8_TableShell');
    const room = model.getObjectByName('BJ8_Room');
    pendant = model.getObjectByName('BJ8_Pendant');
    if (!tableShell || !room || !pendant) {
      disposeUnattached(model);
      throw new Error('Blender asset is missing its table, room or pendant group');
    }
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.receiveShadow = true;
      object.castShadow = object.parent === tableShell;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        // GLB 保留制作时的石材本色；实时桌面主光下压低地面，保持球路的视觉优先级。
        if (material instanceof THREE.MeshStandardMaterial && material.name.includes('BJ8_Floor_')) {
          material.color.multiplyScalar(.24);
        }
        if (material instanceof THREE.MeshStandardMaterial && material.name.includes('BJ8_Walnut')) {
          material.map = woodTexture;
          material.needsUpdate = true;
        }
      }
    });
    pendant.visible = cameraHeight < 1.7;
    root.add(model);
    fallback.visible = false;
    root.userData.assetState = 'ready';
    onReady();
    return true;
  }).catch(error => {
    if (!disposed) {
      root.userData.assetState = 'fallback';
      root.userData.assetError = String(error);
      console.warn('球房资产加载失败，使用基础场景。', error);
      onReady();
    }
    return false;
  });
  return {
    root, ready,
    setCameraHeight(height) {
      cameraHeight = height;
      if (pendant) pendant.visible = height < 1.7;
    },
    dispose() {
      disposed = true;
      root.userData.assetState = 'disposed';
    },
  };
}

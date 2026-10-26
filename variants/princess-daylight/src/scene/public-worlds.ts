/* 当前公开场景的唯一注册表；小工具只打包这些实际入口可达的资源。 */
import { createCastlePlatform } from './castle-platform';
import * as THREE from 'three';
import { createCloudSeaShell } from './cloud-sea';
import { createLake360 } from './lake360';
import { createQuietZone, createStudioWorldShell } from './world-shell';
export const PUBLIC_WORLD_VISUALS = {
  studio: { shell: createStudioWorldShell, quietZone: () => new THREE.Group() },
  'cloud-sea': { shell: createCloudSeaShell, quietZone: createQuietZone },
  castle: { shell: createCastlePlatform, quietZone: () => new THREE.Group() },
  lake: { shell: createLake360, quietZone: () => new THREE.Group() },
};
// 小工具构建替换 world-registry 时保持消费合同。
export { PUBLIC_WORLD_VISUALS as WORLD_VISUALS };

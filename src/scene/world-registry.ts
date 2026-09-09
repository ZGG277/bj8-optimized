/*
[INPUT]: 局前 WorldId 与只读 WorldShellContext
[OUTPUT]: 配对的外围壳体和场景专属暗静区工厂
[POS]: 纯视觉注册表，不修改灯光、相机或游戏状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';
import type { WorldId } from '../world-selection';
import { createCloudSeaShell } from './cloud-sea';
import { createGalaxyQuietZone } from './galaxy';
import { createLake360 } from './lake360';
import { createGalaxyAtmosphere, createBambooAtmosphere, createAuroraAtmosphere } from './world-atmospheres';
import type { BlenderWorldAsset } from './blender-world';
import galaxyAsset from './assets/world-galaxy.glb?url';
import bambooAsset from './assets/world-bamboo.glb?url';
import auroraAsset from './assets/world-aurora-lake.glb?url';
import { createQuietZone, createStudioWorldShell, type WorldShellFactory } from './world-shell';

type WorldVisual = Readonly<{
  shell: WorldShellFactory;
  quietZone: () => THREE.Group;
  asset?: BlenderWorldAsset;
}>;

/** 每个外围与自己的地面成对选择；云海已认可的实现保持原样。 */
export const WORLD_VISUALS: Record<WorldId, WorldVisual> = {
  studio: { shell: createStudioWorldShell, quietZone: () => new THREE.Group() },
  'cloud-sea': { shell: createCloudSeaShell, quietZone: createQuietZone },
  lake: { shell: createLake360, quietZone: () => new THREE.Group() },
  galaxy: { shell: createGalaxyAtmosphere, quietZone: createGalaxyQuietZone,
    asset: { url: galaxyAsset, shellName: 'BJ8_World_Galaxy', quietName: 'BJ8_Quiet_Galaxy' } },
  bamboo: { shell: createBambooAtmosphere, quietZone: () => createQuietZone(),
    asset: { url: bambooAsset, shellName: 'BJ8_World_Bamboo', quietName: 'BJ8_Quiet_Bamboo' } },
  'aurora-lake': { shell: createAuroraAtmosphere, quietZone: () => createQuietZone(),
    asset: { url: auroraAsset, shellName: 'BJ8_World_Aurora', quietName: 'BJ8_Quiet_Aurora' } },
};

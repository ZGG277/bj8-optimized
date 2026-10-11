import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { WORLD_OPTIONS } from '../world-selection';
import { WORLD_VISUALS } from './world-registry';
import { QUIET_ZONE_LAYOUT } from './world-shell';

describe('场景注册合同', () => {
  it('所有公开局前选项都有配对的外围和地面', () => {
    for (const { id } of WORLD_OPTIONS) expect(WORLD_VISUALS[id]).toBeTruthy();
    expect(new Set(WORLD_OPTIONS.map(world => WORLD_VISUALS[world.id].quietZone)).size)
      .toBe(WORLD_OPTIONS.length);
  });

  it.each(['galaxy', 'bamboo', 'aurora-lake'] as const)('%s 的隐藏资产仍可由 Three 标准流程展开', worldId => {
    const shell = WORLD_VISUALS[worldId].shell({ layout: QUIET_ZONE_LAYOUT, requestRender: vi.fn() });
    const quiet = WORLD_VISUALS[worldId].quietZone();
    for (const root of [shell.root, quiet]) root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof THREE.ShaderMaterial)) continue;
        for (const source of [material.vertexShader, material.fragmentShader]) {
          for (const line of source.split('\n').filter(line => line.includes('#include'))) {
            expect(line.trim(), `${worldId}/${material.name} 的 include 必须独立成行`)
              .toMatch(/^#include <[\w]+>$/);
          }
        }
      }
    });
    shell.dispose();
  });
});

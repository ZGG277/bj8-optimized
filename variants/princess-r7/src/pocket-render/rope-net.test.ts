/*
[INPUT]: 低面数绳索段
[OUTPUT]: 验证合并实体绳网的有限顶点/索引结构
[POS]: rope-net 纯结构回归；不影响袋口物理
[PROTOCOL]: 变更时更新此头部，然后检查 ../CLAUDE.md
*/
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createMergedRopeGeometry } from './rope-net';

describe('merged rope net geometry', () => {
  it('merges rope segments into one finite low-poly mesh geometry', () => {
    const geometry = createMergedRopeGeometry([
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.1, 0.04)],
      [new THREE.Vector3(0.02, 0, 0), new THREE.Vector3(-0.02, -0.1, 0.04)],
    ]);
    expect(geometry.getAttribute('position').count).toBe(16);
    expect(geometry.index?.count).toBe(48);
    expect(geometry.boundingSphere?.radius).toBeGreaterThan(0);
    expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    geometry.dispose();
  });
});

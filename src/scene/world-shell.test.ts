import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createCloudSeaShell } from './cloud-sea';
import { cloudNoise, createCloudNoiseData } from './cloud-density';
import { createEmptyWorldShell, createQuietZone, QUIET_ZONE_LAYOUT } from './world-shell';

const makeShell = () => createCloudSeaShell({ layout: QUIET_ZONE_LAYOUT, requestRender: vi.fn() });

describe('连续体积云与场景化静区', () => {
  it('三维噪声无周期接缝，固定种子可复现且覆盖疏密两端', () => {
    for (const p of [[.12, 2.8, 7.99], [-3.4, 2.1, .42], [7.99999, -.5, 4.2]]) {
      const [x, y, z] = p;
      expect(cloudNoise(x, y, z)).toBeCloseTo(cloudNoise(x + 8, y - 8, z + 16), 10);
    }
    expect(cloudNoise(-.00001, 1.7, 2.3)).toBeCloseTo(cloudNoise(.00001, 1.7, 2.3), 6);
    const a = createCloudNoiseData(16), b = createCloudNoiseData(16);
    expect(a).toEqual(b);
    expect(Math.min(...a)).toBeLessThan(60);
    expect(Math.max(...a)).toBeGreaterThan(190);
  });

  it('云海只占一个不透明批次、256 KiB 体积数据，无灯光、阴影或动画', () => {
    const shell = makeShell();
    let triangles = 0, draws = 0;
    shell.root.traverse(object => {
      expect(object).not.toBeInstanceOf(THREE.Light);
      if (!(object instanceof THREE.Mesh)) return;
      draws++;
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
      expect(object.castShadow || object.receiveShadow).toBe(false);
      const material = object.material as THREE.ShaderMaterial;
      expect(material.transparent).toBe(false);
      expect(material.fog || material.depthWrite || material.lights).toBe(false);
      expect(material.uniforms.quietHalfSize.value.toArray()).toEqual([3, 4]);
      const texture = material.uniforms.cloudNoiseMap.value as THREE.Data3DTexture;
      expect(texture.image.data?.byteLength).toBe(64 ** 3);
      expect(texture.wrapR).toBe(THREE.RepeatWrapping);
    });
    expect(draws).toBe(1);
    expect(triangles).toBeLessThan(30000);
    expect(shell.root.userData.volume.animated).toBe(false);
    shell.dispose();
  });

  it('云体纹理、几何、材质恰好释放一次，独立卸载不影响桌边静区', () => {
    const shell = makeShell(), quiet = createQuietZone();
    const scene = new THREE.Scene(); scene.add(quiet, shell.root);
    const mesh = shell.root.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    const geometryDisposed = vi.fn(), materialDisposed = vi.fn(), textureDisposed = vi.fn(), quietDisposed = vi.fn();
    mesh.geometry.addEventListener('dispose', geometryDisposed);
    mesh.material.addEventListener('dispose', materialDisposed);
    mesh.material.uniforms.cloudNoiseMap.value.addEventListener('dispose', textureDisposed);
    (quiet.children[0] as THREE.Mesh).geometry.addEventListener('dispose', quietDisposed);
    shell.dispose(); shell.dispose();
    expect(geometryDisposed).toHaveBeenCalledTimes(1);
    expect(materialDisposed).toHaveBeenCalledTimes(1);
    expect(textureDisposed).toHaveBeenCalledTimes(1);
    expect(quietDisposed).not.toHaveBeenCalled();
    expect(scene.children).toEqual([quiet]);
    expect(shell.root.children).toHaveLength(0);
  });

  it('暗石静区不高于原地面，围桌区域平坦，缓坡网格朝上且无退化面', async () => {
    const quiet = createQuietZone(), empty = createEmptyWorldShell();
    const mesh = quiet.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const p = mesh.geometry.getAttribute('position'), index = mesh.geometry.index!;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      expect(p.getY(i)).toBeLessThanOrEqual(-.81999);
      if (Math.hypot(p.getX(i), p.getZ(i)) < 2.5) expect(p.getY(i)).toBeCloseTo(-.82);
    }
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(p, index.getX(i)); b.fromBufferAttribute(p, index.getX(i + 1)); c.fromBufferAttribute(p, index.getX(i + 2));
      const normal = b.sub(a).cross(c.sub(a));
      expect(normal.lengthSq()).toBeGreaterThan(1e-12);
      expect(normal.y).toBeGreaterThan(0);
    }
    expect(mesh.material.roughness).toBeGreaterThan(.95);
    expect(mesh.material.metalness).toBe(0);
    expect(mesh.material.color.getHex()).toBe(0x242d34);
    expect(await empty.ready).toBe(true);
    expect(empty.root.children).toHaveLength(0);
    empty.dispose();
  });
});

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createGalaxyQuietZone, createGalaxyShell } from './galaxy';
import { QUIET_ZONE_LAYOUT } from './world-shell';

const createShell = () => createGalaxyShell({ layout: QUIET_ZONE_LAYOUT, requestRender: vi.fn() });

describe('静态宇宙星系 World Shell', () => {
  it('固定种子精确复现星场，且不请求动画重绘', () => {
    const requestA = vi.fn();
    const requestB = vi.fn();
    const a = createGalaxyShell({ layout: QUIET_ZONE_LAYOUT, requestRender: requestA });
    const b = createGalaxyShell({ layout: QUIET_ZONE_LAYOUT, requestRender: requestB });
    const starsA = a.root.getObjectByName('galaxy-fine-stars') as THREE.InstancedMesh;
    const starsB = b.root.getObjectByName('galaxy-fine-stars') as THREE.InstancedMesh;
    expect(Array.from(starsA.instanceMatrix.array)).toEqual(Array.from(starsB.instanceMatrix.array));
    expect(Array.from(starsA.instanceColor!.array)).toEqual(Array.from(starsB.instanceColor!.array));
    expect(starsA.userData).toMatchObject({ seed: 0x6a09e667, starCount: 320, animated: false });
    expect(a.root.userData.galaxy.animated).toBe(false);
    expect(requestA).not.toHaveBeenCalled();
    expect(requestB).not.toHaveBeenCalled();
    a.dispose();
    b.dispose();
  });

  it('远壳只用三个 Mesh 批次，低于三角形预算且不含灯光、雾或交互', () => {
    const shell = createShell();
    let drawCalls = 0;
    let triangles = 0;
    shell.root.traverse(object => {
      expect(object).not.toBeInstanceOf(THREE.Light);
      expect(object).not.toBeInstanceOf(THREE.Points);
      expect(object).not.toBeInstanceOf(THREE.Line);
      if (!(object instanceof THREE.Mesh)) return;
      drawCalls++;
      const baseTriangles = (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
      triangles += baseTriangles * (object instanceof THREE.InstancedMesh ? object.count : 1);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) expect(material.fog).toBe(false);
      const hits: THREE.Intersection[] = [];
      object.raycast(new THREE.Raycaster(), hits);
      expect(hits).toHaveLength(0);
    });
    expect(shell.root.name).toBe('world-shell-galaxy');
    expect(drawCalls).toBeLessThanOrEqual(12);
    expect(drawCalls).toBe(3);
    expect(triangles).toBeLessThan(30000);
    expect(shell.root.userData.galaxy).toMatchObject({ starCount: 320, drawCalls: 3, animated: false });
    shell.dispose();
  });

  it('独立暗矿石静区守住 6x8 米标识和 floorY，外缘自然下沉并渐隐', () => {
    const quiet = createGalaxyQuietZone();
    const platform = quiet.getObjectByName('quiet-platform') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const apron = quiet.getObjectByName('galaxy-mist-apron') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    const platformPositions = platform.geometry.getAttribute('position');
    const apronPositions = apron.geometry.getAttribute('position');
    const box = new THREE.Box3().setFromBufferAttribute(platformPositions as THREE.BufferAttribute);
    let apronLowest = Infinity;
    for (let i = 0; i < apronPositions.count; i++) apronLowest = Math.min(apronLowest, apronPositions.getY(i));

    expect(quiet.name).toBe('quiet-zone');
    expect(platform.userData.coreLayout).toBe(QUIET_ZONE_LAYOUT);
    expect(platform.receiveShadow).toBe(true);
    expect(platform.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(platform.material.color.getHex()).toBe(0x11131c);
    expect(platform.material.roughness).toBeGreaterThanOrEqual(.85);
    expect(platform.material.metalness).toBeLessThan(.12);
    expect(box.max.x - box.min.x).toBeCloseTo(QUIET_ZONE_LAYOUT.width, 5);
    expect(box.max.z - box.min.z).toBeCloseTo(QUIET_ZONE_LAYOUT.length, 5);
    expect(box.max.y).toBeCloseTo(QUIET_ZONE_LAYOUT.floorY, 5);
    expect(apronLowest).toBeLessThan(QUIET_ZONE_LAYOUT.floorY - .7);
    expect(apron.material.transparent).toBe(true);
    expect(apron.material.depthWrite).toBe(false);
    expect(quiet.userData.animated).toBe(false);
  });

  it('外壳资源只释放一次，并不误回收独立静区', () => {
    const shell = createShell();
    const quiet = createGalaxyQuietZone();
    const scene = new THREE.Scene();
    scene.add(quiet, shell.root);
    const instanceDisposed = vi.fn();
    (shell.root.getObjectByName('galaxy-fine-stars') as THREE.InstancedMesh).addEventListener('dispose', instanceDisposed);
    const geometryEvents: ReturnType<typeof vi.fn>[] = [];
    const materialEvents: ReturnType<typeof vi.fn>[] = [];
    shell.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometryDisposed = vi.fn();
      object.geometry.addEventListener('dispose', geometryDisposed);
      geometryEvents.push(geometryDisposed);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        const materialDisposed = vi.fn();
        material.addEventListener('dispose', materialDisposed);
        materialEvents.push(materialDisposed);
      }
    });
    const quietGeometryDisposed = vi.fn();
    (quiet.getObjectByName('quiet-platform') as THREE.Mesh).geometry.addEventListener('dispose', quietGeometryDisposed);

    shell.dispose();
    shell.dispose();
    expect(instanceDisposed).toHaveBeenCalledTimes(1);
    for (const event of geometryEvents) expect(event).toHaveBeenCalledTimes(1);
    for (const event of materialEvents) expect(event).toHaveBeenCalledTimes(1);
    expect(quietGeometryDisposed).not.toHaveBeenCalled();
    expect(scene.children).toEqual([quiet]);
    expect(shell.root.children).toHaveLength(0);
    expect(shell.root.userData.assetState).toBe('disposed');
  });
});

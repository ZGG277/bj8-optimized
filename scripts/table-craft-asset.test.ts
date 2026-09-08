/*
[INPUT]: Blender 实际 GLB 字节、保存的作者合同与当前共享袋口几何
[OUTPUT]: 米制锚点、预算、非退化拓扑、针脚承托与当前合同一致性回归
[POS]: 离线资产与运行时几何之间的验收；失败时重做资产，禁止放宽进球边界
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TABLE, POCKETS, CUSHION_SEGMENTS } from '../src/physics';
import { pocketSeamContract } from '../src/pocket-render/seam-contract';
import { pocketRenderProfile } from '../src/pocket-render/profile';
import { createPocketTrimGeometry } from '../src/pocket-render/trim-geometry';
import { makeCushionGeometry } from '../src/pocket-render/cushion-geometry';
import { applyClothUV, applyLeatherUV } from '../src/scene/table-surfaces';

const source = readFileSync(new URL('../assets/blender/table-craft-v2/surface-contract.json', import.meta.url));
const bytes = readFileSync(new URL('../src/scene/assets/table-craft-v2.glb', import.meta.url));
let asset: THREE.Group;
const triangles: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3 }[] = [];
beforeAll(async () => {
  asset = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  asset.updateMatrixWorld(true);
  for (const pocket of POCKETS) {
    const geometry = createPocketTrimGeometry(pocketSeamContract(pocket, pocketRenderProfile(pocket)));
    const p = geometry.getAttribute('position'), index = geometry.getIndex()!;
    for (let i = 0; i < index.count; i += 3) {
      const [a, b, c] = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, index.getX(i + j)));
      if (b.clone().sub(a).cross(c.clone().sub(a)).normalize().y > .6) triangles.push({ a, b, c });
    }
    geometry.dispose();
  }
});

describe('Blender 六袋细节资产', () => {
  it('制作合同与当前六袋/球尺寸完全相同', () => {
    expect(source.toString()).toBe(JSON.stringify({ table: TABLE, pockets: POCKETS.map(p => ({ index: p.index,
      kind: p.kind, x: p.x, z: p.z, outward: p.outward, tangent: p.tangent,
      profile: pocketRenderProfile(p), seam: pocketSeamContract(p, pocketRenderProfile(p)) })) }, null, 2));
    expect(asset.getObjectByName('BJ8_PocketCraft')?.userData.surface_contract_sha256)
      .toBe(createHash('sha256').update(source).digest('hex'));
  });
  it('六袋锚点在游戏坐标系内逐毫米对齐，细节只占两个网格', () => {
    for (const p of POCKETS) {
      const point = asset.getObjectByName(`BJ8_PocketAnchor_${p.index}`)!.getWorldPosition(new THREE.Vector3());
      expect(point.distanceTo(new THREE.Vector3(p.x, 0, p.z))).toBeLessThan(1e-6);
    }
    let meshes = 0;
    asset.traverse(o => { if (o instanceof THREE.Mesh) meshes++; });
    expect(meshes).toBe(2);
    expect(bytes.length).toBeLessThan(1250 * 1024);
  });
  it('实际网格有有限法线、无退化面且不超过 3 万三角形，无纹理依赖', () => {
    let count = 0;
    asset.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const p = o.geometry.getAttribute('position'), n = o.geometry.getAttribute('normal'), ix = o.geometry.getIndex()!;
      expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
      expect(Array.from(n.array).every(Number.isFinite)).toBe(true);
      expect(Object.values(o.material).some(value => value instanceof THREE.Texture)).toBe(false);
      count += ix.count / 3;
      for (let i = 0; i < ix.count; i += 3) {
        const [a, b, c] = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, ix.getX(i + j)));
        expect(b.sub(a).cross(c.sub(a)).lengthSq()).toBeGreaterThan(1e-22);
      }
    });
    expect(count).toBeLessThanOrEqual(30000);
  });
  it('全部针脚/包边顶点由现有皮壳顶面承托，不伸进开放球路', () => {
    let maxGap = 0, checked = 0;
    const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    const hit = new THREE.Vector3(), point = new THREE.Vector3();
    asset.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        point.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        ray.origin.set(point.x, .1, point.z);
        let support: number | null = null;
        for (const t of triangles) {
          if (ray.intersectTriangle(t.a, t.b, t.c, false, hit)) { support = hit.y; break; }
        }
        expect(support, `悬空细节: ${point.toArray()}`).not.toBeNull();
        maxGap = Math.max(maxGap, Math.abs(point.y - support!));
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(10000);
    expect(maxGap).toBeLessThan(.001);
  });
});

it('台面、库边和皮裙有有限且有面积的 UV；设置 UV 不改变几何字节', () => {
  const cloth = new THREE.PlaneGeometry(TABLE.width, TABLE.length).rotateX(-Math.PI / 2);
  const original = Array.from(cloth.getAttribute('position').array);
  applyClothUV(cloth);
  expect(Array.from(cloth.getAttribute('position').array)).toEqual(original);
  expect(cloth.getAttribute('uv').getX(0)).toBeCloseTo(-TABLE.width / 2);
  for (const segment of CUSHION_SEGMENTS) {
    const g = makeCushionGeometry(segment);
    expect(g.getAttribute('uv').count).toBe(g.getAttribute('position').count);
    expect(Array.from(g.getAttribute('uv').array).every(Number.isFinite)).toBe(true);
    expect(g.getAttribute('uv').getX(1)).toBeGreaterThan(0);
    expect(g.getAttribute('uv').getY(4)).toBeGreaterThan(0);
    g.dispose();
  }
  const leather = createPocketTrimGeometry(pocketSeamContract(POCKETS[0], pocketRenderProfile(POCKETS[0])));
  const positions = Array.from(leather.getAttribute('position').array);
  applyLeatherUV(leather);
  expect(Array.from(leather.getAttribute('position').array)).toEqual(positions);
  expect(Array.from(leather.getAttribute('uv').array).every(Number.isFinite)).toBe(true);
  cloth.dispose(); leather.dispose();
});

it('相邻库边鼻尖与内凹面的同一剖面站点具有连续法线', () => {
  const stationNormals = new Map<string, THREE.Vector3>();
  let joined = 0;
  for (const segment of CUSHION_SEGMENTS) {
    const g = makeCushionGeometry(segment);
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 6; i < 16; i++) {
      const key = [p.getX(i), p.getY(i), p.getZ(i)].map(v => v.toFixed(6)).join(',');
      const normal = new THREE.Vector3().fromBufferAttribute(n, i);
      const other = stationNormals.get(key);
      if (other) { expect(other.distanceTo(normal)).toBeLessThan(1e-5); joined++; }
      else stationNormals.set(key, normal);
    }
    g.dispose();
  }
  expect(joined).toBeGreaterThan(600);
});

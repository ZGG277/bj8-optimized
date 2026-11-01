/*
[INPUT]: 历史 Blender GLB 字节与其原始作者合同；当前 V5 另有 daylight 资产
[OUTPUT]: 原作者合同的米制锚点、预算、拓扑与针脚承托；原资产不可误当 V5 皮壳
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
import { makeCushionGeometry, CUSHION_PROFILE } from '../src/pocket-render/cushion-geometry';
import { applyClothUV, applyLeatherUV } from '../src/scene/table-surfaces';

const source = readFileSync(new URL('../assets/blender/table-craft-v2/surface-contract.json', import.meta.url));
const authored = JSON.parse(source.toString()) as { table: typeof TABLE; pockets: Array<{ seam: Parameters<typeof createPocketTrimGeometry>[0] }> };
const bytes = readFileSync(new URL('../src/scene/assets/table-craft-v2.glb', import.meta.url));
let asset: THREE.Group;
const triangles: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3 }[] = [];
beforeAll(async () => {
  asset = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  asset.updateMatrixWorld(true);
  for (const pocket of authored.pockets) {
    const geometry = createPocketTrimGeometry(pocket.seam);
    const p = geometry.getAttribute('position'), index = geometry.getIndex()!;
    for (let i = 0; i < index.count; i += 3) {
      const [a, b, c] = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, index.getX(i + j)));
      if (b.clone().sub(a).cross(c.clone().sub(a)).normalize().y > .6) triangles.push({ a, b, c });
    }
    geometry.dispose();
  }
});

describe('Blender 六袋细节资产', () => {
  it('保留旧家具作者合同和原始哈希，不冒充 V5 物理合同', () => {
    expect(authored.table).toEqual({ width: TABLE.width, length: TABLE.length, ballRadius: .0451485 });
    expect(authored.pockets).toHaveLength(6);
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
  it('实际网格有有限法线、无退化面且不超过R1的27216三角形，无纹理依赖', () => {
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
    // The complete scene is close to its 100k mobile budget; larger pockets
    // must not spend extra triangles on submillimetre stitching.
    expect(count).toBeLessThanOrEqual(27216);
  });
  it('原资产针脚/包边顶点由对应作者皮壳承托', () => {
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
    // D2 uses continuous arc length: a connected run can legitimately end at U=0.
    expect(Math.abs(g.getAttribute('uv').getX(1) - g.getAttribute('uv').getX(0)))
      .toBeCloseTo(Math.hypot(segment.b.x-segment.a.x, segment.b.z-segment.a.z), 6);
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
  const stationNormals = new Map<string, { normal: THREE.Vector3; position: THREE.Vector3 }>();
  let joined = 0;
  for (const segment of CUSHION_SEGMENTS) {
    const g = makeCushionGeometry(segment);
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 6; i < (CUSHION_PROFILE.length - 1) * 2; i++) {
      // D2 clips distinct physical stations onto one rendered position. Compare
      // the two sides of each actual physical join, not unrelated clipped nodes.
      const endpoint = i % 2 ? segment.b : segment.a;
      const key = `${Math.floor(i/2)}:${endpoint.x.toFixed(8)},${endpoint.z.toFixed(8)}`;
      const normal = new THREE.Vector3().fromBufferAttribute(n, i);
      const position = new THREE.Vector3().fromBufferAttribute(p, i);
      const other = stationNormals.get(key);
      if (other) {
        expect(other.normal.distanceTo(normal)).toBeLessThan(1e-5);
        expect(other.position.distanceTo(position)).toBeLessThan(1e-6); joined++;
      } else stationNormals.set(key, { normal, position });
    }
    g.dispose();
  }
  expect(joined).toBeGreaterThan(600);
});

/**
 * [INPUT]: 实际 GLB、暖象牙材质、天空及共享六袋/帮面几何。
 * [OUTPUT]: 保留旧实体、单层不透明骨纹与中央金丝，验证圆角不动六袋/最大包络及天空纹理预算。
 * [POS]: 不启动浏览器的视觉几何契约测试。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md。
 */
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { fairyRailMaterial, splitFairyTableParts, retireAuthoredPocketAssembly } from '../src/scene/fairy-table-finish';
import { sceneCost } from '../src/minitool/render-guard';
import { addContinuousTableDeck } from '../src/scene/table-deck';
import { POCKETS } from '../src/physics';
import { frameContours, createTableFrameGeometry } from '../src/pocket-render/frame-geometry';
import { createCastleSkyBackground } from '../src/scene/daylight-environment';
import { pocketSeamContract } from '../src/pocket-render/seam-contract';
import { pocketRenderProfile } from '../src/pocket-render/profile';

/** Parse only the actual GLB position/index data; no browser, images or renderer. */
function tableFixture(hot: boolean) {
  const file = readFileSync(new URL(`../src/scene/assets/daylight/table-${hot ? 'hot' : 'refined'}.glb`, import.meta.url));
  const jsonLength = file.readUInt32LE(12);
  const doc = JSON.parse(file.subarray(20, 20 + jsonLength).toString());
  const binary = file.subarray(28 + jsonLength);
  const attribute = (index: number) => {
    const accessor = doc.accessors[index], view = doc.bufferViews[accessor.bufferView];
    const size = accessor.type === 'VEC3' ? 3 : 1;
    const bytes = accessor.componentType === 5123 ? 2 : 4;
    const values: number[] = [];
    for (let i = 0; i < accessor.count; i++) for (let k = 0; k < size; k++) {
      const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * (view.byteStride ?? size * bytes) + k * bytes;
      values.push(accessor.componentType === 5126 ? binary.readFloatLE(offset)
        : bytes === 2 ? binary.readUInt16LE(offset) : binary.readUInt32LE(offset));
    }
    return { values, size };
  };
  const root = new THREE.Group();
  for (const primitive of doc.meshes[0].primitives) {
    const p = attribute(primitive.attributes.POSITION);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(p.values, p.size));
    geometry.setIndex(attribute(primitive.indices).values);
    const material = new THREE.MeshPhysicalMaterial({ name: doc.materials[primitive.material].name });
    root.add(new THREE.Mesh(geometry, material));
  }
  root.rotation.y = -Math.PI / 2; root.position.set(-.81006, -.718, -1.44506);
  root.updateMatrixWorld(true);
  return root;
}
function triangles(root: THREE.Group) {
  let count = 0;
  root.traverse(o => { if (o instanceof THREE.Mesh) count += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3; });
  return count;
}
function bounds(mesh: THREE.Mesh) {
  const compact = mesh.geometry.toNonIndexed();
  compact.applyMatrix4(mesh.matrixWorld); compact.computeBoundingBox();
  const result = compact.boundingBox!.clone(); compact.dispose(); return result;
}
function dispose(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); materials.add(o.material as THREE.Material); } });
  materials.forEach(m => m.dispose());
}

describe('actual daylight warm-ivory rail experiment', () => {
  it('rounds only the outside profile while preserving six holes, mesh budget and full envelope', () => {
    const contracts=POCKETS.map(p=>pocketSeamContract(p,pocketRenderProfile(p)));
    const geometries=[.0012,.004].map(radius=>createTableFrameGeometry(contracts,{bottom:.036,top:.0675,radius}));
    const hole=frameContours(contracts).hole;
    const holeVertices=(g:THREE.BufferGeometry)=>{
      const p=g.getAttribute('position'),result=new Set<string>();
      for(let i=0;i<p.count;i++)if(hole.some(h=>Math.hypot(p.getX(i)-h.x,p.getZ(i)-h.z)<1e-6))
        result.add([p.getX(i),p.getY(i),p.getZ(i)].map(n=>n.toFixed(6)).join(','));
      return [...result].sort();
    };
    for(const g of geometries)g.computeBoundingBox();
    expect(geometries[1].getAttribute('position').count).toBe(geometries[0].getAttribute('position').count);
    expect(geometries[1].boundingBox).toEqual(geometries[0].boundingBox);
    expect(holeVertices(geometries[1])).toEqual(holeVertices(geometries[0]));
    expect(holeVertices(geometries[1]).length).toBeGreaterThan(100);
    geometries.forEach(g=>g.dispose());
  });

  it('keeps the warm horizon deterministic, seam-free and within half a MiB of source pixels', () => {
    const sky=createCastleSkyBackground(),again=createCastleSkyBackground();
    const {width,height,data}=sky.image;
    expect(data.byteLength).toBeLessThanOrEqual(512*1024);
    expect(data).toEqual(again.image.data);
    expect(sky.generateMipmaps).toBe(false);
    expect(sky.mapping).toBe(THREE.EquirectangularReflectionMapping);
    for(let y=0;y<height;y++)for(let channel=0;channel<4;channel++)
      expect(data[(y*width)*4+channel]).toBe(data[(y*width+width-1)*4+channel]);
    const horizon=(Math.floor(height*.55)*width+Math.floor(width*.5))*4;
    const zenith=((height-1)*width+Math.floor(width*.5))*4;
    expect(data[horizon]).toBeGreaterThan(data[horizon+2]);
    expect(data[zenith+2]).toBeGreaterThan(data[zenith]);
    // 第一视角只看到低仰角天幕；约18°处也应进入蓝天，不能把蓝顶藏到头顶。
    const lowSky=(Math.round((.5+.32/Math.PI)*(height-1))*width+Math.floor(width*.5))*4;
    expect(data[lowSky+2]).toBeGreaterThan(data[lowSky]);
    sky.dispose();again.dispose();
  });

  it('places the gold motif on the rail face with clearance from holes and outer edges', () => {
    const root=new THREE.Group();root.updateMatrixWorld(true);
    addContinuousTableDeck(root,false,new THREE.MeshStandardMaterial());
    const gold=root.getObjectByName('rail-face-gold-filigree') as THREE.Mesh;
    expect(gold.userData.filigreePanels).toBe(6);
    expect(root.getObjectByName('continuous-champagne-perimeter')).toBeUndefined();
    const {outer,hole,directions,expansion}=frameContours(POCKETS.map(p=>pocketSeamContract(p,pocketRenderProfile(p))));
    const boundary=outer.map((p,i)=>({x:p.x+directions[i].x*expansion,z:p.z+directions[i].z*expansion}));
    const distance=(p:{x:number;z:number},contour:typeof hole)=>Math.min(...contour.map((a,i)=>{
      const b=contour[(i+1)%contour.length],dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
      return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
    }));
    const inside=(p:{x:number;z:number},contour:typeof hole)=>{
      let yes=false;
      for(let i=0,j=contour.length-1;i<contour.length;j=i++){
        const a=contour[i],b=contour[j];
        if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)yes=!yes;
      }return yes;
    };
    const positions=gold.geometry.getAttribute('position'),normals=gold.geometry.getAttribute('normal');
    for(let i=0;i<positions.count;i++){
      const p={x:positions.getX(i),z:positions.getZ(i)};
      expect(inside(p,boundary)).toBe(true);expect(inside(p,hole)).toBe(false);
      expect(distance(p,boundary)).toBeGreaterThan(.012);expect(distance(p,hole)).toBeGreaterThan(.012);
      expect(positions.getY(i)).toBeCloseTo(.0678,6);expect(normals.getY(i)).toBeGreaterThan(.99);
    }
    expect(positions.count/3).toBeLessThan(3000);dispose(root);
  });
  it('retires pocket-only components while keeping the actual lower frame and rail geometry', () => {
    const root = tableFixture(false); splitFairyTableParts(root, false);
    const lower = () => {
      const result: string[] = [], v = new THREE.Vector3();
      root.traverse(o => { if (!(o instanceof THREE.Mesh)) return;
        const g = o.geometry, p = g.getAttribute('position');
        for (let i = 0; i < (g.index?.count ?? p.count); i++) {
          v.fromBufferAttribute(p, g.index?.getX(i) ?? i).applyMatrix4(o.matrixWorld);
          if (v.y <= -.2) result.push(v.toArray().map(x => x.toFixed(6)).join(','));
        }
      }); return result;
    };
    const before = lower(), rails = root.getObjectByName('fairy-gem-rails') as THREE.Mesh;
    const railIndices = Array.from(rails.geometry.index!.array);
    retireAuthoredPocketAssembly(root);
    expect(lower()).toEqual(before);
    expect(Array.from(rails.geometry.index!.array)).toEqual(railIndices);
    dispose(root);
  });
  for (const hot of [false, true]) it(`splits real ${hot ? 'hot' : 'refined'} geometry without duplicate surfaces or a second transparent shell`, () => {
    const root = tableFixture(hot), before = triangles(root);
    splitFairyTableParts(root, hot); root.updateMatrixWorld(true);
    expect(triangles(root)).toBe(before);
    const rails = root.getObjectByName('fairy-gem-rails') as THREE.Mesh;
    const crowns = root.getObjectByName('fairy-pocket-crowns') as THREE.Mesh;
    expect(rails).toBeDefined(); expect(crowns).toBeDefined();
    const railBounds = bounds(rails), crownBounds = bounds(crowns);
    expect(railBounds.min.y).toBeCloseTo(.036, 5);
    expect(railBounds.max.y).toBeCloseTo(.0675, 5);
    expect(crownBounds.min.y).toBeGreaterThanOrEqual(.060);
    expect(crownBounds.max.y).toBeLessThanOrEqual(.071);
    expect((crowns.geometry.index!.count / 3)).toBe(hot ? 170 : 2048);
    expect(railBounds.min.x).toBeLessThan(-.8); expect(railBounds.max.x).toBeGreaterThan(.8);
    expect(railBounds.min.z).toBeLessThan(-1.44); expect(railBounds.max.z).toBeGreaterThan(1.44);
    // All lower ivory structure and its extrema survive independently of the gem material.
    const ivory = root.children.find(o => o instanceof THREE.Mesh && /Pearl/.test((o.material as THREE.Material).name)) as THREE.Mesh;
    expect(bounds(ivory).min.y).toBeLessThan(-.65);
    expect((ivory.material as THREE.MeshPhysicalMaterial).transmission).toBe(0);
    const scene = new THREE.Scene(); scene.add(root);
    // Two material splits add two draws, but the ivory itself has no transmission prepass.
    const cost = sceneCost(scene);
    expect(cost.calls).toBeLessThanOrEqual(hot ? 10 : 19);
    expect(cost.triangles).toBeLessThanOrEqual(before * (hot ? 1 : 2));
    dispose(root);
  });

  it('keeps warm ivory opaque at both tiers with bounded, mip-filtered material detail', () => {
    const normal = fairyRailMaterial(false), hot = fairyRailMaterial(true);
    for (const m of [normal, hot]) {
      expect(m.transmission).toBe(0); expect(m.thickness).toBe(0);
      expect(m.iridescence).toBe(0); expect(m.metalness).toBe(0);
      expect(m.side).toBe(THREE.FrontSide); expect(m.transparent).toBe(false);
      expect(m.opacity).toBe(1); expect(m.depthWrite).toBe(true);
      expect(m.bumpMap).toBe(m.roughnessMap);
      for (const t of [m.map!, m.bumpMap!]) {
        expect(t.image.width).toBeLessThanOrEqual(512);
        expect(t.image.height).toBeLessThanOrEqual(512);
        expect(t.generateMipmaps).toBe(true);
        expect(t.minFilter).toBe(THREE.LinearMipmapLinearFilter);
        expect(t.wrapS).toBe(THREE.RepeatWrapping);
        expect(t.wrapT).toBe(THREE.RepeatWrapping);
      }
      const bytes=(m.map as THREE.DataTexture).image.data;
      let cleanWarmOpaque=true;
      for(let i=0;i<bytes.length;i+=4){
        // No near-white plastic, dark weathering, cold grain, or transparency.
        cleanWarmOpaque &&= bytes[i]<232 && bytes[i]>210 && bytes[i]>bytes[i+1]
          && bytes[i+1]>bytes[i+2] && bytes[i+3]===255;
      }
      expect(cleanWarmOpaque).toBe(true);
      m.map!.dispose();m.bumpMap!.dispose();m.dispose();
    }
  });
});

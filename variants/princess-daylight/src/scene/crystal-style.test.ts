import * as THREE from 'three';
import sceneSource from '../Scene3D.ts?raw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TABLE, POCKETS } from '../physics';
import { setCrystalOpticsQuality } from './gem-optics';
import { pocketRenderProfile } from '../pocket-render/profile';
import { CLOTH_TILE_METRES, makeClothMaps } from '../textures';
import { batchStaticTable, sceneCost, withinSceneBudget } from '../minitool/render-guard';
import { createCrystalBallDetails, createCrystalStructure, crystalShellMaterial, styleCrystalEnvironment, styleCrystalTable } from './crystal-style';

const R = TABLE.ballRadius;
const dispose: (() => void)[] = [];
afterEach(() => { dispose.splice(0).forEach(release => release()); vi.unstubAllGlobals(); });

function ownRoot(root: THREE.Object3D) {
  dispose.push(() => {
    const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    root.traverse(object => {
      for (const material of (object.userData.retiredVisualMaterials ?? []) as THREE.Material[]) materials.add(material);
      if (!(object instanceof THREE.Mesh)) return;
      geometry.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
    });
    geometry.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
  });
  return root;
}
function setup() {
  const details = createCrystalBallDetails(R); ownRoot(details.root);
  const geometry = new THREE.SphereGeometry(R, 24, 16), material = new THREE.MeshBasicMaterial();
  dispose.push(() => { geometry.dispose(); material.dispose(); });
  const balls = Array.from({ length: 16 }, (_, i) => {
    const ball = new THREE.Mesh(geometry, material);
    ball.position.set(i / 20, R, -i / 20);
    ball.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i / 10);
    return ball;
  });
  return { details, balls };
}

describe('crystal visual-only geometry contract', () => {
  it('keeps the physical-radius smooth sphere and original world-to-mesh placement in Scene3D', () => {
    const source = sceneSource;
    expect(source).toMatch(/const R = TABLE\.ballRadius/);
    // Tessellation is now bounded per quality tier; physical-radius and placement remain the contract.
    expect(source).toContain("createBallRenderGeometry(R, import.meta.env.VITE_MINITOOL === '1', false)");
    expect(source).toContain('mesh.position.set(ball.x, R, ball.z)');
    expect(source).toContain('mesh.scale.setScalar(1)');
    expect(source).toContain('this.ballMeshes[i] = mesh');
    expect(source).toContain('this.ballQuats[i] = new THREE.Quaternion()');
  });

  it('uses whole-gem surfaces with no enclosed diamond/core geometry or event overlay', () => {
    const {details,balls}=setup();
    expect(details.root.getObjectByName('crystal-diamond-cores')).toBeUndefined();
    expect(details.root.getObjectByName('crystal-eight-point-glints')).toBeUndefined();
    details.sync(balls);
  });

  it('uses numbered whole-gem textures and bounded optical depth without duplicate shell geometry', () => {
    const fillText = vi.fn();
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, beginPath() {}, arc() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, fillText }) }) });
    for (let number = 0; number <= 15; number++) {
      const material = crystalShellMaterial(number);
      dispose.push(() => { material.map?.dispose(); material.dispose(); });
      expect(material.transmission).toBeLessThanOrEqual(.95);
      if(number!==0&&number!==8){expect(material.transmission).toBeGreaterThan(.5);expect(material.thickness).toBeCloseTo(R*1.75);expect(material.normalMap).not.toBeNull();}
      expect(material.side).toBe(THREE.FrontSide);
      expect(material.map?.image).toMatchObject({ width: 512, height: 256 });
      expect(material.transparent).toBe(false);
      expect(material.depthWrite).toBe(true);
    }
    for (let number = 1; number <= 15; number++) expect(fillText).toHaveBeenCalledWith(String(number), expect.any(Number), expect.any(Number));
  });

  it('uses pearl cue, ruby IDs 1–7, whole yellow topaz IDs 9–15 and obsidian eight', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, beginPath() {}, arc() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, fillText() {} }) }) });
    const pearl = crystalShellMaterial(0), numbered = crystalShellMaterial(1);
    dispose.push(() => { pearl.map?.dispose(); numbered.map?.dispose(); pearl.dispose(); numbered.dispose(); });
    expect(pearl.userData.ballFinish).toBe('pearl');
    expect(numbered.userData.ballFinish).toBe('ruby-gem');
    const topaz=crystalShellMaterial(10),eight=crystalShellMaterial(8);
    dispose.push(()=>{topaz.map?.dispose();topaz.dispose();eight.map?.dispose();eight.dispose();});
    expect(topaz.userData.ballFinish).toBe('yellow-topaz-gem');
    expect(topaz.roughnessMap).toBeNull();
    expect(topaz.transmissionMap?.image).toMatchObject({width:256,height:128});
    expect(eight.userData.ballFinish).toBe('obsidian-eight');
    expect(pearl.opacity).toBeGreaterThanOrEqual(.8);
    expect(pearl.iridescence).toBeGreaterThanOrEqual(.3);
    expect(pearl.iridescenceThicknessRange[1]).toBeGreaterThan(pearl.iridescenceThicknessRange[0]);
    expect(pearl.roughness).toBeGreaterThan(numbered.roughness);
    expect(pearl.transmission).toBe(0);
    expect(numbered.opacity).toBe(1); expect(numbered.iridescence).toBe(0);
    expect(numbered.roughness).toBe(.115);
  });

  it('does not mutate mesh positions, orientations, scale, or visibility', () => {
    const { details, balls } = setup();
    const transforms = balls.map(ball => ({ position: ball.position.toArray(), quaternion: ball.quaternion.toArray(), scale: ball.scale.toArray(), visible: ball.visible }));
    details.sync(balls);
    expect(balls.map(ball => ({ position: ball.position.toArray(), quaternion: ball.quaternion.toArray(), scale: ball.scale.toArray(), visible: ball.visible }))).toEqual(transforms);
  });

  it('keeps volume microstructure and emissive cores in four instance batches within the low-tier geometry budget', () => {
    const { details } = setup(), scene = new THREE.Scene(); scene.add(details.root);
    expect(details.root.children).toHaveLength(4);
    expect(details.root.children.every(object => object instanceof THREE.InstancedMesh)).toBe(true);
    const cost = sceneCost(scene);
    expect(cost.calls).toBe(4);
    expect(cost.triangles).toBeLessThanOrEqual(6000);
    expect(cost.textureBytes).toBe(0);
    expect(withinSceneBudget(cost, true)).toBe(true);
  });

  it('disables shared refraction on hot/over-budget devices and restores it without extra meshes', () => {
    vi.stubGlobal('document', { createElement: () => ({width:0,height:0,getContext:()=>({fillRect(){},fillText(){}})}) });
    const scene=new THREE.Scene(),sphere=new THREE.SphereGeometry(R,24,16),gem=crystalShellMaterial(2);
    const mesh=new THREE.Mesh(sphere,gem);scene.add(mesh);ownRoot(scene);
    const original=gem.transmission;expect(original).toBeGreaterThan(.5);
    setCrystalOpticsQuality(scene,true);expect(gem.transmission).toBe(0);expect(gem.dispersion).toBe(0);
    setCrystalOpticsQuality(scene,false);expect(gem.transmission).toBe(original);expect(scene.children).toHaveLength(1);
  });

  it('styles the existing cloth, cushion and pocket geometry without replacing or moving it', () => {
    const root = ownRoot(new THREE.Group()) as THREE.Group;
    const named = ['table-cloth', 'table-wood-frame', 'cushion-0', 'pocket-top-trim-0', 'pocket-lip-0', 'pocket-net-0'];
    const originals = named.map((name, i) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), new THREE.MeshStandardMaterial()); mesh.name = name;
      mesh.position.set(i / 10, .04, i / 20); root.add(mesh);
      dispose.push(() => (mesh.userData.oldMaterial as THREE.Material).dispose()); mesh.userData.oldMaterial = mesh.material;
      return { mesh, geometry: mesh.geometry, position: mesh.position.toArray(), quaternion: mesh.quaternion.toArray(), scale: mesh.scale.toArray() };
    });
    styleCrystalTable(root);
    for (const { mesh, geometry, position, quaternion, scale } of originals) {
      expect(mesh.geometry).toBe(geometry); expect(mesh.position.toArray()).toEqual(position);
      expect(mesh.quaternion.toArray()).toEqual(quaternion); expect(mesh.scale.toArray()).toEqual(scale);
    }
    expect(root.getObjectByName('crystal-structure-r2')).toBeInstanceOf(THREE.Group);
  });

  it('keeps cloth and cushion fibre maps on opaque, nonmetallic velvet rather than glass', () => {
    const root = ownRoot(new THREE.Group()) as THREE.Group;
    const map = new THREE.Texture(), normalMap = new THREE.Texture(), roughnessMap = new THREE.Texture();
    dispose.push(() => { map.dispose(); normalMap.dispose(); roughnessMap.dispose(); });
    const originals = ['table-cloth', 'cushion-rail-z--1', 'cushion-jaw-0'].map(name => {
      const material = new THREE.MeshPhysicalMaterial({
        map, normalMap, roughnessMap, roughness: .94, sheen: .26,
        normalScale: new THREE.Vector2(.38, .38), sheenRoughness: .88,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.1, .1), material); mesh.name = name;
      root.add(mesh); return { mesh, material };
    });
    styleCrystalTable(root);
    for (const { mesh, material } of originals) {
      expect(mesh.material).toBe(material);
      expect(material.map).toBe(map); expect(material.normalMap).toBe(normalMap);
      expect(material.roughnessMap).toBe(roughnessMap);
      expect(material.transparent).toBe(false); expect(material.opacity).toBe(1);
      expect(material.depthWrite).toBe(true); expect(material.metalness).toBe(0);
      expect(material.transmission).toBe(0); expect(material.clearcoat).toBe(0);
      expect(material.roughness).toBeGreaterThanOrEqual(.9);
      expect(material.sheen).toBeGreaterThanOrEqual(.2); expect(material.sheen).toBeLessThanOrEqual(.45);
      expect(material.sheenRoughness).toBeGreaterThanOrEqual(.85);
      expect(material.normalScale.x).toBeGreaterThanOrEqual(.25);
      expect(material.normalScale.y).toBeGreaterThanOrEqual(.25);
      expect(material.sheenColor.g).toBeGreaterThan(material.sheenColor.b); expect(material.sheenColor.g).toBeGreaterThan(material.sheenColor.r);
      expect(mesh.userData.crystalRole).toBe('princess-soft-green-cloth');
      expect(root.userData.retiredVisualMaterials).not.toContain(material);
    }
  });

  it('uses lighter blue velvet with stronger microfibre data while retaining the green default', () => {
    const images: Uint8ClampedArray[] = [];
    vi.stubGlobal('document', { createElement: () => {
      const canvas = { width: 0, height: 0 };
      return Object.assign(canvas, { getContext: () => ({
        canvas,
        createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
        putImageData: (imageData: { data: Uint8ClampedArray }) => images.push(imageData.data),
      }) });
    } });
    const green = makeClothMaps(64), blue = makeClothMaps(64, 'royal-blue');
    dispose.push(() => [...Object.values(green), ...Object.values(blue)].forEach(texture => texture.dispose()));
    expect(images).toHaveLength(6);
    expect(images[4]).not.toEqual(images[1]); expect(images[5]).not.toEqual(images[2]);
    expect(images[3]).not.toEqual(images[0]);
    const blueTones = new Set<number>();
    for (let i = 0; i < images[3].length; i += 4) {
      const [r, g, b, a] = images[3].slice(i, i + 4);
      expect(b).toBeGreaterThan(g * 2); expect(g).toBeGreaterThan(r * 2);
      expect(b).toBeLessThan(110); expect(a).toBe(255); blueTones.add(b);
    }
    expect(blueTones.size).toBeGreaterThan(1);
    for (const texture of Object.values(blue)) {
      expect(texture.repeat.toArray()).toEqual([1 / CLOTH_TILE_METRES, 1 / CLOTH_TILE_METRES]);
      expect(texture.wrapS).toBe(THREE.RepeatWrapping); expect(texture.wrapT).toBe(THREE.RepeatWrapping);
    }
    expect(sceneSource).toContain("makeClothMaps(512, 'soft-green')");
  });

  it('keeps the furniture below the rail top and outside play, within the expanded camera envelope', () => {
    const root = ownRoot(createCrystalStructure());
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      expect(object.userData.visualOnly).toBe(true);
      const geometry = object.geometry, position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      for (let i = 0; i < position.count; i++) {
        a.fromBufferAttribute(position, i);
        expect(a.toArray().every(Number.isFinite)).toBe(true);
        expect(a.y).toBeLessThan(.05);
        if(a.y >= 0) expect(Math.abs(a.x)>TABLE.width/2 || Math.abs(a.z)>TABLE.length/2).toBe(true);
        expect(a.y).toBeGreaterThanOrEqual(-.83);
        expect(Math.abs(a.x)).toBeLessThan(.82);
        expect(Math.abs(a.z)).toBeLessThan(1.455);
        expect(new THREE.Vector3().fromBufferAttribute(normal, i).toArray().every(Number.isFinite)).toBe(true);
      }
      const indices = geometry.index;
      const indexAt = (i: number) => indices ? indices.getX(i) : i;
      for (let i = 0; i < (indices?.count ?? position.count); i += 3) {
        a.fromBufferAttribute(position, indexAt(i)); b.fromBufferAttribute(position, indexAt(i + 1));
        c.fromBufferAttribute(position, indexAt(i + 2));
        expect(b.sub(a).cross(c.sub(a)).lengthSq()).toBeGreaterThan(1e-18);
      }
    });
    const bounds = new THREE.Box3().setFromObject(root);
    expect(bounds.min.y).toBeCloseTo(-.8155, 3);
    expect(bounds.max.y).toBeLessThan(.05);
  });

  it('closes only the upper middle-pocket seams on both sides and leaves the pocket cavities open', () => {
    const root = ownRoot(createCrystalStructure());
    const caps = root.getObjectByName('crystal-middle-pocket-seam-caps') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const positions = caps.geometry.getAttribute('position'), sides = new Set<number>();
    expect((caps.geometry.index?.count ?? positions.count) / 3).toBe(24);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      sides.add(Math.sign(x));
      const well = pocketRenderProfile(POCKETS[2]);
      const cavityOuter = Math.abs(POCKETS[2].x) + Math.max(well.topCenterDepth + well.topDepthRadius, well.bottomCenterDepth + well.bottomDepthRadius);
      expect(Math.abs(x)).toBeGreaterThanOrEqual(cavityOuter + .0019);
      expect(Math.abs(x)).toBeLessThanOrEqual(.81 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(pocketRenderProfile(POCKETS[2]).wellBottomY-.005-1e-6); expect(y).toBeLessThanOrEqual(-.003 + 1e-6);
      expect(Math.abs(z)).toBeLessThanOrEqual(.16 + 1e-6);
    }
    expect([...sides].sort()).toEqual([-1, 1]);
    caps.geometry.computeBoundingBox();
    expect(caps.geometry.boundingBox!.min.y).toBeCloseTo(pocketRenderProfile(POCKETS[2]).wellBottomY-.005, 6);
    expect(caps.geometry.boundingBox!.max.y).toBeCloseTo(-.003, 6);
    expect(caps.material.transparent).toBe(false); expect(caps.material.opacity).toBe(1);
    expect(caps.material.color.getHex()).toBe(0x30694f); expect(caps.material.roughness).toBeGreaterThanOrEqual(.9);
    root.updateMatrixWorld(true);
    for (const side of [-1, 1]) {
      const horizontal = new THREE.Raycaster(new THREE.Vector3(side * .9, -.037, 0), new THREE.Vector3(-side, 0, 0), 0, .3);
      expect(horizontal.intersectObject(caps)).toHaveLength(1);
      const pocket = new THREE.Raycaster(new THREE.Vector3(side * .68, .01, 0), new THREE.Vector3(0, -1, 0), 0, .3);
      expect(pocket.intersectObject(caps)).toHaveLength(0);
    }
  });

  it('has four softly molded column legs, a shallow apron and a central ornament', () => {
    const root = ownRoot(createCrystalStructure());
    expect(root.userData.legCount).toBe(4);expect(root.userData.legStyle).toBe('light-roman-column');expect(root.userData.legFluteCount).toBe(8);
    expect(root.userData.apronHeight).toBeLessThanOrEqual(.12);
    const frame = root.getObjectByName('crystal-tiered-frame-and-legs') as THREE.Mesh;
    const positions = frame.geometry.getAttribute('position');
    const corners = new Set<string>();
    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) < -.3) corners.add(`${Math.sign(positions.getX(i))},${Math.sign(positions.getZ(i))}`);
    }
    expect([...corners].sort()).toEqual(['-1,-1', '-1,1', '1,-1', '1,1']);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (TABLE.width / 2 + .005), z = sz * (TABLE.length / 2 + .005);
      const radiusAt = (y: number) => {
        const radii: number[] = [];
        for (let i = 0; i < positions.count; i++) {
          if (Math.abs(positions.getY(i) - y) > 1e-5 || Math.sign(positions.getX(i)) !== sx || Math.sign(positions.getZ(i)) !== sz) continue;
          radii.push(Math.hypot(positions.getX(i) - x, positions.getZ(i) - z));
        }
        expect(radii.length).toBeGreaterThanOrEqual(8);
        return Math.max(...radii);
      };
      expect(radiusAt(-.254)).toBeGreaterThan(radiusAt(-.53));
      expect(radiusAt(-.793)).toBeGreaterThan(radiusAt(-.749));
    }
    const facets = root.getObjectByName('ivory-gold-inset-motifs') as THREE.Mesh;
    const facetsPosition = facets.geometry.getAttribute('position');
    for (const side of [-1, 1]) {
      let hasPendant = false;
      for (let i = 0; i < facetsPosition.count; i++) {
        if (Math.abs(facetsPosition.getX(i)) < .08 && facetsPosition.getY(i) < -.24
          && facetsPosition.getZ(i) * side > TABLE.length / 2 + .09) hasPendant = true;
      }
      expect(hasPendant).toBe(true);
    }
  });

  it('drops optional gold filaments on hot quality and restores them without changing the table',()=>{
    const scene=new THREE.Scene(),root=ownRoot(createCrystalStructure());scene.add(root);
    const gold=root.getObjectByName('crystal-fine-gold-seams')!;
    setCrystalOpticsQuality(scene,true);expect(gold.visible).toBe(false);expect(root.visible).toBe(true);
    setCrystalOpticsQuality(scene,false);expect(gold.visible).toBe(true);
  });

  it('keeps furniture triangle winding aligned with its interpolated exterior normals',()=>{
    const root=ownRoot(createCrystalStructure());
    root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;
      const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),idx=o.geometry.index;
      const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3(),sum=new THREE.Vector3();
      const count=idx?.count??p.count;
      for(let i=0;i<count;i+=3){const ids=[0,1,2].map(k=>idx?idx.getX(i+k):i+k);
        a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);
        normal.copy(b).sub(a).cross(c.sub(a));if(normal.lengthSq()<1e-20)continue;
        sum.set(0,0,0);for(const id of ids)sum.add(new THREE.Vector3().fromBufferAttribute(n,id));
        expect(normal.dot(sum),o.name+':'+i).toBeGreaterThan(0);
      }
    });
  });

  it('hides the inherited table and fallback block without hiding the room or floor, including late assets', () => {
    const root = ownRoot(new THREE.Group()) as THREE.Group;
    const fallback = new THREE.Group(); fallback.name = 'studio-fallback'; root.add(fallback);
    const oldBase = new THREE.Mesh(new THREE.BoxGeometry(1.4, .15, 2.68), new THREE.MeshStandardMaterial());
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial());
    fallback.add(oldBase, floor);
    const room = new THREE.Group(); room.name = 'BJ8_Room'; root.add(room);
    styleCrystalEnvironment(root);
    expect(oldBase.visible).toBe(false); expect(floor.visible).toBe(true);
    expect(fallback.visible).toBe(true); expect(room.visible).toBe(true);
    const inherited = new THREE.Group(); inherited.name = 'BJ8_TableShell';
    inherited.add(new THREE.Mesh(new THREE.BoxGeometry(1, .4, 2), new THREE.MeshStandardMaterial())); root.add(inherited);
    styleCrystalEnvironment(root); styleCrystalEnvironment(root);
    expect(inherited.visible).toBe(false); expect(oldBase.visible).toBe(false);
    expect(room.visible).toBe(true); expect(floor.visible).toBe(true);
    expect(root.children).toHaveLength(3);
    expect(sceneSource).toContain('styleCrystalEnvironment(this.studioEnvironment.root);');
  });

  it('retains the original cloth underlap in world position with one soft-green material across repeated callbacks', () => {
    const root = ownRoot(new THREE.Group()) as THREE.Group;
    root.position.set(.3, .2, -.1); root.rotation.y = .18; root.scale.setScalar(1.1);
    const model = new THREE.Group(), inherited = new THREE.Group();
    model.position.set(-.2, .1, .4); model.rotation.y = -.12;
    inherited.name = 'BJ8_TableShell'; inherited.position.set(.07, -.08, .11);
    model.add(inherited); root.add(model);
    const old = new THREE.MeshStandardMaterial({ color: 0x0b5c40, roughness: .95, side: THREE.DoubleSide });
    const underlap = new THREE.Mesh(new THREE.BoxGeometry(1.3, .0376, 2.6), old);
    underlap.name = 'BJ8_ClothUnderlap'; underlap.position.set(.03, -.0192, .06);
    underlap.rotation.y = .09; inherited.add(underlap);
    const oldAprons = new THREE.Mesh(new THREE.BoxGeometry(.035, .25, .32), old);
    oldAprons.name = 'BJ8_MiddlePocketAprons'; inherited.add(oldAprons);
    const room = new THREE.Group(); room.name = 'BJ8_Room'; root.add(room);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), old); room.add(floor);
    root.updateMatrixWorld(true);
    const world = underlap.matrixWorld.clone(), geometry = underlap.geometry, color = old.color.clone();
    const disposeOld=vi.spyOn(geometry,'dispose');
    styleCrystalEnvironment(root); root.updateMatrixWorld(true);
    const blue = underlap.material as THREE.MeshPhysicalMaterial;
    expect(underlap.parent).toBe(root); expect(underlap.visible).toBe(true);
    expect(underlap.geometry).not.toBe(geometry);expect(disposeOld).toHaveBeenCalledTimes(1);expect(underlap.userData.crystalSharedPocketSupport).toBe(true); expect(underlap.userData.crystalSupportRetained).toBe(true);
    underlap.matrixWorld.elements.forEach((value, i) => expect(value).toBeCloseTo(world.elements[i], 10));
    expect(blue).not.toBe(old); expect(blue).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(blue.color.getHex()).toBe(0x30694f); expect(blue.transparent).toBe(false);
    expect(blue.roughness).toBeGreaterThanOrEqual(.9); expect(blue.sheen).toBeGreaterThanOrEqual(.2);
    const retired = underlap.userData.retiredVisualMaterials;
    expect(retired).toEqual([old]);
    for (let i = 0; i < 3; i++) styleCrystalEnvironment(root);
    expect(underlap.material).toBe(blue); expect(underlap.userData.retiredVisualMaterials).toBe(retired);expect(disposeOld).toHaveBeenCalledTimes(1);
    expect(root.children.filter(object => object.name === 'BJ8_ClothUnderlap')).toHaveLength(1);
    const visible: THREE.Object3D[] = []; root.traverseVisible(object => visible.push(object));
    expect(visible).toContain(underlap); expect(visible).toContain(room); expect(visible).toContain(floor);
    expect(visible).not.toContain(inherited); expect(visible).not.toContain(oldAprons);
    expect(floor.material).toBe(old); expect(old.color.equals(color)).toBe(true);
  });

  it('keeps four furniture batches and a bounded shared refraction prepass through static batching', () => {
    const table = ownRoot(new THREE.Group()) as THREE.Group, structure = createCrystalStructure();
    const scene = new THREE.Scene(); table.add(structure); scene.add(table);
    const before = sceneCost(scene);
    expect(structure.children).toHaveLength(4);
    expect(before.calls).toBe(4); expect(before.triangles).toBeGreaterThan(3144);
    expect(before.textureBytes).toBeLessThan(16*1024*1024); expect(withinSceneBudget(before, true)).toBe(true);
    structure.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material as THREE.MeshPhysicalMaterial;
      expect(material.side).toBe(THREE.FrontSide);
      if (material instanceof THREE.MeshPhysicalMaterial) expect(material.transmission).toBeLessThanOrEqual(.96);
    });
    batchStaticTable(table);
    expect(structure.parent).toBe(table); expect(structure.visible).toBe(true);
    expect(structure.children.every(object => object.visible)).toBe(true);
    expect(sceneCost(scene)).toEqual(before);
  });
});

describe('R6 internal gemstone lamp contract',()=>{
 it('uses two opaque emissive core batches inside source gem spheres, never extra scene lights',()=>{
  const details=createCrystalBallDetails(R);ownRoot(details.root);
  const cores=details.root.children.filter(o=>o.userData.internalLamp) as THREE.InstancedMesh[];
  expect(cores).toHaveLength(2);expect(details.root.children.some(o=>o instanceof THREE.Light)).toBe(false);
  const balls=Array.from({length:16},(_,i)=>{const b=new THREE.Mesh();b.position.set(i*.1,R,.3);return b;});
  balls[9].visible=false;details.sync(balls);
  for(const core of cores){
   const mat=core.material as THREE.MeshStandardMaterial;expect(mat.transparent).toBe(false);expect(mat.emissiveIntensity).toBeGreaterThan(2);
   core.geometry.computeBoundingSphere();expect(core.geometry.boundingSphere!.radius).toBeCloseTo(R*.24,6);
   expect(core.count).toBe(7);const matrix=new THREE.Matrix4();core.getMatrixAt(0,matrix);
   if(core.name.startsWith('ruby'))expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo(balls[1].position.x);
   else expect(matrix.getMaxScaleOnAxis()).toBe(0);
  }
  const scene=new THREE.Scene();scene.add(details.root);setCrystalOpticsQuality(scene,true);expect(cores.every(c=>!c.visible)).toBe(true);
  setCrystalOpticsQuality(scene,false);expect(cores.every(c=>c.visible)).toBe(true);
  balls[9].visible=true;balls[9].position.set(.2,-.03,.4);balls[9].scale.setScalar(.6);details.sync(balls);
  const core=cores.find(c=>c.name.startsWith('topaz'))!,matrix=new THREE.Matrix4();core.getMatrixAt(0,matrix);
  expect(matrix.getMaxScaleOnAxis()).toBeCloseTo(.6);expect(new THREE.Vector3().setFromMatrixPosition(matrix).y).toBeCloseTo(-.03);
 });
});

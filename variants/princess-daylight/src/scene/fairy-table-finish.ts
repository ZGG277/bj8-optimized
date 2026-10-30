/**
 * [INPUT]: Authored daylight table geometry and its world transform.
 * [OUTPUT]: Six complete transmissive rail panels and six satin rolled pocket crowns.
 * [POS]: User-accepted transparent upper rails; retains ivory legs/apron, topology and pocket apertures.
 * [PROTOCOL]: When changing, update scene/CLAUDE.md.
 */
import * as THREE from 'three';

/** One FrontSide transmission pass, sharing the existing gem-ball refraction target. */
export function fairyRailMaterial(hot: boolean) {
  const material = new THREE.MeshPhysicalMaterial({
    name: 'Fairy gem | upper rails',
    color: hot ? 0x8cc9c8 : 0xe0f8f5,
    metalness: 0,
    roughness: hot ? .22 : .075,
    transmission: hot ? 0 : .88,
    thickness: .032,
    ior: 1.49,
    attenuationColor: new THREE.Color(0x82d6d2),
    attenuationDistance: .42,
    clearcoat: .36,
    clearcoatRoughness: .075,
    envMapIntensity: .78,
    specularIntensity: .85,
    transparent: false,
    opacity: 1,
    side: THREE.FrontSide,
    depthWrite: true,
  });
  material.userData.fairyRole = 'upper-rail';
  return material;
}

function splitGeometry(geometry: THREE.BufferGeometry, selected: Set<number>) {
  const count = geometry.index?.count ?? geometry.getAttribute('position').count;
  const kept: number[] = [], extracted: number[] = [];
  for (let i = 0; i < count; i++) {
    (selected.has(Math.floor(i / 3)) ? extracted : kept).push(geometry.index?.getX(i) ?? i);
  }
  const part = (indices: number[]) => {
    const result = geometry.clone();
    result.clearGroups(); result.setIndex(indices);
    return result;
  };
  return { kept: part(kept), extracted: part(extracted) };
}

/** Classify complete authored components, never slice a closed rail through its sidewall. */
function selectParts(mesh: THREE.Mesh, crown: boolean) {
  const geometry = mesh.geometry, position = geometry.getAttribute('position');
  const count = geometry.index?.count ?? position.count;
  const point = new THREE.Vector3();
  const points = Array.from({ length: position.count }, (_, i) =>
    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).clone());
  const selected = new Set<number>();
  // Weld position-only seams before classifying whole components. Some flat
  // rail caps are authored separately from their sidewalls; all belong to the
  // same .036..0675m upper band. Lower apron bridges cross that band and stay ivory.
  const unique = new Map<string, number>();
  const ids = points.map(p => {
    const key = [p.x, p.y, p.z].map(v => Math.round(v * 1e5)).join(',');
    if (!unique.has(key)) unique.set(key, unique.size);
    return unique.get(key)!;
  });
  const parents = Array.from({ length: unique.size }, (_, i) => i);
  const find = (index: number): number => {
    while (parents[index] !== index) { parents[index] = parents[parents[index]]; index = parents[index]; }
    return index;
  };
  const vertex = (i: number) => geometry.index?.getX(i) ?? i;
  for (let i = 0; i < count; i += 3) for (let k = 1; k < 3; k++) {
    parents[find(ids[vertex(i + k)])] = find(ids[vertex(i)]);
  }
  const components = new Map<number, { triangles: number[]; box: THREE.Box3 }>();
  for (let i = 0; i < count; i += 3) {
    const id = find(ids[vertex(i)]);
    let component = components.get(id);
    if (!component) { component = { triangles: [], box: new THREE.Box3() }; components.set(id, component); }
    component.triangles.push(i / 3);
    for (let k = 0; k < 3; k++) component.box.expandByPoint(points[vertex(i + k)]);
  }
  for (const { triangles, box } of components.values()) {
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const isRail = box.min.y >= .030 && box.max.y <= .080;
    const isCrown = box.min.y >= .060 && box.max.y <= .071 && size.x < .31 && size.z < .31
      && Math.abs(center.x) > .59 && (Math.abs(center.z) > 1.17 || Math.abs(center.z) < .04);
    if (crown ? isCrown : isRail) {
      for (const triangle of triangles) selected.add(triangle);
    }
  }
  return selected;
}

/** Run before the existing shared pocket deformation and crease-normal rebuild. */
export function splitFairyTableParts(root: THREE.Group, hot: boolean) {
  const additions: Array<{ parent: THREE.Object3D; mesh: THREE.Mesh }> = [];
  let railMaterial: THREE.MeshPhysicalMaterial | undefined;
  let crownMaterial: THREE.MeshPhysicalMaterial | undefined;
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const crown = /gold/i.test(object.material.name);
    if (!crown && !/Pearl \| shell inlay/.test(object.material.name)) return;
    const selected = selectParts(object, crown);
    if (!selected.size) return;
    const old = object.geometry, parts = splitGeometry(old, selected);
    const mesh = object.clone(false);
    object.geometry = parts.kept; mesh.geometry = parts.extracted;
    if (crown) {
      crownMaterial ??= new THREE.MeshPhysicalMaterial({
        name: 'Fairy satin | pocket crowns', color: 0xd3b47a, metalness: .82,
        roughness: .31, clearcoat: .12, clearcoatRoughness: .25, envMapIntensity: .75,
      });
      mesh.material = crownMaterial; mesh.name = 'fairy-pocket-crowns';
      mesh.userData.fairyRole = 'pocket-crown';
    } else {
      railMaterial ??= fairyRailMaterial(hot);
      mesh.material = railMaterial; mesh.name = 'fairy-gem-rails';
      mesh.userData.fairyRole = 'upper-rail';
    }
    additions.push({ parent: object.parent!, mesh });
    old.dispose();
  });
  for (const { parent, mesh } of additions) parent.add(mesh);
}

/** A closed 1.2 mm sleeve outside the original 36-sided well, with metric UVs. */
import * as THREE from 'three';
import { pocketLocalToWorld, type PocketGeometry } from '../physics';
import type { PocketRenderProfile } from './profile';

export function createWellLining(pocket: PocketGeometry, profile: PocketRenderProfile) {
  const n = profile.wellRadialSteps, thickness = .0012, tile = .035;
  const top: THREE.Vector3[] = [], bottom: THREE.Vector3[] = [], lengths = [0];
  for (let i = 0; i <= n; i++) {
    const a = (i % n) / n * Math.PI * 2;
    const t = pocketLocalToWorld(pocket, profile.topCenterDepth + Math.sin(a) * profile.topDepthRadius, Math.cos(a) * profile.topLateralRadius);
    const b = pocketLocalToWorld(pocket, profile.bottomCenterDepth + Math.sin(a) * profile.bottomDepthRadius, Math.cos(a) * profile.bottomLateralRadius);
    top.push(new THREE.Vector3(t.x, profile.wellTopY, t.z));
    bottom.push(new THREE.Vector3(b.x, profile.wellBottomY, b.z));
    if (i) lengths.push(lengths[i - 1] + top[i].distanceTo(top[i - 1]));
  }
  // An integer number of repeats closes the seam; grain scale deviates by < 4%.
  const repeats = Math.max(1, Math.round(lengths[n] / tile));
  const p: number[] = [], uv: number[] = [], indices: number[] = [];
  const radial = (i: number) => {
    const a = (i % n) / n * Math.PI * 2;
    const origin = pocketLocalToWorld(pocket, 0, 0);
    const point = pocketLocalToWorld(pocket, Math.sin(a) / profile.topDepthRadius, Math.cos(a) / profile.topLateralRadius);
    return new THREE.Vector3(point.x - origin.x, 0, point.z - origin.z).normalize();
  };
  const outerTop = top.map((t, i) => t.clone().addScaledVector(radial(i), thickness));
  const outerBottom = bottom.map((t, i) => t.clone().addScaledVector(radial(i), thickness));
  const strip = (a: THREE.Vector3[], b: THREE.Vector3[], role: 'inner' | 'outer' | 'top' | 'bottom') => {
    const base = p.length / 3;
    for (let i = 0; i <= n; i++) {
      p.push(...a[i].toArray(), ...b[i].toArray());
      const u = lengths[i] / lengths[n] * repeats;
      uv.push(u, 0, u, a[i].distanceTo(b[i]) / tile);
    }
    for (let i = 0; i < n; i++) {
      const x = base + i * 2;
      const faces = [x, x + 1, x + 2, x + 2, x + 1, x + 3];
      const intended = role === 'top' || role === 'bottom'
        ? new THREE.Vector3(0, role === 'top' ? 1 : -1, 0)
        : radial(i).multiplyScalar(role === 'inner' ? -1 : 1);
      const cross = b[i].clone().sub(a[i]).cross(a[i + 1].clone().sub(a[i]));
      if (cross.dot(intended) < 0) for (let j = 0; j < faces.length; j += 3) [faces[j + 1], faces[j + 2]] = [faces[j + 2], faces[j + 1]];
      indices.push(...faces);
    }
  };
  strip(top, bottom, 'inner');
  strip(outerTop, outerBottom, 'outer');
  strip(outerTop, top, 'top');
  strip(bottom, outerBottom, 'bottom');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  // Same physical seam, split UV: average end normals to remove its highlight line.
  const normal = geometry.getAttribute('normal'), tmp = new THREE.Vector3();
  for (let s = 0; s < 4; s++) for (let j = 0; j < 2; j++) {
    const first = s * (n + 1) * 2 + j, last = first + n * 2;
    tmp.fromBufferAttribute(normal, first).add(new THREE.Vector3().fromBufferAttribute(normal, last)).normalize();
    normal.setXYZ(first, tmp.x, tmp.y, tmp.z); normal.setXYZ(last, tmp.x, tmp.y, tmp.z);
  }
  geometry.computeBoundingSphere();
  return geometry;
}

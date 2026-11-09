import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
  it('实际打包的候选保持单材质与4000三角面以内，不含外链', () => {
    const b = readFileSync('src/scene/assets/daylight/hunyuan-arch-mobile.glb');
    const n = b.readUInt32LE(12), gltf = JSON.parse(b.subarray(20, 20+n).toString());
    const primitives = gltf.meshes.flatMap((m: { primitives: { indices: number }[] }) => m.primitives);
    const triangles = primitives.reduce((sum: number, p: { indices: number }) => sum+gltf.accessors[p.indices].count/3, 0);
    expect(triangles).toBeLessThanOrEqual(4000); expect(triangles).toBeGreaterThan(3000);
    expect(gltf.materials).toHaveLength(1);
    expect(gltf.images.every((i: { bufferView?: number }) => typeof i.bufferView==='number')).toBe(true);
  });
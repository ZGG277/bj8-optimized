/*
[INPUT]: Blender 导出的 GLB 文件与既有米制球桌尺寸
[OUTPUT]: 实际解析后节点、世界坐标、顶点、法线、三角形及包体预算检查
[POS]: 离线资产验收；检查生成的字节，不以 Blender 成功回执代替几何检查
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Vector3, Box3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const path = new URL('../src/scene/assets/billiards-room-v1.glb', import.meta.url);
const bytes = await readFile(path);
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const root = gltf.scene;
root.updateMatrixWorld(true);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(bytes.length < 2 * 1024 * 1024, '首版 GLB 超过 2 MiB 资产预算');
for (const name of ['BJ8_TableShell', 'BJ8_Room', 'BJ8_Pendant']) assert(root.getObjectByName(name), `缺少 ${name}`);
for (const [name, expected] of [['BJ8_Origin', [0, 0, 0]], ['BJ8_Width', [.635, 0, 0]], ['BJ8_Length', [0, 0, 1.27]]]) {
  const anchor = root.getObjectByName(name);
  assert(anchor, `缺少 ${name}`);
  assert(anchor.getWorldPosition(new Vector3()).distanceTo(new Vector3(...expected)) < 1e-6, `${name} 尺寸/轴向错误`);
}
let meshes = 0, triangles = 0;
const bounds = {};
root.traverse(object => {
  if (!object.isMesh) return;
  meshes++;
  const geometry = object.geometry;
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  assert(position && normal, `${object.name} 缺少位置或法线`);
  assert([...position.array, ...normal.array].every(Number.isFinite), `${object.name} 含非有限顶点`);
  const index = geometry.index;
  const count = index ? index.count : position.count;
  triangles += count / 3;
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(position, index ? index.getX(i) : i);
    b.fromBufferAttribute(position, index ? index.getX(i+1) : i+1);
    c.fromBufferAttribute(position, index ? index.getX(i+2) : i+2);
    assert(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-22, `${object.name} 含退化三角形`);
  }
  // 新外壳在台面上方的部分只能位于木帮外侧，不能侵占球的运动区域。
  if (object.parent?.name === 'BJ8_TableShell') {
    for (let i=0; i<position.count; i++) {
      a.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
      assert(a.y < -.07 || Math.abs(a.x) > .64 || Math.abs(a.z) > 1.275, `${object.name} 侵入可玩台面`);
    }
  }
});
assert(meshes <= 24 && triangles <= 30000, `首版网格/面数预算超限: meshes=${meshes}, triangles=${triangles}`);
for (const name of ['BJ8_TableShell', 'BJ8_Room', 'BJ8_Pendant']) {
  const b = new Box3().setFromObject(root.getObjectByName(name), true);
  bounds[name] = { min: b.min.toArray(), max: b.max.toArray() };
}
console.log(JSON.stringify({ passed: true, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), meshes, triangles, bounds }, null, 2));

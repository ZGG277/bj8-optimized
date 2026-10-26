/* Blender GLB/source/build provenance verification; no GPU or workspace mutation. */
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const html = readFileSync('dist/index.html', 'utf8');
const rows = [];
for (const [world, suffix] of [['galaxy', 'Galaxy'], ['bamboo', 'Bamboo'], ['aurora-lake', 'Aurora']]) {
  const path = `src/scene/assets/world-${world}.glb`;
  const bytes = readFileSync(path);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  const provenance = JSON.parse(readFileSync(`assets/blender/world-${world}/provenance.json`, 'utf8'));
  assert.equal(provenance.sha256, sha(bytes));
  assert.equal(provenance.blenderVersion, '5.2.1 LTS');
  assert(statSync(`assets/blender/world-${world}/world-${world}.blend`).size > 1000);
  assert(statSync(`assets/blender/world-${world}/preview.png`).size > 1000);
  for (const root of [`BJ8_World_${suffix}`, `BJ8_Quiet_${suffix}`]) assert(json.nodes.some(node => node.name === root), root);
  assert(!json.animations?.length && !json.cameras?.length);
  assert(!json.extensionsUsed?.includes('KHR_lights_punctual'));
  assert(json.images.every(image => image.bufferView !== undefined && !image.uri), 'All textures must be embedded');
  // Blender defaults new images to RGB: an alpha node alone must not masquerade as a soft light curtain.
  if (world === 'aurora-lake') {
    const binStart = 28 + bytes.readUInt32LE(12);
    for (const image of json.images.filter(image => image.name.includes('SoftCurtain'))) {
      const view = json.bufferViews[image.bufferView];
      assert.equal(bytes[binStart + (view.byteOffset ?? 0) + 25], 6, 'Aurora PNG must preserve RGBA alpha');
    }
  }
  const triangles = json.meshes.flatMap(mesh => mesh.primitives).reduce((total, primitive) => {
    assert.equal(primitive.mode ?? 4, 4);
    const position = json.accessors[primitive.attributes.POSITION];
    assert(position.min.every(Number.isFinite) && position.max.every(Number.isFinite));
    return total + json.accessors[primitive.indices].count / 3;
  }, 0);
  assert(triangles < 70000 && json.meshes.length <= 20 && bytes.length < 3.2 * 1024 * 1024);
  assert(html.includes(`data:model/gltf-binary;base64,${bytes.toString('base64')}`), `${world}: built HTML must embed the exact verified model`);
  rows.push({ world, bytes: bytes.length, triangles, meshes: json.meshes.length, textures: json.images.length, sha256: sha(bytes) });
}
assert(!/new URL\(["']world-[^"']+\.glb["']/.test(html));
assert(Buffer.byteLength(html) < 10 * 1024 * 1024);
console.log(JSON.stringify({ assets: rows, htmlBytes: Buffer.byteLength(html), htmlSha256: sha(html) }, null, 2));

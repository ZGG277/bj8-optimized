import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { adaptGlb, offlineImage } from './minitool-glb-assets.mjs';

function fixture() {
  const binary = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
  const doc = {
    asset: { version: '2.0' }, buffers: [{ byteLength: 8 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }, { buffer: 0, byteOffset: 4, byteLength: 4 }],
    accessors: [{ bufferView: 0, componentType: 5121, count: 4, type: 'SCALAR' }],
    images: [{ bufferView: 1, mimeType: 'image/png' }], textures: [{ source: 0, sampler: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, roughnessFactor: 0.6 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
  };
  const json = Buffer.from(JSON.stringify(doc));
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + padded.length + binary.length, 8);
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4);
  return { bytes: Buffer.concat([header, padded, binHeader, binary]), doc };
}
const parse = (bytes: Buffer) => JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());

describe('offline GLB texture packaging', () => {
  it('selects only an exact-hash PNG alternative', () => {
    const png = Buffer.from('png'), webp = Buffer.from('webp');
    const packed = new Map([[createHash('sha256').update(png).digest('hex'), webp]]);
    expect(offlineImage(png, 'image/png', packed)).toEqual({ data: webp, mime: 'image/webp' });
    expect(offlineImage(png, 'image/jpeg', packed)).toEqual({ data: png, mime: 'image/jpeg' });
    expect(offlineImage(Buffer.from('other'), 'image/png', packed).mime).toBe('image/png');
  });
  it('declares WebP while preserving materials, texture references and geometry bytes', () => {
    const { bytes, doc } = fixture();
    const result = adaptGlb(bytes, () => ({ uri: './texture.webp', mimeType: 'image/webp' }));
    const gltf = parse(result);
    expect(gltf.images).toEqual([{ uri: './texture.webp', mimeType: 'image/webp' }]);
    expect(gltf.textures).toEqual([{ sampler: 0, extensions: { EXT_texture_webp: { source: 0 } } }]);
    expect(gltf.extensionsRequired).toEqual(['EXT_texture_webp']);
    expect(gltf.materials).toEqual(doc.materials);
    expect(gltf.meshes).toEqual(doc.meshes);
    expect([...result.subarray(28 + result.readUInt32LE(12))]).toEqual([1, 2, 3, 4]);
    expect(result.readUInt32LE(8)).toBe(result.length);
  });
  it('retains the original PNG contract with legacy URI callbacks', () => {
    const gltf = parse(adaptGlb(fixture().bytes, () => './texture.png'));
    expect(gltf.images).toEqual([{ uri: './texture.png', mimeType: 'image/png' }]);
    expect(gltf.textures).toEqual([{ source: 0, sampler: 0 }]);
    expect(gltf.extensionsRequired).toBeUndefined();
  });
});

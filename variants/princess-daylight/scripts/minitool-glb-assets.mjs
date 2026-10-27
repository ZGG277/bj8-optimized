/** Lossless build-only resource adaptation. Original GLBs remain immutable. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const textureRoot = new URL('../src/assets/offline-textures/', import.meta.url);

export function offlineImage(data, mime, packedImages) {
  const match = mime === 'image/png' && packedImages.get(createHash('sha256').update(data).digest('hex'));
  return match ? { data: match, mime: 'image/webp' } : { data, mime };
}

export function adaptGlb(bytes, emitImage) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw Error('Invalid GLB');
  const jsonSize = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonSize).toString());
  const binary = bytes.subarray(28 + jsonSize);
  const views = gltf.bufferViews || [];
  // Original PNGs stay inside the authored GLB; an optional byte-exact RGBA WebP
  // alternative may be emitted for the constrained offline package.
  const webpImages = new Set();
  for (const [index, image] of (gltf.images || []).entries()) {
    if (image.bufferView === undefined) continue;
    const view = views[image.bufferView];
    const data = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const emitted = emitImage(data, image.mimeType);
    if (typeof emitted === 'string') image.uri = emitted;
    else {
      image.uri = emitted.uri;
      image.mimeType = emitted.mimeType;
      if (emitted.mimeType === 'image/webp') webpImages.add(index);
    }
    delete image.bufferView;
  }
  if (webpImages.size) {
    for (const texture of gltf.textures || []) {
      if (!webpImages.has(texture.source)) continue;
      texture.extensions = { ...texture.extensions, EXT_texture_webp: { source: texture.source } };
      delete texture.source;
    }
    gltf.extensionsUsed = [...new Set([...(gltf.extensionsUsed || []), 'EXT_texture_webp'])];
    gltf.extensionsRequired = [...new Set([...(gltf.extensionsRequired || []), 'EXT_texture_webp'])];
  }
  const usesSecondUv = JSON.stringify(gltf.materials || []).includes('"texCoord":1');
  if (!usesSecondUv) for (const mesh of gltf.meshes || []) for (const primitive of mesh.primitives) delete primitive.attributes.TEXCOORD_1;
  const usedAccessors = new Set();
  for (const mesh of gltf.meshes || []) for (const primitive of mesh.primitives) {
    Object.values(primitive.attributes).forEach(i => usedAccessors.add(i));
    if (primitive.indices !== undefined) usedAccessors.add(primitive.indices);
    if (primitive.targets || primitive.extensions) throw Error('Unsupported mesh extensions in offline adapter');
  }
  if (gltf.animations || gltf.skins) throw Error('Animated asset needs explicit accessor preservation');
  const accessorMap = new Map();
  gltf.accessors = (gltf.accessors || []).filter((a, i) => {
    if (!usedAccessors.has(i)) return false;
    if (a.sparse) throw Error('Sparse accessor needs explicit preservation');
    accessorMap.set(i, accessorMap.size); return true;
  });
  for (const mesh of gltf.meshes || []) for (const primitive of mesh.primitives) {
    for (const key of Object.keys(primitive.attributes)) primitive.attributes[key] = accessorMap.get(primitive.attributes[key]);
    if (primitive.indices !== undefined) primitive.indices = accessorMap.get(primitive.indices);
  }
  const usedViews = new Set(gltf.accessors.map(a => a.bufferView));
  const viewMap = new Map(), parts = []; let length = 0;
  gltf.bufferViews = views.filter((view, i) => {
    if (!usedViews.has(i)) return false;
    viewMap.set(i, viewMap.size);
    const data = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const padding = (4 - data.length % 4) % 4;
    parts.push(data, Buffer.alloc(padding)); view.byteOffset = length;
    length += data.length + padding; return true;
  });
  for (const accessor of gltf.accessors) accessor.bufferView = viewMap.get(accessor.bufferView);
  gltf.buffers = [{ byteLength: length }];
  const json = Buffer.from(JSON.stringify(gltf));
  const paddedJson = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + paddedJson.length + length, 8); header.writeUInt32LE(paddedJson.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, paddedJson, binHeader, ...parts]);
}

export default function miniToolGlbAssets() {
  const images = new Map();
  let packedPromise;
  const packedImages = () => packedPromise ??= (async () => {
    const manifest = JSON.parse(await readFile(new URL('manifest.json', textureRoot), 'utf8'));
    const entries = await Promise.all(Object.entries(manifest.images).map(async ([originalSha, entry]) => {
      if (!/^[a-f0-9]{20}\.webp$/.test(entry.file)) throw Error('Invalid offline texture path');
      const data = await readFile(new URL(entry.file, textureRoot));
      if (createHash('sha256').update(data).digest('hex') !== entry.sha256) throw Error('Offline texture hash mismatch');
      return [originalSha, data];
    }));
    return new Map(entries);
  })();
  return {
    name: 'minitool-lossless-glb-assets', enforce: 'pre',
    async load(id) {
      if (!id.endsWith('.glb?url')) return null;
      const bytes = await readFile(id.slice(0, -4));
      const packed = await packedImages();
      const adapted = adaptGlb(bytes, (data, mime) => {
        ({ data, mime } = offlineImage(data, mime, packed));
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mime];
        if (!extension) throw Error(`Unsupported GLB image type ${mime}`);
        const fileName = `assets/model-${createHash('sha256').update(data).digest('hex').slice(0, 20)}.${extension}`;
        if (!images.has(fileName)) { images.set(fileName, true); this.emitFile({ type: 'asset', fileName, source: data }); }
        return { uri: `./${fileName}`, mimeType: mime };
      });
      if (adapted.length > 1024 * 1024) throw Error(`GLB still exceeds 1 MiB after lossless adaptation: ${id}`);
      return `export default ${JSON.stringify('data:model/gltf-binary;base64,' + adapted.toString('base64'))};`;
    },
  };
}

/*
[INPUT]: 自包含 GLB 的本地相对 URL 或 data:model/gltf-binary;base64 URL
[OUTPUT]: GLTFLoader 解析结果；data URL 直接解码后 parse，不触发 fetch
[POS]: 场景资产离线加载边界，供球房、台面细节、正式世界与湖面共用
[PROTOCOL]: 变更时同步更新 glb-loader.test.ts 与 scene/CLAUDE.md
*/
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const GLB_DATA_PREFIX = 'data:model/gltf-binary;base64,';

export function decodeGlbDataUrl(url: string): ArrayBuffer | null {
  if (!url.startsWith(GLB_DATA_PREFIX)) return null;
  const binary = atob(url.slice(GLB_DATA_PREFIX.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

export function loadGlb(url: string): Promise<GLTF> {
  const loader = new GLTFLoader();
  const packed = decodeGlbDataUrl(url);
  if (!packed) return loader.loadAsync(url);
  return new Promise((resolve, reject) => loader.parse(packed, '', resolve, reject));
}

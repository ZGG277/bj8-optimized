/*
[INPUT]: glb-loader 的 data URL 解码器
[OUTPUT]: 覆盖非 GLB URL 与 base64 字节无损解码
[POS]: 小工具离线资产边界的纯函数回归；不创建 WebGL 或 DOM
[PROTOCOL]: 解码格式变化时同步更新 glb-loader.ts
*/
import { describe, expect, it } from 'vitest';
import { decodeGlbDataUrl } from './glb-loader';

describe('decodeGlbDataUrl', () => {
  it('只接收自包含 GLB data URL', () => {
    expect(decodeGlbDataUrl('./assets/world.glb')).toBeNull();
    expect(decodeGlbDataUrl('data:image/png;base64,AA==')).toBeNull();
  });

  it('无损解码二进制字节', () => {
    const decoded = decodeGlbDataUrl('data:model/gltf-binary;base64,Z2xURgI=');
    expect([...new Uint8Array(decoded!)]).toEqual([103, 108, 84, 70, 2]);
  });
});

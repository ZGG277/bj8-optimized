/**
 * [INPUT]: 实际 WebP/MP4 二进制与片头元信息。
 * [OUTPUT]: 校验竖屏 220 帧 8 秒合同，以及横屏核准 MP4 的容器、时长和哈希。
 * [POS]: Node素材门禁；不混入浏览器源码或改动影片。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('全部影片帧的真实时间戳与8秒呈现合同一致',()=>{
  const bytes=readFileSync(new URL('../src/assets/opening/arrival.webp',import.meta.url));
  const asset=JSON.parse(readFileSync(new URL('../src/assets/opening/provenance.json',import.meta.url),'utf8'));
  let duration=0,frames=0;
  for(let p=12;p+8<=bytes.length;){
    const n=bytes.readUInt32LE(p+4);
    if(bytes.toString('ascii',p,p+4)==='ANMF'){duration+=bytes.readUIntLE(p+20,3);frames++;}
    p+=8+n+(n&1);
  }
  expect(frames).toBe(220);expect(duration).toBe(8000);
  expect(duration).toBe(asset.durationSeconds*1000);
});
it('横屏开场保持核准的8秒MP4与片内音轨',()=>{
  const bytes=readFileSync(new URL('../src/assets/opening/arrival-landscape.mp4',import.meta.url));
  const poster=readFileSync(new URL('../src/assets/opening/arrival-landscape-poster.jpg',import.meta.url));
  const asset=JSON.parse(readFileSync(new URL('../src/assets/opening/landscape-provenance.json',import.meta.url),'utf8'));
  const sha=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
  expect(bytes.subarray(4,8).toString('ascii')).toBe('ftyp');
  expect(bytes.includes(Buffer.from('avc1'))).toBe(true);
  expect(bytes.includes(Buffer.from('mp4a'))).toBe(true);
  const at=bytes.indexOf('mvhd');
  expect(bytes[at+4]).toBe(0);
  expect(bytes.readUInt32BE(at+20)/bytes.readUInt32BE(at+16)).toBe(8);
  expect(bytes.length).toBe(asset.deliveryRepresentation.bytes);
  expect(sha(bytes)).toBe(asset.sha256);
  expect(sha(poster)).toBe(asset.poster.sha256);
  expect(asset.resolution).toEqual([1280,720]);
  expect(asset.durationSeconds).toBe(8);
  expect(asset.edit.playbackSpeed).toBe(1);
});

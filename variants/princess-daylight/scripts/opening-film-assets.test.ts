/**
 * [INPUT]: 实际WebP二进制与片头元信息。
 * [OUTPUT]: 校验220帧的真实容器时间戳与8秒呈现合同一致。
 * [POS]: Node素材门禁；不混入浏览器源码或改动影片。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
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

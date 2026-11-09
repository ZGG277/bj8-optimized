/*
[INPUT]: 实际头像/赞美句与可控图片、字体和Canvas边界
[OUTPUT]: 身份原句、同图缓存、字体门禁与失败可重试回归
[POS]: 分享封面合成的契约测试；真实绘制另由浏览器像素验收
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderShareCover, SHARE_COVER_SIZE } from './share-cover';
import { loadCardImage } from './match-card';
import { ensureUiFont } from '../typography';
vi.mock('./match-card',()=>({loadCardImage:vi.fn(async()=>({naturalWidth:1080,naturalHeight:1440}))}));
vi.mock('../typography',()=>({canvasFont:(n:number)=>`${n}px Princess WenKai UI`,ensureUiFont:vi.fn(async()=>{})}));
const setup=()=>{
  const ctx={drawImage:vi.fn(),fillText:vi.fn(),fillRect:vi.fn(),save:vi.fn(),restore:vi.fn(),beginPath:vi.fn(),arc:vi.fn(),fill:vi.fn(),clip:vi.fn(),stroke:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),createLinearGradient:()=>({addColorStop:vi.fn()})};
  const canvas={width:0,height:0,getContext:()=>ctx,toDataURL:vi.fn(()=> 'data:image/jpeg;base64,Y292ZXI=')};
  vi.stubGlobal('document',{createElement:()=>canvas});return {ctx,canvas};
};
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
describe('full-image share cover',()=>{
  it('composites the exact name/praise over a near-shot base and caches the same picture',async()=>{
    const {ctx,canvas}=setup(),a=renderShareCover('avatar-one','许清河','这一杆真漂亮'),b=renderShareCover('avatar-one','许清河','这一杆真漂亮');
    expect(a).toBe(b);expect(await a).toMatch(/^data:image\/jpeg;base64,/);
    expect(canvas).toMatchObject(SHARE_COVER_SIZE);expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    expect(loadCardImage).toHaveBeenCalledWith('avatar-one');
    expect(ctx.fillText.mock.calls.map(c=>c[0])).toContain('许清河');expect(ctx.fillText.mock.calls.map(c=>c[0])).toContain('这一杆真漂亮');
    expect(canvas.toDataURL).toHaveBeenCalledTimes(1);
  });
  it('waits for the real font before freezing the image',async()=>{
    let ready!:()=>void;vi.mocked(ensureUiFont).mockImplementationOnce(()=>new Promise<void>(r=>{ready=r;}));
    const {canvas}=setup(),pending=renderShareCover('avatar-font','沈予白','好球为你喝彩');
    await Promise.resolve();expect(canvas.toDataURL).not.toHaveBeenCalled();ready();await pending;expect(canvas.toDataURL).toHaveBeenCalledOnce();
  });
  it('does not keep a failed cached rendering and can retry the same actual card',async()=>{
    vi.mocked(loadCardImage).mockRejectedValueOnce(new Error('not loaded'));
    setup();await expect(renderShareCover('avatar-retry','陆景辰','出手就是好球')).rejects.toThrow('not loaded');
    await expect(renderShareCover('avatar-retry','陆景辰','出手就是好球')).resolves.toMatch(/^data:image\/jpeg/);
  });
  it('rejects missing or overlong lines rather than silently inventing a new compliment',async()=>{
    await expect(renderShareCover('a','许清河','')).rejects.toThrow();await expect(renderShareCover('a','许清河','一'.repeat(11))).rejects.toThrow();
  });
});

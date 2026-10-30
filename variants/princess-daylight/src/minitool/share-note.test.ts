import { afterEach, describe, expect, it, vi } from 'vitest';
import { miniToolApi, postVictoryNote, shareFailure, victoryNote } from './share-note';
afterEach(() => vi.unstubAllGlobals());
describe('小工具分享合同', () => {
  it('无容器时不伪造平台能力', () => {
    vi.stubGlobal('window', {});
    expect(miniToolApi()).toBeUndefined();
  });
  it('只使用正式 postNote 字段和包内生成的图像', async () => {
    const postNote = vi.fn().mockResolvedValue({ errMsg: 'postNote:ok' });
    vi.stubGlobal('window', { xhs: { miniTool: { postNote } } });
    const draft = victoryNote('data:image/jpeg;base64,YQ==', 'challenge');
    await miniToolApi()!.postNote(draft);
    expect(postNote).toHaveBeenCalledWith(draft);
    expect(draft.title.length).toBeLessThanOrEqual(20);
    expect(draft.content.length).toBeLessThanOrEqual(1000);
    expect(draft.content).toContain('挑战');
    expect(draft.mediaInfo.image_resources).toHaveLength(1);
    expect(() => victoryNote('https://example.com/card.jpg', 'practice')).toThrow();
  });
  it('取消和失败都有可恢复提示', () => {
    expect(shareFailure({ errMsg: 'postNote:fail cancel' })).toContain('取消');
    expect(shareFailure({ errMsg: 'postNote:fail unavailable' })).toContain('重试');
  });
});

describe('real two-image victory draft', () => {
 it('keeps the visible card first, castle second and the tool topic prefilled', async () => {
  const card='data:image/jpeg;base64,Y2FyZA==',scene='data:image/jpeg;base64,c2NlbmU=';
  const draft=victoryNote(card,'practice','沈予白',scene);
  expect(draft.content).toContain('#小红书小工具');expect(draft.mediaInfo.image_resources.map(x=>x.url)).toEqual([card,scene]);
  const writeTempFile=vi.fn().mockResolvedValueOnce({filePath:'tmp/card.jpg'}).mockResolvedValueOnce({filePath:'tmp/castle.jpg'});
  const postNote=vi.fn().mockRejectedValue({errMsg:'postNote:fail cancel'});
  await expect(postVictoryNote({writeTempFile,postNote},card,'practice','沈予白',scene)).rejects.toMatchObject({errMsg:'postNote:fail cancel'});
  expect(writeTempFile.mock.calls).toEqual([[{data:card}],[{data:scene}]]);
  expect(postNote.mock.calls[0][0].mediaInfo.image_resources).toEqual([{url:'tmp/card.jpg'},{url:'tmp/castle.jpg'}]);
 });
 it('rejects missing temporary paths and accepts base64 when the file bridge is absent',async()=>{
  const image='data:image/jpeg;base64,YQ=='; const postNote=vi.fn().mockResolvedValue({errMsg:'ok'});
  await expect(postVictoryNote({postNote,writeTempFile:async()=>({filePath:''})},image,'practice','对手',image)).rejects.toThrow();expect(postNote).not.toHaveBeenCalled();
  await postVictoryNote({postNote},image,'practice','对手',image);expect(postNote.mock.calls[0][0].mediaInfo.image_resources).toHaveLength(2);
 });
});

it('keeps a comfort card share honest after an early black-eight loss', () => {
  const draft=victoryNote('data:image/jpeg;base64,YQ==','practice','陆璟辰',undefined,false);
  expect(draft.title).not.toContain('赢');expect(draft.content).not.toContain('赢下');expect(draft.content).toContain('#小红书小工具');
});

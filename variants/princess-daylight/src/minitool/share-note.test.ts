import { afterEach, describe, expect, it, vi } from 'vitest';
import { miniToolApi, postVictoryNote, shareFailure, victoryNote } from './share-note';
import { COMPANIONS } from '../opponent/companions';
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
    expect(draft.content.split('\n').pop()).toBe('#小红书小工具[话题]# #公主请开球[话题]# #台球[话题]# #挑战模式[话题]#');
    expect(draft.title).toBe('这一局公主又赢了');
    expect(draft.content).toContain('公主宝宝好棒啊💕💕✨');
    expect(draft.mediaInfo.image_resources).toHaveLength(1);
    expect(() => victoryNote('https://example.com/card.jpg', 'practice')).toThrow();
  });
  it('取消和失败都有可恢复提示', () => {
    expect(shareFailure({ errMsg: 'postNote:fail cancel' })).toContain('取消');
    expect(shareFailure({ errMsg: 'postNote:fail unavailable' })).toContain('重试');
  });
});

describe('real two-image victory draft', () => {
 it('keeps the generated composite cover first, original card second and the real winner list', async () => {
  const cover='data:image/jpeg;base64,Y292ZXI=',card='data:image/jpeg;base64,Y2FyZA==';
  const names=[COMPANIONS[0].name,COMPANIONS[1].name,COMPANIONS[9].name];
  const draft=victoryNote(cover,'practice',COMPANIONS[9].name,card,true,names);
  expect(draft.content).toContain(`本公主已经赢过${names.join('、')}啦`);
  expect(draft.content.split(COMPANIONS[9].name)).toHaveLength(2);
  expect(draft.content).not.toContain(COMPANIONS[8].name);
  expect(draft.content.split('\n').pop()).toBe('#小红书小工具[话题]# #公主请开球[话题]# #台球[话题]# #陪练模式[话题]#');expect(draft.mediaInfo.image_resources.map(x=>x.url)).toEqual([cover,card]);
  const writeTempFile=vi.fn().mockResolvedValueOnce({filePath:'tmp/cover.jpg'}).mockResolvedValueOnce({filePath:'tmp/card.jpg'});
  const postNote=vi.fn().mockRejectedValue({errMsg:'postNote:fail cancel'});
  await expect(postVictoryNote({writeTempFile,postNote},cover,'practice',COMPANIONS[9].name,card,true,names)).rejects.toMatchObject({errMsg:'postNote:fail cancel'});
  expect(writeTempFile.mock.calls).toEqual([[{data:cover}],[{data:card}]]);
  expect(postNote.mock.calls[0][0].mediaInfo.image_resources).toEqual([{url:'tmp/cover.jpg'},{url:'tmp/card.jpg'}]);
  expect(postNote.mock.calls[0][0].title).toBe(draft.title);
  expect(postNote.mock.calls[0][0].content).toBe(draft.content);
 });
 it('rejects missing temporary paths and accepts base64 when the file bridge is absent',async()=>{
  const image='data:image/jpeg;base64,YQ=='; const postNote=vi.fn().mockResolvedValue({errMsg:'ok'});
  await expect(postVictoryNote({postNote,writeTempFile:async()=>({filePath:''})},image,'practice','对手',image)).rejects.toThrow();expect(postNote).not.toHaveBeenCalled();
  await postVictoryNote({postNote},image,'practice','对手',image);expect(postNote.mock.calls[0][0].mediaInfo.image_resources).toHaveLength(2);
 });
});

it('keeps a comfort card share honest after an early black-eight loss', () => {
  const draft=victoryNote('data:image/jpeg;base64,YQ==','practice','陆璟辰',undefined,false,COMPANIONS.map(c=>c.name));
  expect(draft.title).not.toContain('赢');expect(draft.content).not.toContain('赢下');expect(draft.content.split('\n').pop()).toBe('#小红书小工具[话题]# #公主请开球[话题]# #台球[话题]#');
  expect(draft.content).not.toContain('已经赢过');expect(draft.mediaInfo.image_resources).toHaveLength(1);
});

it('filters unknown names and deduplicates the full ten-opponent draft within platform limits', () => {
  const names=COMPANIONS.map(c=>c.name),draft=victoryNote('data:image/jpeg;base64,YQ==','practice',names[0],undefined,true,[...names,...names,'路过的人']);
  expect(draft.content).not.toContain('路过的人');
  for(const name of names)expect(draft.content.split(name)).toHaveLength(2);
  expect(draft.content.length).toBeLessThanOrEqual(1000);expect(draft.title.length).toBeLessThanOrEqual(20);
});

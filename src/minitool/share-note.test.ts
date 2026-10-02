import { afterEach, describe, expect, it, vi } from 'vitest';
import { miniToolApi, shareFailure, victoryNote } from './share-note';
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

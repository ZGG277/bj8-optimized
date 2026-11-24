/*
[INPUT]: 用户主动分享的整图首图、原卡与真实胜局对手名单
[OUTPUT]: 固定胜局标题、真实已赢姓名及带 #话题名[话题]# 的笔记正文；取消/失败可重试
[POS]: 小工具原生能力边界，只唤起笔记编辑页，不自动发布笔记或修改战绩
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { paintVictoryCard } from './victory-art';
import type { GameMode } from '../opponent/model';
import { COMPANIONS } from '../opponent/companions';

export type NoteDraft = {
  title: string;
  content: string;
  mediaInfo: { image_resources: { url: string }[] };
};
export type MiniToolApi = {
  postNote: (draft: NoteDraft) => Promise<{ errMsg: string }>;
  writeTempFile?: (options: { data: string }) => Promise<{ filePath: string }>;
};

export function miniToolApi(): MiniToolApi | undefined {
  if (typeof window === 'undefined') return undefined;
  const api = (window as Window & { xhs?: { miniTool?: MiniToolApi } }).xhs?.miniTool;
  return typeof api?.postNote === 'function' ? api : undefined;
}

export const NOTE_IMAGE_LIMIT = 18;

export function victoryNote(image: string, mode: GameMode, opponentName = '对手', extraImage?: string, won = true, defeatedNames: readonly string[] = [], chatImages: readonly string[] = []): NoteDraft {
  if (!/^data:image\/(png|jpeg);base64,/.test(image)) throw new Error('战绩卡生成失败，请重试。');
  if (extraImage !== undefined && !/^data:image\/(png|jpeg);base64,/.test(extraImage)) throw new Error('分享图片生成失败，请重试。');
  if (chatImages.some(url => !/^data:image\/(png|jpeg);base64,/.test(url))) throw new Error('对话截图生成失败，请重试。');
  const images = [image, ...(extraImage ? [extraImage] : []), ...chatImages];
  if (images.length > NOTE_IMAGE_LIMIT) throw new Error('分享图片最多18张。');
  const names = [...new Set([...defeatedNames, opponentName])].filter(name => COMPANIONS.some(c => c.name === name));
  const wins = names.length ? `本公主已经赢过${names.join('、')}啦！👑🎱` : '本公主又赢下一局啦！👑🎱';
  const topics = ['小红书小工具', '公主请开球', '台球'];
  if (won) topics.push(mode === 'challenge' ? '挑战模式' : '陪练模式');
  const topicLine = topics.map(topic => `#${topic}[话题]#`).join(' ');
  return {
    title: won ? '这一局公主又赢了' : '公主的赞美卡',
    content: won ? `${wins}\n公主宝宝好棒啊💕💕✨\n${topicLine}` : `在公主请开球和${opponentName}打了一局。\n${topicLine}`,
    mediaInfo: { image_resources: images.map(url => ({ url })) },
  };
}

/** Prefer the documented temporary-file bridge for larger generated cards. */
export async function postVictoryNote(api: MiniToolApi, image: string, mode: GameMode, opponentName = '对手', extraImage?: string, won = true, defeatedNames: readonly string[] = [], chatImages: readonly string[] = []) {
  const draft = victoryNote(image, mode, opponentName, extraImage, won, defeatedNames, chatImages);
  if (typeof api.writeTempFile === 'function') {
    for (const resource of draft.mediaInfo.image_resources) {
      const { filePath } = await api.writeTempFile({ data: resource.url });
      if (!filePath || /^https?:/i.test(filePath)) throw new Error('战绩卡暂时无法传递，请重试。');
      resource.url = filePath;
    }
  }
  return api.postNote(draft);
}

export function shareFailure(error: unknown): string {
  const message = typeof error === 'object' && error !== null && 'errMsg' in error
    ? String(error.errMsg) : error instanceof Error ? error.message : '';
  return /cancel|取消/i.test(message) ? '已取消分享，战绩卡仍保留在这里。' : '暂时未能完成分享，请重试。';
}

/** 只在胜局庆祝结束后绘制一次；不读取 WebGL，不改变存档。 */
export async function renderVictoryCard(mode: GameMode, shots?: number, opponentName = '对手'): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('战绩卡生成失败，请重试。');
  paintVictoryCard(ctx, mode, shots, undefined, opponentName);
  return canvas.toDataURL('image/jpeg', 0.9);
}

/** Open the note composer with the single page the player chose on the memory card. */
export async function postMemoryNote(api: MiniToolApi, image: string, opponentName: string) {
  if (!/^data:image\/(png|jpeg);base64,/.test(image)) throw new Error('回忆卡生成失败。');
  let url = image;
  if (api.writeTempFile) {
    const result = await api.writeTempFile({ data: image });
    if (!result.filePath || /^https?:/i.test(result.filePath)) throw new Error('回忆卡暂时无法传递。');
    url = result.filePath;
  }
  return api.postNote({
    title: '这局的球桌回忆卡',
    content: `和${opponentName}打了一局。\n#公主请开球[话题]# #台球[话题]#`,
    mediaInfo: { image_resources: [{ url }] },
  });
}

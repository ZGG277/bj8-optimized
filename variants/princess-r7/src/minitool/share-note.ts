/* 小工具原生能力边界：只由用户点击调用，不依赖外部 SDK 或网络。 */
import { paintVictoryCard } from './victory-art';
import type { GameMode } from '../opponent/model';

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

export function victoryNote(image: string, mode: GameMode): NoteDraft {
  if (!/^data:image\/(png|jpeg);base64,/.test(image)) throw new Error('战绩卡生成失败，请重试。');
  return {
    title: '这一局，我赢了！',
    content: `在公主请开球${mode === 'challenge' ? '挑战' : '陪练'}模式赢下谢不赢。\n从瞄准到落袋，认真打好每一杆。\n#公主请开球 #台球`,
    mediaInfo: { image_resources: [{ url: image }] },
  };
}

/** Prefer the documented temporary-file bridge for larger generated cards. */
export async function postVictoryNote(api: MiniToolApi, image: string, mode: GameMode) {
  const draft = victoryNote(image, mode);
  if (typeof api.writeTempFile === 'function') {
    const { filePath } = await api.writeTempFile({ data: image });
    if (!filePath || /^https?:/i.test(filePath)) throw new Error('战绩卡暂时无法传递，请重试。');
    draft.mediaInfo.image_resources[0].url = filePath;
  }
  return api.postNote(draft);
}

export function shareFailure(error: unknown): string {
  const message = typeof error === 'object' && error !== null && 'errMsg' in error
    ? String(error.errMsg) : error instanceof Error ? error.message : '';
  return /cancel|取消/i.test(message) ? '已取消分享，战绩卡仍保留在这里。' : '暂时未能完成分享，请重试。';
}

/** 只在胜局庆祝结束后绘制一次；不读取 WebGL，不改变存档。 */
export async function renderVictoryCard(mode: GameMode, shots?: number): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('战绩卡生成失败，请重试。');
  paintVictoryCard(ctx, mode, shots);
  return canvas.toDataURL('image/jpeg', 0.9);
}

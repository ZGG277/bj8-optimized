/* 小工具原生能力边界：只由用户点击调用，不依赖外部 SDK 或网络。 */
import type { GameMode } from '../opponent/model';

export type NoteDraft = {
  title: string;
  content: string;
  mediaInfo: { image_resources: { url: string }[] };
};
export type MiniToolApi = { postNote: (draft: NoteDraft) => Promise<{ errMsg: string }> };

export function miniToolApi(): MiniToolApi | undefined {
  if (typeof window === 'undefined') return undefined;
  const api = (window as Window & { xhs?: { miniTool?: MiniToolApi } }).xhs?.miniTool;
  return typeof api?.postNote === 'function' ? api : undefined;
}

export function victoryNote(image: string, mode: GameMode): NoteDraft {
  if (!/^data:image\/(png|jpeg);base64,/.test(image)) throw new Error('战绩卡生成失败，请重试。');
  return {
    title: '这一局，我赢了！',
    content: `在瓜瓜台球${mode === 'challenge' ? '挑战' : '陪练'}模式赢下顾燃。\n从瞄准到落袋，认真打好每一杆。\n#瓜瓜台球 #台球`,
    mediaInfo: { image_resources: [{ url: image }] },
  };
}

export function shareFailure(error: unknown): string {
  const message = typeof error === 'object' && error !== null && 'errMsg' in error
    ? String(error.errMsg) : error instanceof Error ? error.message : '';
  return /cancel|取消/i.test(message) ? '已取消分享，战绩卡仍保留在这里。' : '暂时未能完成分享，请重试。';
}

/** 独立绘制战绩卡，避免为了截图让 WebGL 持续保留帧缓冲。 */
export function renderVictoryCard(mode: GameMode): string {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 960;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('战绩卡生成失败，请重试。');
  ctx.fillStyle = '#101f1a'; ctx.fillRect(0, 0, 720, 960);
  ctx.strokeStyle = '#476452'; ctx.lineWidth = 2; ctx.strokeRect(34, 34, 652, 892);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9be3bc'; ctx.font = '26px sans-serif'; ctx.fillText('瓜 瓜 台 球', 360, 108);
  ctx.fillStyle = '#faf4e4'; ctx.font = 'bold 70px sans-serif'; ctx.fillText('这一局，我赢了', 360, 230);
  ctx.fillStyle = '#adc5b7'; ctx.font = '28px sans-serif';
  ctx.fillText(`${mode === 'challenge' ? '挑战' : '陪练'}模式 · 战胜顾燃`, 360, 292);
  ctx.fillStyle = '#357b59'; ctx.fillRect(136, 370, 448, 350);
  ctx.strokeStyle = '#a38458'; ctx.lineWidth = 18; ctx.strokeRect(136, 370, 448, 350);
  for (const x of [136, 584]) for (const y of [370, 545, 720]) {
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fillStyle = '#0b1510'; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(384, 524, 68, 0, Math.PI * 2); ctx.fillStyle = '#121917'; ctx.fill();
  ctx.beginPath(); ctx.arc(384, 524, 32, 0, Math.PI * 2); ctx.fillStyle = '#faf4e4'; ctx.fill();
  ctx.fillStyle = '#17221b'; ctx.font = 'bold 42px sans-serif'; ctx.fillText('8', 384, 539);
  ctx.beginPath(); ctx.arc(268, 636, 26, 0, Math.PI * 2); ctx.fillStyle = '#faf4e4'; ctx.fill();
  ctx.fillStyle = '#faf4e4'; ctx.font = '30px sans-serif'; ctx.fillText('认真打好每一杆', 360, 822);
  ctx.fillStyle = '#adc5b7'; ctx.font = '22px sans-serif'; ctx.fillText('中式八球 · 我的胜局记录', 360, 875);
  return canvas.toDataURL('image/jpeg', 0.88);
}

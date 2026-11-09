/*
[INPUT]: 包内生成的近景球桌底图、本局已获头像/赞美句与统一字体门禁
[OUTPUT]: 1080x1440整图封面；同一图片供分享预览和原生笔记首图
[POS]: 确定性Canvas合成，不抽句子、不读WebGL、不改卡册或胜负记录
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { canvasFont, ensureUiFont } from '../typography';
import { loadCardImage } from './match-card';
import coverBase from '../assets/princess-share-closeup-no-hand-20261106.jpg';

export const SHARE_COVER_SIZE = { width: 1080, height: 1440 } as const;
const covers = new Map<string, Promise<string>>();
export function renderShareCover(avatar: string, name: string, praise: string): Promise<string> {
  if (!praise.trim() || Array.from(praise).length > 10) return Promise.reject(new Error('分享封面文案暂未准备好。'));
  const key = JSON.stringify([avatar, name, praise]);
  const cached = covers.get(key);
  if (cached) return cached;
  const drawing = drawCover(avatar, name, praise).catch(error => { covers.delete(key); throw error; });
  covers.set(key, drawing);
  if (covers.size > 12) covers.delete(covers.keys().next().value!);
  return drawing;
}

async function drawCover(avatar: string, name: string, praise: string): Promise<string> {
  const [base, portrait] = await Promise.all([loadCardImage(coverBase), loadCardImage(avatar), ensureUiFont()]);
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_COVER_SIZE.width; canvas.height = SHARE_COVER_SIZE.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('分享封面暂未准备好，请重试。');
  const scale = Math.max(canvas.width / base.naturalWidth, canvas.height / base.naturalHeight);
  const w = base.naturalWidth * scale, h = base.naturalHeight * scale;
  ctx.drawImage(base, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);

  // A light full-width wash blends the accurate overlay into the generated sky, without a card panel.
  const light = ctx.createLinearGradient(0, 0, 0, 410);
  light.addColorStop(0, '#fff7e8a6'); light.addColorStop(.68, '#fff8ec55'); light.addColorStop(1, '#fff8ec00');
  ctx.fillStyle = light; ctx.fillRect(0, 0, 1080, 410);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#7b6039'; ctx.font = canvasFont(27); ctx.fillText('公主请开球', 72, 64);

  const x = 160, y = 194, radius = 77;
  ctx.save(); ctx.shadowColor = '#6e462744'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#fff9e9'; ctx.beginPath(); ctx.arc(x, y, radius + 9, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.clip();
  const side = Math.min(portrait.naturalWidth, portrait.naturalHeight);
  ctx.drawImage(portrait, (portrait.naturalWidth - side) / 2, (portrait.naturalHeight - side) / 2, side, side, x - radius, y - radius, radius * 2, radius * 2); ctx.restore();
  ctx.strokeStyle = '#c4a568'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, radius + 8, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#765c36'; ctx.font = canvasFont(30); ctx.fillText(name, 274, 153);
  ctx.fillStyle = '#34594a'; ctx.font = canvasFont(49);
  ctx.save(); ctx.shadowColor = '#fffaf0'; ctx.shadowBlur = 12; ctx.fillText(praise, 272, 222, 730); ctx.restore();
  ctx.strokeStyle = '#bfa67499'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(274, 272); ctx.lineTo(600, 272); ctx.stroke();
  return canvas.toDataURL('image/jpeg', .88);
}

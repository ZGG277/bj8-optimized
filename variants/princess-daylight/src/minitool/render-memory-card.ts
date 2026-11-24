import { MEMORY_BUBBLE_COLORS, MEMORY_CARD_SIZE, MEMORY_CHAT, MEMORY_SCORE_LIFT, WARM_BALL_COLORS, memoryBubbleWidth, resultStatus, scoreGroups, type MatchMemoryCard, type MemoryFrame, type MemoryPage } from '../match/memory-card';
import { canvasFont, ensureUiFont } from '../typography';
import { loadCardImage } from './match-card';

const frames = import.meta.glob<string>('../assets/memory-frames/*.webp', { eager: true, import: 'default' });
export const memoryFrameAsset = (frame: MemoryFrame) => frames[`../assets/memory-frames/${frame}.webp`];
export type MemoryPortraits = { opponent: string; player: string };

export function memoryTextMeasure(context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')) {
  if (!context) return (text: string) => Array.from(text).length * MEMORY_CHAT.font;
  return (text: string) => {
    context.font = canvasFont(MEMORY_CHAT.font);
    context.textAlign = 'left';
    const metrics = context.measureText(text);
    return Math.max(metrics.width, metrics.actualBoundingBoxRight || 0) + Math.max(0, metrics.actualBoundingBoxLeft || 0);
  };
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
}

function portrait(ctx: CanvasRenderingContext2D, image: HTMLImageElement | null, left: number, top: number, size: number) {
  ctx.save();
  circle(ctx, left + size/2, top + size/2, size/2);
  ctx.fillStyle = '#e2d4ad';
  ctx.fill();
  if (image?.naturalWidth && image.naturalHeight) {
    ctx.clip();
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    ctx.drawImage(image, (image.naturalWidth - side)/2, (image.naturalHeight - side)/2, side, side, left, top, size, size);
  }
  ctx.restore();
  circle(ctx, left + size/2, top + size/2, size/2 - .5);
  ctx.strokeStyle = '#b99b62';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function roundBox(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function paintRack(ctx: CanvasRenderingContext2D, card: MatchMemoryCard, left: number, numbers: readonly number[]) {
  numbers.forEach((number, index) => {
    const x = left + 13 * index;
    const group = card.score.group;
    const active = card.score.active.includes(number);
    const color = WARM_BALL_COLORS[number < 8 ? number - 1 : number - 9];
    ctx.save();
    ctx.globalAlpha = group && !active ? .22 : 1;
    circle(ctx, x, 94, group ? 4.6 : 2);
    ctx.fillStyle = group ? color : '#c4baa3';
    ctx.fill();
    if (group && number > 8) {
      ctx.clip();
      ctx.fillStyle = '#fff8df';
      ctx.fillRect(x - 5, 92.5, 10, 3);
    }
    ctx.restore();
  });
}

export function remainingLabel(card: MatchMemoryCard, numbers: readonly number[]) {
  return card.score.group ? `余 ${numbers.filter(number => card.score.active.includes(number)).length} 球` : '未分组';
}

const memoryCardNotes = { background: '#faf2e2', divider: '#d7c292', text: '#2c493c', gold: '#806130', footer: '#88764e' } as const;

export async function renderMemoryCard(card: MatchMemoryCard, pages: MemoryPage[], pageIndex: number, portraits: MemoryPortraits) {
  const background = memoryFrameAsset(card.frame);
  const safeImage = (src?: string) => src ? loadCardImage(src).catch(() => null) : Promise.resolve(null);
  const [frame, opponent, player] = await Promise.all([
    safeImage(background), safeImage(portraits.opponent), safeImage(portraits.player), ensureUiFont(),
  ]);
  const { width, height, exportScale } = MEMORY_CARD_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = width * exportScale;
  canvas.height = height * exportScale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('回忆卡生成失败。');
  ctx.scale(exportScale, exportScale);
  ctx.fillStyle = memoryCardNotes.background;
  ctx.fillRect(0, 0, width, height);
  if (frame) ctx.drawImage(frame, 0, 0, width, height);
  else {
    ctx.strokeStyle = memoryCardNotes.divider;
    ctx.strokeRect(8.5, 8.5, width - 17, height - 17);
    ctx.strokeRect(12.5, 12.5, width - 25, height - 25);
  }
  const write = (text: string, x: number, y: number, font: number, color: string, max?: number, align: CanvasTextAlign = 'center') => {
    ctx.font = canvasFont(font);
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    if (max === undefined) ctx.fillText(text, x, y);
    else ctx.fillText(text, x, y, max);
  };
  const { opponent: away, player: home } = scoreGroups(card.score.group);
  ctx.save();
  ctx.translate(0, -MEMORY_SCORE_LIFT);
  write(card.opponentName, 100, 70, 14, memoryCardNotes.text, 126);
  write(card.playerName, 260, 70, 14, memoryCardNotes.text, 126);
  portrait(ctx, opponent, 26, 79, 30);
  portrait(ctx, player, 304, 79, 30);
  paintRack(ctx, card, 66, away);
  paintRack(ctx, card, 216, home);
  circle(ctx, 180, 94, 9);
  ctx.fillStyle = card.score.active.includes(8) ? '#38453c' : '#716e61';
  ctx.fill();
  write('8', 180, 94, 10, '#fff5d7');
  write(remainingLabel(card, away), 100, 118, 12, memoryCardNotes.footer);
  write(remainingLabel(card, home), 260, 118, 12, memoryCardNotes.footer);
  write(resultStatus(card), 180, 123, 13, memoryCardNotes.gold, 86);
  ctx.fillStyle = memoryCardNotes.divider;
  ctx.fillRect(34, 141, 292, 1);
  ctx.restore();
  const page = pages[pageIndex] ?? pages[0] ?? [];
  const measure = memoryTextMeasure(ctx);
  for (const bubble of page) {
    const { left, top, paddingX, paddingY, step, font, radius } = MEMORY_CHAT;
    const color = MEMORY_BUBBLE_COLORS[bubble.side];
    const width = memoryBubbleWidth(bubble.rows, measure);
    const x = left + (bubble.side === 'player' ? MEMORY_CHAT.width - width : 0);
    ctx.fillStyle = color.background;
    roundBox(ctx, x, top + bubble.y, width, bubble.height, radius);
    ctx.fill();
    bubble.rows.forEach((row, index) => {
      write(row, x + paddingX, top + bubble.y + paddingY + (index + .5) * step, font, color.text, width - 2 * paddingX, 'left');
    });
  }
  if (!page.length) write(card.reason || '这页没有对话', 180, 256, 15, memoryCardNotes.footer, 250);
  write(pages.length > 1 ? `公主请开球 · ${pageIndex + 1} / ${pages.length}` : '公主请开球', 180, 458, 12, memoryCardNotes.footer);
  return canvas.toDataURL('image/jpeg', .94);
}

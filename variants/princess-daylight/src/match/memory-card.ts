import type { ObjectGroup } from './types';

export const MEMORY_FRAMES = ['ribbon', 'camellia', 'fern', 'lily', 'laurel', 'pearls', 'orchid', 'aster', 'acanthus', 'clover'] as const;
export type MemoryFrame = typeof MEMORY_FRAMES[number];

export const MEMORY_CARD_SIZE = { width: 360, height: 480, exportScale: 3 } as const;
export const MEMORY_SCORE_LIFT = 22;
export const MEMORY_CHAT = {
  left: 34, top: 131, width: 292, height: 308, font: 13, step: 20, radius: 9,
  paddingX: 12, paddingY: 8, rowGap: 8, pageInset: 2, maxText: 236,
} as const;
export const MEMORY_BUBBLE_COLORS = {
  opponent: { background: '#fffcf5', text: '#2c493c' },
  player: { background: '#315747', text: '#fff8e9' },
} as const;

export const SOLID_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const;
export const STRIPE_NUMBERS = [9, 10, 11, 12, 13, 14, 15] as const;
export const WARM_BALL_COLORS = ['#daa438', '#547bc3', '#bc5060', '#8664b0', '#d88246', '#4e9a79', '#914859'];
export type CardScore = { group: ObjectGroup | null; active: readonly number[] };
export type MemoryLine = { id: number; side: 'player' | 'opponent'; text: string };
export type MatchMemoryCard = {
  id: string;
  finishedAt: number;
  frame: MemoryFrame;
  winner: 'player' | 'opponent' | null;
  opponentId: string;
  opponentName: string;
  playerName: string;
  score: CardScore;
  reason?: string;
  lines: readonly MemoryLine[];
};

export function scoreGroups(group: ObjectGroup | null) {
  return group === 'stripe' ? { opponent: SOLID_NUMBERS, player: STRIPE_NUMBERS }
    : { opponent: STRIPE_NUMBERS, player: SOLID_NUMBERS };
}

export function pickMemoryFrame(random = Math.random): MemoryFrame {
  return MEMORY_FRAMES[Math.min(MEMORY_FRAMES.length - 1, Math.max(0, Math.floor(random() * MEMORY_FRAMES.length)))] ?? MEMORY_FRAMES[0];
}

export function resultStatus(card: Pick<MatchMemoryCard, 'winner' | 'opponentName'>) {
  return card.winner === 'player' ? '你赢了' : card.winner === 'opponent' ? `${card.opponentName}胜` : '本局结束';
}

export type PositionedBubble = MemoryLine & { rows: string[]; x: number; y: number; width: number; height: number };
export type MemoryPage = PositionedBubble[];

const openingPunctuation = /^[（【〔《〈“‘「『(\[]$/u;
const closingPunctuation = /^[，。！？、；：）》〉】〕”’」』…％%）,.;:!?\]\)]$/u;

function wrapRows(text: string, measure: (text: string) => number): string[] {
  const units: string[] = [];
  let opening = '';
  for (const character of text) {
    if (openingPunctuation.test(character)) {
      opening += character;
    } else if (closingPunctuation.test(character) && !opening && units.length) {
      units[units.length - 1] += character;
    } else {
      units.push(opening + character);
      opening = '';
    }
  }
  if (opening) units.push(opening);
  const rows: string[] = [];
  let row = '';
  for (const unit of units) {
    // A deliberately long run of punctuation still has to fit without losing characters.
    const chunks = measure(unit) > MEMORY_CHAT.maxText ? Array.from(unit) : [unit];
    for (const chunk of chunks) {
      if (row && measure(row + chunk) > MEMORY_CHAT.maxText) { rows.push(row); row = ''; }
      row += chunk;
    }
  }
  if (row) rows.push(row);
  return rows;
}

export function memoryBubbleWidth(rows: readonly string[], measure: (text: string) => number) {
  return Math.min(MEMORY_CHAT.maxText, Math.ceil(Math.max(...rows.map(measure)))) + 2 * MEMORY_CHAT.paddingX;
}

// The wrapped rows and page breaks drive both the browser card and JPEG.
export function layoutMemoryPages(lines: readonly MemoryLine[], measure: (text: string) => number): MemoryPage[] {
  const layout = MEMORY_CHAT;
  const pages: MemoryPage[] = [[]];
  // Keep the next page's first bubble below the scroll clip's subpixel edge.
  let cursor: number = layout.pageInset;
  for (const line of lines) {
    const text = line.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const rows = wrapRows(text, measure);
    const rowsPerBubble = Math.floor((layout.height - layout.pageInset - 2 * layout.paddingY) / layout.step);
    for (let offset = 0; offset < rows.length; offset += rowsPerBubble) {
      const segment = rows.slice(offset, offset + rowsPerBubble);
      const width = memoryBubbleWidth(segment, measure);
      const height = segment.length * layout.step + 2 * layout.paddingY;
      if (cursor + height > layout.height) {
        pages.push([]);
        cursor = layout.pageInset;
      }
      const x = line.side === 'player' ? layout.width - width : 0;
      pages[pages.length - 1].push({ ...line, rows: segment, x, y: cursor, width, height });
      cursor += height + layout.rowGap;
    }
  }
  return pages;
}

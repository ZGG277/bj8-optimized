import { MEMORY_FRAMES, type MatchMemoryCard } from '../match/memory-card';
import { confirmGameStorage, gameStorage, type SaveStore } from './persistent-storage';

export const MEMORY_CARDS_KEY = 'princess-billiards:match-memory-cards:v1';

function decodeMemoryCards(raw: string | null): MatchMemoryCard[] {
  if (raw === null) return [];
  const decoded = JSON.parse(raw);
  if (!Array.isArray(decoded) || decoded.some(card => !card || typeof card.id !== 'string' ||
    !Number.isFinite(card.finishedAt) || !MEMORY_FRAMES.includes(card.frame) ||
    typeof card.opponentId !== 'string' || typeof card.opponentName !== 'string' || typeof card.playerName !== 'string' ||
    ![null, 'player', 'opponent'].includes(card.winner) ||
    !card.score || ![null, 'solid', 'stripe'].includes(card.score.group) || !Array.isArray(card.score.active) ||
    card.score.active.some((value: unknown) => !Number.isInteger(value) || Number(value) < 0 || Number(value) > 15) ||
    !Array.isArray(card.lines) || card.lines.some((line: MatchMemoryCard['lines'][number]) => !line ||
      !Number.isSafeInteger(line.id) || typeof line.text !== 'string' || !['player', 'opponent'].includes(line.side)))) {
    throw new Error('回忆卡读取失败。');
  }
  return decoded as MatchMemoryCard[];
}

export function loadMemoryCards(store: SaveStore | null = gameStorage()) {
  return decodeMemoryCards(store?.getItem(MEMORY_CARDS_KEY) ?? null);
}

export async function saveMemoryCard(card: MatchMemoryCard) {
  const store = gameStorage();
  if (!store) throw new Error('回忆卡暂未保存。');
  const cards = loadMemoryCards(store);
  const index = cards.findIndex(existing => existing.id === card.id);
  if (index < 0) cards.push(card);
  else cards[index] = card;
  const raw = JSON.stringify(cards);
  if (new Blob([JSON.stringify(raw)]).size > 950_000) throw new Error('回忆卡册已满。仍可以分享这一页。');
  if (store.getItem(MEMORY_CARDS_KEY) !== raw) store.setItem(MEMORY_CARDS_KEY, raw);
  await confirmGameStorage(MEMORY_CARDS_KEY);
}

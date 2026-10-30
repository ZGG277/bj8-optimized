/** Fifty independent lines. Draw only at the guarded win settlement, never on share/render. */
import type { SaveStore } from '../minitool/persistent-storage';
export const VICTORY_PRAISE_KEY = 'princess-billiards:victory-praise:v1';
export const VICTORY_PRAISES = ["这一杆真漂亮", "这局赢得漂亮", "好球为你喝彩", "稳稳拿下这一局", "出手就是好球", "这一球恰到好处", "球路清楚出手干净", "轻轻一杆稳稳入袋", "好球自会替你说话", "你的节奏刚刚好", "这一局打得从容", "漂亮走位漂亮收官", "这一杆值得掌声", "稳准之间尽是风采", "公主出手果然不凡", "这份准头我服了", "今天手感真不错", "这一球进得干净", "这局你打得真好", "越打越有自己的节奏", "这一杆又稳又准", "漂亮收下这一局", "好眼力配好准头", "认真出手自有回响", "这局是你的主场", "每一杆都有章法", "这一球够漂亮", "你的好球我记住了", "稳住节奏就能赢", "这份耐心值得喝彩", "关键一杆稳稳拿下", "收官这一杆真好", "今天的你状态正好", "打得漂亮赢得从容", "清清爽爽拿下胜局", "好走位就有好结果", "这一下真有准头", "球路尽在你掌握", "越打越稳越打越好", "这一局值得珍藏", "公主的好球有目共睹", "细细瞄准稳稳进球", "不慌不忙也能赢", "这局赢得有章有法", "这一杆打得利落", "好球都在你的节奏里", "你的专注很动人", "这一局为你鼓掌", "从容出杆漂亮进球", "下一杆也值得期待"] as const;
export type PraiseDeck = { remaining: number[]; last: number | null };
let memory: PraiseDeck = { remaining: [], last: null };
export function drawVictoryPraise(deck: PraiseDeck, rng: () => number = Math.random): { text: string; deck: PraiseDeck } {
  const remaining = [...deck.remaining];
  if (!remaining.length) {
    for (let i = 0; i < VICTORY_PRAISES.length; i++) remaining.push(i);
    for (let i = remaining.length - 1; i > 0; i--) {
      const roll = rng();
      const j = Math.floor((Number.isFinite(roll) ? Math.max(0, Math.min(.999999999, roll)) : 0) * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    if (remaining[remaining.length - 1] === deck.last) [remaining[0], remaining[remaining.length - 1]] = [remaining[remaining.length - 1], remaining[0]];
  }
  const last = remaining.pop()!;
  return { text: VICTORY_PRAISES[last], deck: { remaining, last } };
}
export function nextVictoryPraise(store: SaveStore | null): string {
  let deck = memory;
  try {
    const raw = store?.getItem(VICTORY_PRAISE_KEY);
    const value = raw ? JSON.parse(raw) : null;
    if (value && Array.isArray(value.remaining) && value.remaining.length <= 50 && new Set(value.remaining).size === value.remaining.length &&
      value.remaining.every((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < 50) &&
      (value.last === null || Number.isInteger(value.last) && value.last >= 0 && value.last < 50) && !value.remaining.includes(value.last)) deck = value;
  } catch { /* Missing/unavailable storage uses this session's deck without clearing old data. */ }
  const next = drawVictoryPraise(deck); memory = next.deck;
  try { store?.setItem(VICTORY_PRAISE_KEY, JSON.stringify(next.deck)); } catch { /* Remain playable. */ }
  return next.text;
}

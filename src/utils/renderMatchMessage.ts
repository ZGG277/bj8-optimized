/*
[INPUT]: 依赖 match/types 中的 MatchMessageKey / MatchMessageParams / MatchState 类型
[OUTPUT]: 对外提供 renderMatchMessage 纯函数，将规则层消息键+参数映射为中文文案
[POS]: UI 渲染层，只做文案映射；不依赖 React、DOM 或对局状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import type { MatchState } from '../match/types';

/** 规则层只给 messageKey + params，中文文案统一在这里渲染 */
export function renderMatchMessage(m: MatchState): string {
  const { actor, count, group, reason, target } = m.messageParams;
  const name = actor === 'player' ? '你' : '顾燃';
  const other = actor === 'player' ? '顾燃' : '你';
  switch (m.messageKey) {
    case 'break-start': return '开球：正中1号球，把力量送到八成';
    case 'rolling': return '球在运动中...';
    case 'pot-continue': return `${name}${count && count > 1 ? `${count}颗球进` : '进球'}，继续`;
    case 'miss-turn': return `${name}未进球，${other}的回合`;
    case 'opponent-pot-turn': return `${name}只进了对方花色，${other}的回合`;
    case 'group-assigned': return `${group === 'solid' ? '全色球' : '花色球'}，${name}的回合`;
    case 'foul': {
      const r = reason === 'scratch' ? '白球落袋'
        : reason === 'no-contact' ? '未碰到球'
        : reason === 'wrong-first' ? '首碰非法球' : '碰球后未碰库';
      return actor === 'player'
        ? `${name}犯规，${r}，顾燃获得自由球`
        : `${name}犯规，${r}，你的自由球，点击台面放置白球`;
    }
    case 'win-8': return `8号球入袋，${actor === 'player' ? '你赢了！' : '顾燃赢了'}`;
    case 'lose-8-foul': return `犯规打8号球，${actor === 'player' ? '你输了' : '顾燃输了'}`;
    case 'lose-8-early': return `8号球提前入袋，${actor === 'player' ? '你输了' : '顾燃输了'}`;
    case 'ai-choice': return `顾燃选择${target}号球`;
    case 'ai-safe': return '顾燃选择安全球';
    case 'placing-freeball': return '你的自由球，点击台面放置白球';
    case 'placing-break': return '开球：点击开球区放置白球';
    case 'break-ready': return '白球已在标准位，按住白球可调整';
    case 'placed': return '白球已放置，你的回合';
    case 'place-occupied': return '位置被占用，请选择其他位置';
    case 'place-near-pocket': return '不能放在袋口附近';
    case 'place-outside-kitchen': return '开球时白球必须放在开球区';
  }
}

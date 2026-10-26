import { companionFor } from '../opponent/companions';
import type { MatchState, FoulReason } from './types';

const foulText: Record<FoulReason, string> = {
  scratch: '白球落袋', 'no-contact': '没有碰到目标球',
  'wrong-first': '先碰到了不属于本杆的球', 'no-cushion': '碰球后没有进球或碰库',
};
export function turnDescription(match: MatchState, eightReady = false): string {
  const opponentName = companionFor(match.companionId).name;
  if (match.phase === 'finished') return '';
  if (match.phase === 'placing') {
    if (match.messageKey === 'place-occupied') return '这里有球，换一处放白球';
    if (match.messageKey === 'place-near-pocket') return '离袋口太近，往台面里放一点';
    return '对手犯规 · 点台面放好白球';
  }
  if (match.phase === 'rolling') return match.actor === 'player' ? '等球停稳，再来下一杆'
    : match.messageKey === 'foul' ? `${foulText[match.messageParams.reason ?? 'no-contact']} · ${opponentName}出杆中` : `${opponentName}出杆中`;
  if (match.actor === 'opponent') return match.messageKey === 'foul'
    ? `${foulText[match.messageParams.reason ?? 'no-contact']} · 对手自由球` : `轮到${opponentName}，稍等一下`;
  if (match.breaking) return '公主请开球';
  if (eightReady) return '本组球已清空 · 现在打8号';
  if (match.messageKey === 'pot-continue') return '进球了，公主继续';
  const group = match.playerGroup === 'solid' ? '全色球' : match.playerGroup === 'stripe' ? '白腰带球' : '开放球局';
  return `轮到公主 · ${group}`;
}
export function finishReason(match: MatchState): string {
  const opponentName = companionFor(match.companionId).name;
  const actor = match.messageParams.actor === 'opponent' ? opponentName : '公主';
  if (match.messageKey === 'lose-8-early') return `${actor}还没清空本组球，8号已落袋。`;
  if (match.messageKey === 'lose-8-foul') return `${actor}打进8号，但${foulText[match.messageParams.reason ?? 'no-contact']}。`;
  if (match.messageKey === 'win-8') return `${actor}清空本组球，稳稳收下8号。`;
  return '';
}

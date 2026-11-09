/**
 * [INPUT]: 已结算规则事实和当前操作教学。
 * [OUTPUT]: 陪练第一人称的规则与操作台词，事实优先于随机鼓励。
 * [POS]: 呈现层，不改变球规或教学进度。
 * [PROTOCOL]: 变更时同步 opponent/CLAUDE.md。
 */
import type { FoulReason, MatchState, ShotFacts } from '../match/types';
import type { CompanionDialogue } from './companion-dialogue';

type RuleLines = { sceneId: string; lines: readonly string[] };

export function groupInstruction(group: MatchState['playerGroup']): string | null {
  if (group === 'solid') return '公主这局打全色球，1到7号，我打花色。';
  if (group === 'stripe') return '公主这局打花色球，9到15号，我打全色。';
  return null;
}

const playerFouls: Record<FoulReason, RuleLines> = {
  scratch: { sceneId: 'P_SCRATCH', lines: [
    '公主白球进袋啦，该我打咯，承让承让。',
    '白球也溜进袋了，公主，这杆换我啦。',
    '公主的白球落袋了，我来摆球出杆。',
  ] },
  'no-contact': { sceneId: 'P_NO_CONTACT', lines: [
    '公主这杆没碰到球，换我打一杆啦。',
    '白球这趟没碰上球，公主，先让我来。',
  ] },
  'wrong-first': { sceneId: 'P_WRONG_FIRST', lines: [
    '公主先碰错球啦，该我打咯。',
    '公主这杆先碰错了，接下来我打。',
  ] },
  'no-cushion': { sceneId: 'P_FOUL_OTHER', lines: [
    '碰球后没进球也没碰库，这杆换我啦。',
    '公主，这杆碰球后没进也没碰库，我来接。',
  ] },
};

const opponentFouls: Record<FoulReason, RuleLines> = {
  scratch: { sceneId: 'N_SCRATCH', lines: [
    '哎，我把白球打进袋了，公主来摆球。',
    '白球跟着我进袋啦，公主，你来摆白球。',
  ] },
  'no-contact': { sceneId: 'N_FOUL_OTHER', lines: ['我这杆没碰到球，公主来摆白球。'] },
  'wrong-first': { sceneId: 'N_FOUL_OTHER', lines: ['我先碰错球啦，公主来摆白球。'] },
  'no-cushion': { sceneId: 'N_FOUL_OTHER', lines: ['我碰球后没进也没碰库，公主来摆白球。'] },
};

export function ruleLinesForShot(before: MatchState, facts: ShotFacts, next: MatchState): RuleLines | null {
  if (next.messageKey === 'group-assigned') {
    const text = groupInstruction(next.playerGroup);
    return text ? { sceneId: 'GROUP_ASSIGNED', lines: [text] } : null;
  }
  if (next.messageKey === 'foul') {
    const reason = next.messageParams.reason;
    if (!reason) return null;
    if (before.actor === 'opponent') return opponentFouls[reason];
    if (reason === 'wrong-first') {
      const hit = facts.firstContact;
      const hitGroup = hit !== null && hit >= 1 && hit <= 7 ? 'solid'
        : hit !== null && hit >= 9 && hit <= 15 ? 'stripe' : null;
      if (before.playerGroup && hitGroup && hitGroup !== before.playerGroup) {
        return { sceneId: 'P_WRONG_FIRST', lines: [
          '公主先碰到我的球啦，该我打咯。',
          '公主这杆先碰了我的球，换我来啦。',
        ] };
      }
      if (hit === 8) return { sceneId: 'P_WRONG_FIRST', lines: ['公主先碰黑八啦，这杆换我咯。'] };
    }
    return playerFouls[reason];
  }
  if (next.messageKey === 'opponent-pot-turn') {
    return before.actor === 'player'
      ? { sceneId: 'P_OPPONENT_ONLY', lines: ['公主帮我把球送进袋了，这杆轮到我啦。', '我的球先下班了，该我打咯。'] }
      : { sceneId: 'N_PLAYER_ONLY', lines: ['我把公主的球带进袋啦，换你打。', '这杆进的是公主的球，到你啦。'] };
  }
  return null;
}

const foulDetails: Record<FoulReason, string> = {
  scratch: '白球也进袋了',
  'no-contact': '没碰到球',
  'wrong-first': '先碰错了球',
  'no-cushion': '碰球后没进球也没碰库',
};

export function terminalFoulInstruction(match: MatchState): string | null {
  const { reason, actor } = match.messageParams;
  if (match.messageKey !== 'lose-8-foul' || !reason || !actor) return null;
  const detail = foulDetails[reason];
  return actor === 'opponent' ? `我这杆${detail}，这局归公主啦。` : `公主这杆${detail}，咱们下局再来。`;
}

export function companionInstruction({ match, prioritySpeech, guide, view, eightReady = false }: {
  match: MatchState;
  prioritySpeech?: CompanionDialogue | null;
  guide?: string | null;
  view?: string | null;
  eightReady?: boolean;
}): CompanionDialogue | null {
  if (match.phase === 'finished') return null;
  const line = (sceneId: string, text: string) => ({ sceneId, text, id: -1, companionId: match.companionId });
  if (match.phase === 'placing' && match.messageKey.startsWith('place-')) {
    if (match.messageKey === 'place-occupied') return line('PLACE_CORRECTION', '这儿有球呢，公主换个位置放。');
    if (match.messageKey === 'place-near-pocket') return line('PLACE_CORRECTION', '离袋口远一点，往台面里放。');
    return line('PLACE_CORRECTION', '公主，白球放回开球区就好。');
  }
  if (prioritySpeech) return prioritySpeech;
  if (guide) return line('CONTROL_GUIDE', guide);
  if (view) return line('VIEW_GUIDE', view);
  if (match.phase === 'placing') return line('FREE_BALL', '公主，拖着光圈，挑个位置放白球。');
  if (eightReady && match.actor === 'player' && match.phase === 'aiming') {
    return line('EIGHT_READY', '公主清完啦，下一杆打黑八。');
  }
  return null;
}

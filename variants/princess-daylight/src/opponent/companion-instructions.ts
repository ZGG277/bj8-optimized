import { companionVoiceId } from './companion-preferences';
/**
 * [INPUT]: 已结算规则事实和当前操作教学。
 * [OUTPUT]: 陪练第一人称的规则、操作台词与代进球反馈，事实优先于随机鼓励。
 * [POS]: 呈现层，不改变球规或教学进度。
 * [PROTOCOL]: 变更时同步 opponent/CLAUDE.md。
 */
import type { FoulReason, MatchState, ShotFacts } from '../match/types';
import { groupOfNumber, oppositeGroup } from '../match/match-machine';
import type { CompanionDialogue } from './companion-dialogue';
import { companionVoice } from './companion-voices';
import { VOICE_OPPONENT_BALL_POTTED, VOICE_RULE_TURNS } from './companion-voice-variations';

type RuleLines = { sceneId: string; lines: readonly string[] };

export function groupInstruction(group: MatchState['playerGroup']): string | null {
  if (group === 'solid') return '你这局打全色球，1到7号，我打花色。';
  if (group === 'stripe') return '你这局打花色球，9到15号，我打全色。';
  return null;
}

const playerFouls: Record<FoulReason, RuleLines> = {
  scratch: { sceneId: 'P_SCRATCH', lines: [
    '你的白球进袋啦，该我打咯，承让承让。',
    '白球也溜进袋了，这杆换我啦。',
    '你的白球落袋了，我来摆球出杆。',
  ] },
  'no-contact': { sceneId: 'P_NO_CONTACT', lines: [
    '你这杆没碰到球，换我打一杆啦。',
    '白球这趟没碰上球，先让我来。',
  ] },
  'wrong-first': { sceneId: 'P_WRONG_FIRST', lines: [
    '你先碰错球啦，该我打咯。',
    '你这杆先碰错了，接下来我打。',
  ] },
  'no-cushion': { sceneId: 'P_FOUL_OTHER', lines: [
    '碰球后没进球也没碰库，这杆换我啦。',
    '这杆碰球后没进也没碰库，我来接。',
  ] },
};

const opponentFouls: Record<FoulReason, RuleLines> = {
  scratch: { sceneId: 'N_SCRATCH', lines: [
    '哎，我把白球打进袋了，你来摆球。',
    '白球跟着我进袋啦，你来摆白球。',
  ] },
  'no-contact': { sceneId: 'N_FOUL_OTHER', lines: ['我这杆没碰到球，你来摆白球。'] },
  'wrong-first': { sceneId: 'N_FOUL_OTHER', lines: ['我先碰错球啦，你来摆白球。'] },
  'no-cushion': { sceneId: 'N_FOUL_OTHER', lines: ['我碰球后没进也没碰库，你来摆白球。'] },
};

function playerPottedOpponentBall(before: MatchState, facts: ShotFacts, next: MatchState): RuleLines | null {
  if (before.actor !== 'player' || before.breaking || !before.playerGroup || next.phase === 'finished') return null;
  const otherGroup = oppositeGroup(before.playerGroup);
  if (!facts.pocketed.some(number => groupOfNumber(number) === otherGroup)) return null;
  const reactions = VOICE_OPPONENT_BALL_POTTED[companionVoiceId(before.companionId) ?? ''] ??
    ['你帮我进球啦，谢谢！', '你顺手送我一球啦。'];
  const deliver = (sceneId: string, ending: string) => ({ sceneId, lines: reactions.map(line => line + ending) });
  switch (next.messageKey) {
    case 'foul':
      if (next.messageParams.reason === 'scratch') return deliver('P_SCRATCH', '白球也进袋，换我。');
      if (next.messageParams.reason === 'wrong-first') {
        return deliver('P_WRONG_FIRST', facts.firstContact === 8 ? '先碰了黑八，换我。' : '先碰错球，换我。');
      }
      return null;
    case 'opponent-pot-turn': return deliver('P_OPPONENT_ONLY', '轮到我啦。');
    case 'pot-continue': {
      const remaining = before.playerGroup === 'solid' ? facts.remainingSolids : facts.remainingStripes;
      return deliver('P_OPPONENT_POT_CONTINUE', remaining === 0 ? '你接着打黑八。' : '你接着打。');
    }
    default: return null;
  }
}

export function ruleLinesForShot(before: MatchState, facts: ShotFacts, next: MatchState): RuleLines | null {
  const pottedOpponentBall = playerPottedOpponentBall(before, facts, next);
  if (pottedOpponentBall) return pottedOpponentBall;
  const voice = companionVoice(before.companionId);
  const speak = (fallback: RuleLines, fact: string, myTurn: boolean): RuleLines =>
    voice ? { sceneId: fallback.sceneId, lines: [
      myTurn ? voice.take(fact) : voice.give(fact),
      `${fact}。${VOICE_RULE_TURNS[companionVoiceId(before.companionId) ?? '']?.[myTurn ? 0 : 1] ?? (myTurn ? '这杆换我，你稍等。' : '这一杆交给你。')}`,
    ] } : fallback;

  if (next.messageKey === 'group-assigned') {
    const group = next.playerGroup;
    const text = voice && group
      ? group === 'solid' ? voice.group('全色球', '1到7', '花色球') : voice.group('花色球', '9到15', '全色球')
      : groupInstruction(group);
    return text ? { sceneId: 'GROUP_ASSIGNED', lines: [text] } : null;
  }
  if (next.messageKey === 'foul') {
    const reason = next.messageParams.reason;
    if (!reason) return null;
    if (before.actor === 'opponent') {
      const fact = reason === 'scratch' ? '我把白球打进袋' : `我这杆${turnFoulFacts[reason]}`;
      const result = speak(opponentFouls[reason], fact, false);
      return voice ? { ...result, lines: result.lines.map(line => `${line} 白球由你摆。`) } : result;
    }
    if (reason === 'wrong-first') {
      const hit = facts.firstContact;
      const hitGroup = hit !== null && hit >= 1 && hit <= 7 ? 'solid'
        : hit !== null && hit >= 9 && hit <= 15 ? 'stripe' : null;
      if (before.playerGroup && hitGroup && hitGroup !== before.playerGroup) {
        return speak({ sceneId: 'P_WRONG_FIRST', lines: [
          '你先碰到我的球啦，该我打咯。',
          '你这杆先碰了我的球，换我来啦。',
        ] }, '你先碰到我的球', true);
      }
      if (hit === 8) return speak({ sceneId: 'P_WRONG_FIRST', lines: ['你先碰黑八啦，这杆换我咯。'] }, '你先碰黑八', true);
    }
    return speak(playerFouls[reason], reason === 'scratch' ? '你的白球进袋' : `你这杆${turnFoulFacts[reason]}`, true);
  }
  if (next.messageKey === 'opponent-pot-turn' && before.actor === 'opponent') {
    return speak({ sceneId: 'N_PLAYER_ONLY', lines: ['我把你的球带进袋啦，换你打。', '这杆进的是你的球，到你啦。'] }, '我把你的球带进袋', false);
  }
  return null;
}

const turnFoulFacts: Record<Exclude<FoulReason, 'scratch'>, string> = {
  'no-contact': '没碰到球',
  'wrong-first': '先碰错球',
  'no-cushion': '碰球后没进球也没碰库',
};

const foulDetails: Record<FoulReason, string> = {
  scratch: '白球也进袋了',
  'no-contact': '没碰到球',
  'wrong-first': '先碰错了球',
  'no-cushion': '碰球后没进球也没碰库',
};

function isEarlyEightFinish(match: MatchState): boolean {
  return match.phase === 'finished' && (match.messageKey === 'lose-8-early' || match.messageParams.earlyEight === true);
}

export function earlyEightAnnouncement(match: MatchState): CompanionDialogue | null {
  if (!isEarlyEightFinish(match)) return null;
  const actor = match.messageParams.actor ?? match.actor;
  const shooter = actor === 'opponent' ? '我' : '你';
  return {
    id: -1,
    sceneId: 'EARLY_EIGHT_FINISH',
    companionId: match.companionId,
    text: companionVoice(match.companionId)?.early(shooter) ?? `${shooter}提前打进黑八啦，这局就结束了。咱们再来一局。`,
  };
}

export function terminalEightInstruction(match: MatchState): string | null {
  if (match.phase !== 'finished') return null;
  if (isEarlyEightFinish(match)) return '清完本组球后，下一杆才能打黑八。';
  const { reason, actor = match.actor } = match.messageParams;
  const shooter = actor === 'opponent' ? '我' : '你';
  const voice = companionVoice(match.companionId);
  const reaction = match.winner && voice?.result[match.winner === 'player' ? 'win' : 'lose'];
  if (match.messageKey === 'lose-8-foul') {
    return `${shooter}打进了黑八，但这杆${reason ? foulDetails[reason] : '犯规了'}，这局结束啦。${reaction ?? ''}`;
  }
  if (match.messageKey === 'win-8') {
    if (reaction) return `${shooter}清完本组球后打进黑八。${reaction}`;
    return `${shooter}清完本组球后打进了黑八，拿下这局啦。`;
  }
  return null;
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
    if (match.messageKey === 'place-occupied') return line('PLACE_CORRECTION', '这儿有球呢，你换个位置放。');
    if (match.messageKey === 'place-near-pocket') return line('PLACE_CORRECTION', '离袋口远一点，往台面里放。');
    return line('PLACE_CORRECTION', '白球放回开球区就好。');
  }
  if (prioritySpeech) return prioritySpeech;
  const voice = companionVoice(match.companionId);
  if (guide) return line('CONTROL_GUIDE', guide);
  if (view) return line('VIEW_GUIDE', view);
  if (match.phase === 'placing') return line('FREE_BALL', voice?.placement ?? '拖着光圈，挑个位置放白球。');
  if (eightReady && match.actor === 'player' && match.phase === 'aiming') {
    return line('EIGHT_READY', voice?.eight ?? '你清完啦，下一杆打黑八。');
  }
  return null;
}

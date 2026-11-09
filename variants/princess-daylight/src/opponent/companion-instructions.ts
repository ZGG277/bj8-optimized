/**
 * [INPUT]: 已结算规则事实和当前操作教学。
 * [OUTPUT]: 陪练第一人称的规则与操作台词，事实优先于随机鼓励。
 * [POS]: 呈现层，不改变球规或教学进度。
 * [PROTOCOL]: 变更时同步 opponent/CLAUDE.md。
 */
import type { FoulReason, MatchState, ShotFacts } from '../match/types';
import type { CompanionDialogue } from './companion-dialogue';
import { companionVoice } from './companion-voices';

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
  const voice = companionVoice(before.companionId);
  const speak = (fallback: RuleLines, fact: string, myTurn: boolean): RuleLines =>
    voice ? { sceneId: fallback.sceneId, lines: [myTurn ? voice.take(fact) : voice.give(fact)] } : fallback;

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
          '公主先碰到我的球啦，该我打咯。',
          '公主这杆先碰了我的球，换我来啦。',
        ] }, '公主先碰到我的球', true);
      }
      if (hit === 8) return speak({ sceneId: 'P_WRONG_FIRST', lines: ['公主先碰黑八啦，这杆换我咯。'] }, '公主先碰黑八', true);
    }
    return speak(playerFouls[reason], reason === 'scratch' ? '公主的白球进袋' : `公主这杆${turnFoulFacts[reason]}`, true);
  }
  if (next.messageKey === 'opponent-pot-turn') {
    return before.actor === 'player'
      ? speak({ sceneId: 'P_OPPONENT_ONLY', lines: ['公主帮我把球送进袋了，这杆轮到我啦。', '我的球先下班了，该我打咯。'] }, '公主把我的球打进袋', true)
      : speak({ sceneId: 'N_PLAYER_ONLY', lines: ['我把公主的球带进袋啦，换你打。', '这杆进的是公主的球，到你啦。'] }, '我把公主的球带进袋', false);
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
  const shooter = actor === 'opponent' ? '我' : '公主';
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
  const shooter = actor === 'opponent' ? '我' : '公主';
  if (match.messageKey === 'lose-8-foul') {
    return `${shooter}打进了黑八，但这杆${reason ? foulDetails[reason] : '犯规了'}，这局结束啦。`;
  }
  if (match.messageKey === 'win-8') {
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
    if (match.messageKey === 'place-occupied') return line('PLACE_CORRECTION', '这儿有球呢，公主换个位置放。');
    if (match.messageKey === 'place-near-pocket') return line('PLACE_CORRECTION', '离袋口远一点，往台面里放。');
    return line('PLACE_CORRECTION', '公主，白球放回开球区就好。');
  }
  if (prioritySpeech) return prioritySpeech;
  const voice = companionVoice(match.companionId);
  if (guide) return line('CONTROL_GUIDE', guide);
  if (view) return line('VIEW_GUIDE', view);
  if (match.phase === 'placing') return line('FREE_BALL', voice?.placement ?? '公主，拖着光圈，挑个位置放白球。');
  if (eightReady && match.actor === 'player' && match.phase === 'aiming') {
    return line('EIGHT_READY', voice?.eight ?? '公主清完啦，下一杆打黑八。');
  }
  return null;
}

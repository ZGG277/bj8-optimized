import { ballAppearance } from '../ball-appearance';
import { legalNumbers, resolveStoppedShot } from '../match/match-machine';
import { factsFromWorld } from '../match/shot-facts';
import type { SettledShot } from '../match/shot-log';
import type { MatchState } from '../match/types';
import { turnDescription } from '../match/presentation';
import { TABLE, type BilliardsWorld } from '../physics';
import { generateCandidates, pocketName } from '../planner/candidates';
import { simulateForDisplay } from '../planner/evaluate';
import { companionFor } from './companions';
import { companionVoice } from './companion-voices';

export const TABLE_RULES = '开球进普通球可以续杆，开球不定组。开球后首次合法进普通球定组。全色是1至7号，白腰带是9至15号。分组后要先碰本组球；本组在出杆前清空才轮到8号。白球落袋、没碰球、首碰非法球，或首碰后没进球也没碰库，都犯规。普通犯规给对方自由球。提前进8号或进8号伴随犯规判负。';
const groupNames = { solid: '全色球', stripe: '花色球' };
const foulNames = { scratch: '白球落袋', 'no-contact': '没有碰到目标球', 'wrong-first': '先碰了非法目标', 'no-cushion': '首碰后没有进球或碰库' };
function tableArea(x: number, z: number) {
  const horizontal = Math.abs(x) < TABLE.width / 6 ? '中央' : x < 0 ? '左侧' : '右侧';
  const vertical = Math.abs(z) < TABLE.length / 6 ? '中段' : z < 0 ? '上半台' : '下半台';
  return vertical + horizontal;
}

type Advice = { tip: string; route?: {target: number; pocket: string; leave?: string; verified: boolean} };
function positionTip(world: BilliardsWorld, match: MatchState, legal: number[]): Advice {
  if (match.phase === 'placing') return {tip: '先把白球放在合法的空位；放好后再问我，我们按新球位看路线。'};
  if (match.phase !== 'aiming' || match.actor !== 'player' || world.moving) return {tip: '等轮到你、球停稳后再看下一杆。'};
  if (match.breaking) return {tip: '现在是开球。白球正对球堆前端，先把球堆打散；散开后再选袋口和走位。'};
  const candidates = generateCandidates(world, legal);
  if (!candidates.length) return {tip: '当前没找到清晰的直接进袋线。先保证碰到合法目标，并让球在首碰后碰库。'};
  // Verify one candidate on a cloned world. Only describe a leave after a legal pot in the intended pocket.
  const shot = candidates[0];
  const { endWorld, cueEnd } = simulateForDisplay(world, shot);
  const outcome = resolveStoppedShot(match, factsFromWorld(endWorld)).next;
  const wentIn = endWorld.events.some(e => e.type === 'pocket' && e.ball === shot.target && e.pocket === shot.pocket);
  const route = {target:shot.target, pocket:pocketName(shot.pocket), verified:false};
  if (endWorld.moving || !wentIn || !cueEnd || outcome.actor !== 'player' || outcome.messageKey.startsWith('lose-8') || outcome.messageKey === 'foul') {
    return {route, tip: '几何上可看' + shot.target + '号到' + pocketName(shot.pocket) + '的直线；这条线路尚未验证出稳定落点，先确认角度。'};
  }
  route.verified = true;
  if (outcome.winner === 'player') return {route, tip: '本组已经清台。模拟中，' + shot.target + '号可进' + pocketName(shot.pocket) + '收尾。'};
  const next = generateCandidates(endWorld, legalNumbers(endWorld, 'player', outcome.playerGroup))[0];
  const leave = tableArea(cueEnd.x, cueEnd.z);
  return {route: {...route, leave}, tip: '可试' + shot.target + '号到' + pocketName(shot.pocket) + '，用中杆、约' + Math.round(shot.power) + '%力度。模拟里白球停在' + leave + (next ? '，接下来有看' + next.target + '号的直线机会。' : '，下一杆还要看实际停位。')};
}

export function tableBrief(world: BilliardsWorld, match: MatchState, recent: readonly SettledShot[]) {
  const legal = legalNumbers(world, 'player', match.playerGroup);
  const companion = companionFor(match.companionId);
  const totals = { player: { potted: 0, fouls: 0 }, opponent: { potted: 0, fouls: 0 } };
  const shots = recent.map((s, index) => {
    totals[s.actor].potted += s.pocketed.filter(n => n > 0).length;
    if (s.foul) totals[s.actor].fouls++;
    return { index: index + 1, actor: s.actor, first: s.firstContact, potted: s.pocketed,
      credited: s.legalPots, foul: s.foul ? foulNames[s.foul] : null, result: s.result };
  });
  return {
    roleId: companion.id, companion: companion.name, personality: companionVoice(companion.id)?.personality,
    turn: turnDescription(match, legal.length === 1 && legal[0] === 8), breaking: match.breaking,
    group: match.playerGroup ? groupNames[match.playerGroup] : '未分组', legal,
    balls: world.balls.filter(b => b.active).map(b => ({ number: b.number, appearance: ballAppearance(b.number), area: tableArea(b.x, b.z) })),
    phase: match.phase, actor: match.actor, winner: match.winner, playerGroup: match.playerGroup,
    shotCount: shots.length, totals, shots,
    ...positionTip(world, match, legal),
  };
}

export type Brief = ReturnType<typeof tableBrief>;
function numbered(text: string) {
  const digits = '零一二三四五六七八九';
  return text.replace(/第[零一二两三四五六七八九十]+杆|[零一二两三四五六七八九十]+号/g, label => {
    const number = label.replace(/[第杆号]/g, '').replace(/两/g, '二');
    const [tens, ones] = number.split('十');
    const value = ones === undefined ? digits.indexOf(tens)
      : (tens ? digits.indexOf(tens) : 1) * 10 + (ones ? digits.indexOf(ones) : 0);
    return label.endsWith('杆') ? '第' + value + '杆' : value + '号';
  });
}
export function mentionedShot(text: string) {
  return Number(numbered(text).match(/第(\d+)杆/)?.[1] ?? (/开球那杆/.test(text) ? 1 : 0));
}

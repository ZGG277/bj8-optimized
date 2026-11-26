import { ballAppearance } from '../ball-appearance';
import { legalNumbers, resolveStoppedShot } from '../match/match-machine';
import { factsFromWorld } from '../match/shot-facts';
import type { SettledShot } from '../match/shot-log';
import type { MatchState } from '../match/types';
import { turnDescription } from '../match/presentation';
import { TABLE, type BilliardsWorld } from '../physics';
import { generateCandidates, pocketName, type ShotCandidate } from '../planner/candidates';
import { simulateForDisplay } from '../planner/evaluate';
import { companionFor } from './companions';
import { companionVoice } from './companion-voices';
import { customCompanionFor } from './companion-preferences';

export const TABLE_RULES = '开球进普通球可以续杆，开球不定组。开球后首次合法进普通球定组。全色是1至7号，白腰带是9至15号。分组后要先碰本组球；本组在出杆前清空才轮到8号。白球落袋、没碰球、首碰非法球，或首碰后没进球也没碰库，都犯规。普通犯规给对方自由球。提前进8号或进8号伴随犯规判负。';
const groupNames = { solid: '全色球', stripe: '花色球' };
const foulNames = { scratch: '白球落袋', 'no-contact': '没有碰到目标球', 'wrong-first': '先碰了非法目标', 'no-cushion': '首碰后没有进球或碰库' };
export function tableArea(x: number, z: number) {
  const horizontal = Math.abs(x) < TABLE.width / 6 ? '中央' : x < 0 ? '左侧' : '右侧';
  const vertical = Math.abs(z) < TABLE.length / 6 ? '中段' : z < 0 ? '上半台' : '下半台';
  return vertical + horizontal;
}

type Stroke = '中杆' | '低杆' | '高杆';
type Route = { target: number; pocket: string; leave?: string; power?: number; stroke?: Stroke; nextTarget?: number; verified: boolean };
type Advice = { tip: string; route?: Route };

function verifiedRoute(world: BilliardsWorld, match: MatchState, shot: ShotCandidate, stroke: Stroke): Route | null {
  const { endWorld, cueEnd } = simulateForDisplay(world, shot);
  const outcome = resolveStoppedShot(match, factsFromWorld(endWorld)).next;
  const wentIn = endWorld.events.some(event => event.type === 'pocket' && event.ball === shot.target && event.pocket === shot.pocket);
  if (endWorld.moving || !wentIn || !cueEnd || outcome.actor !== 'player' || outcome.messageKey.startsWith('lose-8') || outcome.messageKey === 'foul') return null;
  const route = { target: shot.target, pocket: pocketName(shot.pocket), verified: true };
  if (outcome.winner === 'player') return route;
  const next = generateCandidates(endWorld, legalNumbers(endWorld, 'player', outcome.playerGroup))[0];
  return { ...route, leave: tableArea(cueEnd.x, cueEnd.z), power: Math.round(shot.power), stroke, nextTarget: next?.target };
}

function positionTip(world: BilliardsWorld, match: MatchState, legal: number[], question: string): Advice {
  if (match.phase === 'placing') return {tip: '先把白球放在合法的空位；放好后再问我，我们按新球位看路线。'};
  if (match.phase !== 'aiming' || match.actor !== 'player' || world.moving) return {tip: '等轮到你、球停稳后再看下一杆。'};
  if (match.breaking) return {tip: '现在是开球。白球正对球堆前端，先把球堆打散；散开后再选袋口和走位。'};
  const candidates = generateCandidates(world, legal);
  if (!candidates.length) return {tip: '当前没找到清晰的直接进袋线。先保证碰到合法目标，并让球在首碰后碰库。'};
  const shot = candidates[0];
  const center = /(?:留|停|到|回).{0,6}(?:中间|中央|台中)/u.test(question);
  const requested = question.match(/[高中低]杆/u)?.[0] as Stroke | undefined;
  const strokes: Stroke[] = requested ? [requested] : center ? ['中杆', '低杆', '高杆'] : ['中杆'];
  let route: Route | null = null;
  for (const stroke of strokes) {
    const x = stroke === '低杆' ? -.55 : stroke === '高杆' ? .55 : 0;
    const verified = verifiedRoute(world, match, { ...shot, spin: { x, y: 0 } }, stroke);
    if (!verified) continue;
    if (!route || verified.leave === '中段中央') route = verified;
    if (!center || verified.leave === '中段中央' || !verified.leave) break;
  }
  const pocket = pocketName(shot.pocket);
  if (!route) return {
    route: { target: shot.target, pocket, verified: false },
    tip: `${shot.target}号到${pocket}有直线机会，目前没有验证出白球停位。`,
  };
  if (!route.leave) return { route, tip: `本组已清空，模拟中${shot.target}号可进${pocket}收尾。` };
  const next = route.nextTarget ? `，接下来有看${route.nextTarget}号的直线机会` : '，下一杆还要看实际停位';
  return { route, tip: `可试${shot.target}号到${pocket}，用${route.stroke}、约${route.power}%力度。模拟里白球停在${route.leave}${next}。` };
}

export function tableBrief(world: BilliardsWorld, match: MatchState, recent: readonly SettledShot[], includeRoute = true, question = '') {
  const legal = legalNumbers(world, 'player', match.playerGroup);
  const companion = companionFor(match.companionId);
  const totals = { player: { potted: 0, fouls: 0 }, opponent: { potted: 0, fouls: 0 } };
  const shots = recent.map((s, index) => {
    totals[s.actor].potted += s.pocketed.filter(n => n > 0).length;
    if (s.foul) totals[s.actor].fouls++;
    return { index: index + 1, shotId: s.shotId, actor: s.actor, first: s.firstContact, potted: s.pocketed,
      credited: s.legalPots, foul: s.foul ? foulNames[s.foul] : null, result: s.result };
  });
  const advice: Advice = includeRoute ? positionTip(world, match, legal, question) : { tip: '本次没有计算下一杆路线。' };
  return {
    roleId: companion.id, companion: companion.name,
    personality: customCompanionFor(companion.id)?.personality || companionVoice(companion.id)?.personality,
    turn: turnDescription(match, legal.length === 1 && legal[0] === 8), breaking: match.breaking,
    group: match.playerGroup ? groupNames[match.playerGroup] : '未分组', legal,
    balls: world.balls.filter(b => b.active).map(b => ({ number: b.number, appearance: ballAppearance(b.number), area: tableArea(b.x, b.z) })),
    phase: match.phase, actor: match.actor, winner: match.winner, playerGroup: match.playerGroup,
    shotCount: shots.length, totals, shots,
    ...advice,
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

export const asksForRoute = (question: string) =>
  /怎么(?:开|打|瞄|出杆|控制)|走位|母球|白球|打哪|瞄哪|哪[颗个号]|袋口|落点|停哪|看这杆|[高中低]杆|力[度道]|犯规/u.test(question)
  && !/上(?:一|回|次|局)|刚才|之前|复盘|第[\d一二三四五六七八九十]+杆/u.test(question);

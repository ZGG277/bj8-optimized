/*
[INPUT]: ShotCapture（出杆前世界/杆参数/推断意图/可选计划）+ 规则结算事实 + simulateForDisplay(evaluate)
[OUTPUT]: ShotReview 判定（perfect/position-miss/pot-miss/foul）+ 单点中性诊断；有显式计划时额外提供计划/实际轨迹对
[POS]: planner 的赛后复盘层——自主击球按目标球/袋口意图复盘，显式规划击球再做轨迹对比；不进入 search 预算，每杆至多精确回放一次
[PROTOCOL]: 诊断规则/verdict 分类变化时，同步更新本注释与 src/planner/CLAUDE.md
*/
import type { BilliardsWorld } from '../physics';
import { simulateForDisplay, type DisplaySim } from './evaluate';
import { generateCandidates, POCKETS, type ShotCandidate } from './candidates';
import { getPocketAimWindow } from '../physics';
import type { PlannedStep } from './search';

type Point = { x: number; z: number };

/** 出杆瞬间捕获的快照（Game.handleCommit 里 strikeCueBall 之前采集） */
export interface ShotCapture {
  worldBefore: BilliardsWorld;
  angle: number;
  power: number;
  spin: { x: number; y: number };
  /** 出杆时生效计划的首步；只有主动查看规划时才用于计划/实际对比。 */
  planned: PlannedStep | null;
  /** 当前杆向推断出的目标球与袋口；不包含系统推荐参数，不会在赛前泄题。 */
  intent: {
    target: number;
    pocket: number;
    centerAngle: number;
    halfWidth: number;
  } | null;
  breaking: boolean;
}

export type ReviewVerdict = 'perfect' | 'position-miss' | 'pot-miss' | 'foul';

export type ShotReviewOutcome = {
  pocketed: number[];
  firstContact: number | null;
  foulReason?: 'scratch' | 'no-contact' | 'wrong-first' | 'no-cushion' | null;
};

export interface ShotReview {
  verdict: ReviewVerdict;
  /** 一句话诊断，直接上 UI */
  message: string;
  /** 当时的计划首步；null 表示自主复盘，只显示中性诊断，不画答案轨迹。 */
  planned: PlannedStep | null;
  /** 实际打出来的效果（实线渲染 + ✕ 停位） */
  actual: {
    cuePath: Point[];
    objectPath: Point[];
    /** 实际母球停位；null=洗袋 */
    cueEnd: Point | null;
    pocketedTarget: boolean;
  };
}

const ZONE_TOL = 0.05; // 走位区判定外扩容差（m），zone 半径本身已带 0.05~0.09 余量
const PERFECT_POWER_TOL = 12; // 力度明显偏离计划时，即使偶然停进宽容区也不称为“完美复现”

function angleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/** 点是否在凸包（zone）内：同号叉积法，边容差折成 |cross| ≤ TOL×边长 */
function inZone(p: Point, zone: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < zone.length; i++) {
    const a = zone[i];
    const b = zone[(i + 1) % zone.length];
    const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    const edgeLen = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const c = Math.abs(cross) <= ZONE_TOL * edgeLen ? 0 : cross;
    if (c !== 0) {
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
  }
  return true;
}

/** 折线总长 */
function pathLength(path: Point[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    len += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  }
  return len;
}

/**
 * 计划母球碰目标球后的走位走向（接触点 → 计划停位），用于投影侧向偏差。
 * 退化为直球停球（碰后几乎不动）时退回逼近方向。
 */
function plannedPostContactDir(planned: PlannedStep): Point {
  const path = planned.display.cuePath;
  const objStart = planned.display.objectPath[0];
  if (objStart && path.length > 0) {
    // 杆路上离目标球最近的点 ≈ 接触点
    let contact = path[0];
    let bestD = Infinity;
    for (const p of path) {
      const d = Math.hypot(p.x - objStart.x, p.z - objStart.z);
      if (d < bestD) { bestD = d; contact = p; }
    }
    const dx = planned.cueEnd.x - contact.x;
    const dz = planned.cueEnd.z - contact.z;
    const len = Math.hypot(dx, dz);
    if (len > 1e-3) return { x: dx / len, z: dz / len };
  }
  //  fallback：杆路末段逼近方向
  for (let i = path.length - 1; i > 0; i--) {
    const dx = path[i].x - path[i - 1].x;
    const dz = path[i].z - path[i - 1].z;
    const len = Math.hypot(dx, dz);
    if (len > 1e-6) return { x: dx / len, z: dz / len };
  }
  return { x: 0, z: -1 };
}

const PATH_LEN_TOL = 0.2; // 母球行程差阈值（m）：力度诊断主信号

/**
 * 走位偏差诊断：主信号用「母球行程总长差」（碰库反弹会拉长行程，与力度同向，比停位投影稳健）；
 * 行程相近但停位偏 → 杆法/击球点问题。
 */
function diagnosePositionMiss(planned: PlannedStep, sim: DisplaySim): string {
  if (!sim.cueEnd) return '力度偏大，母球跟进洗袋';
  const lenDiff = pathLength(sim.cuePath) - pathLength(planned.display.cuePath);
  if (lenDiff > PATH_LEN_TOL) return '力度偏大，母球冲过了走位区';
  if (lenDiff < -PATH_LEN_TOL) return '力度偏小，母球没走到位';
  const dx = sim.cueEnd.x - planned.cueEnd.x;
  const dz = sim.cueEnd.z - planned.cueEnd.z;
  const h = plannedPostContactDir(planned);
  const side = Math.abs(dx * -h.z + dz * h.x); // 侧向分量
  if (side > 0.1) return '杆法没打出来，母球跑偏了走位区';
  return '走位差一点，出在杆法或力点上';
}

/** 目标球实际离点方向：杆路中第一段有效位移 */
function objectDepartureDir(objectPath: Point[]): Point | null {
  for (let i = 1; i < objectPath.length; i++) {
    const dx = objectPath[i].x - objectPath[0].x;
    const dz = objectPath[i].z - objectPath[0].z;
    const len = Math.hypot(dx, dz);
    if (len > 1e-4) return { x: dx / len, z: dz / len };
  }
  return null;
}

const CUT_TOL = (2 * Math.PI) / 180; // 厚薄判定：实际切角与计划切角差的容忍（rad）

/**
 * 未进球诊断：厚薄 + 偏侧。
 * 厚薄 = 实际切角（击球方向与目标球离点方向夹角）对比计划切角——几何判定，不写死左右；
 * 偏侧 = 实际离点方向相对「目标球→袋口」方向的叉积符号（面向袋口视角）。
 */
function diagnosePotMiss(planned: PlannedStep, capture: ShotCapture, sim: DisplaySim): string {
  const pocket = POCKETS[planned.candidate.pocket];
  const aimWindow = getPocketAimWindow(pocket);
  const objStart = planned.display.objectPath[0];
  const dep = objectDepartureDir(sim.objectPath);
  if (!objStart || !dep) return '目标球几乎没动——先检查瞄准线是否对准';
  // 偏侧：面向袋口时右手方向 = (-iz, ix)（y 轴向上，d×up），dot(dep, right) = cross(ideal, dep)
  const ix = aimWindow.center.x - objStart.x;
  const iz = aimWindow.center.z - objStart.z;
  const iLen = Math.hypot(ix, iz) || 1;
  const cross = (ix / iLen) * dep.z - (iz / iLen) * dep.x;
  const side = cross > 0 ? '右' : '左';
  // 厚薄：实际切角 vs 计划切角
  const cueDir = { x: Math.sin(capture.angle), z: -Math.cos(capture.angle) };
  const actualCut = Math.acos(Math.min(1, Math.max(-1, cueDir.x * dep.x + cueDir.z * dep.z)));
  const plannedCut = Math.abs(planned.candidate.cutAngle);
  if (actualCut > plannedCut + CUT_TOL) return `打薄了，目标球偏袋口${side}侧`;
  if (actualCut < plannedCut - CUT_TOL) return `打厚了，目标球偏袋口${side}侧`;
  return `目标球偏袋口${side}侧——杆法把母球带偏了，检查击球点`;
}

function diagnoseInferredPotMiss(capture: ShotCapture, sim: DisplaySim): string {
  const intent = capture.intent;
  if (!intent) return '目标球没有落袋——下一杆先确认首碰球和目标袋';
  const pocket = POCKETS[intent.pocket];
  const aimWindow = getPocketAimWindow(pocket);
  const objStart = sim.objectPath[0];
  const dep = objectDepartureDir(sim.objectPath);
  if (!objStart || !dep) return '目标球几乎没动——下一杆先让杆向穿过目标球';

  const idealX = aimWindow.center.x - objStart.x;
  const idealZ = aimWindow.center.z - objStart.z;
  const idealLength = Math.hypot(idealX, idealZ) || 1;
  const ideal = { x: idealX / idealLength, z: idealZ / idealLength };
  const sideCross = ideal.x * dep.z - ideal.z * dep.x;
  const side = sideCross > 0 ? '右' : '左';
  const actualCue = { x: Math.sin(capture.angle), z: -Math.cos(capture.angle) };
  const idealCue = { x: Math.sin(intent.centerAngle), z: -Math.cos(intent.centerAngle) };
  const actualCut = Math.acos(Math.min(1, Math.max(-1, actualCue.x * dep.x + actualCue.z * dep.z)));
  const idealCut = Math.acos(Math.min(1, Math.max(-1, idealCue.x * ideal.x + idealCue.z * ideal.z)));
  if (actualCut > idealCut + CUT_TOL) return `打薄了，目标球偏袋口${side}侧`;
  if (actualCut < idealCut - CUT_TOL) return `打厚了，目标球偏袋口${side}侧`;
  return `目标球偏袋口${side}侧——下杆把杆向收回袋口中心`;
}

function foulMessage(reason: ShotReviewOutcome['foulReason']): string {
  if (reason === 'scratch') return '先控白球：这一杆洗袋了，下杆减少跟进或力度';
  if (reason === 'no-contact') return '先保证有效首碰：这一杆没有碰到目标球';
  if (reason === 'wrong-first') return '先看清球组：下一杆必须首碰当前合法目标球';
  return '先完成合法杆：碰球后至少进球或有球碰库';
}

function actualCandidate(capture: ShotCapture): ShotCandidate | null {
  const reference = capture.planned?.candidate;
  if (reference) {
    return { ...reference, angle: capture.angle, power: capture.power, spin: capture.spin };
  }
  const intent = capture.intent;
  if (!intent) return null;
  const generated = generateCandidates(capture.worldBefore, [intent.target])
    .find(candidate => candidate.target === intent.target && candidate.pocket === intent.pocket);
  return {
    ...(generated ?? {
      target: intent.target,
      pocket: intent.pocket,
      angle: intent.centerAngle,
      power: capture.power,
      spin: { x: 0, y: 0 },
      tolerance: intent.halfWidth,
      cueDistance: 0,
      pocketDistance: 0,
      cutAngle: 0,
    }),
    angle: capture.angle,
    power: capture.power,
    spin: capture.spin,
  };
}

/** 出杆结算后调用：自主击球也输出单点建议；只有显式计划提供轨迹对比。 */
export function buildShotReview(
  capture: ShotCapture,
  outcome?: ShotReviewOutcome,
): ShotReview | null {
  const candidate = actualCandidate(capture);
  const sim = candidate ? simulateForDisplay(capture.worldBefore, candidate) : null;
  const actual = sim
    ? {
        cuePath: sim.cuePath,
        objectPath: sim.objectPath,
        cueEnd: sim.cueEnd,
        pocketedTarget: Boolean(
          sim.endWorld.balls.find((ball) => ball.number === candidate?.target && !ball.active),
        ),
      }
    : { cuePath: [], objectPath: [], cueEnd: null, pocketedTarget: false };

  if (outcome?.foulReason) {
    return {
      verdict: 'foul',
      message: foulMessage(outcome.foulReason),
      planned: capture.planned,
      actual,
    };
  }

  if (!candidate || !sim) {
    if (!outcome) return null;
    const objectPots = outcome.pocketed.filter(number => number !== 0);
    if (!capture.breaking) {
      return {
        verdict: objectPots.length > 0 ? 'perfect' : 'pot-miss',
        message: objectPots.length > 0
          ? '球进了，但目标袋不够明确——下杆先定球、定袋再出手'
          : '这一杆没有明确目标袋——下杆先定球、定袋再出手',
        planned: null,
        actual,
      };
    }
    return {
      verdict: objectPots.length > 0 ? 'perfect' : 'pot-miss',
      message: objectPots.length > 0
        ? `开球有 ${objectPots.length} 颗落袋；下一杆先确定母球停位`
        : '开球没有下球；下次优先让母球正撞球堆并控制回台中',
      planned: null,
      actual,
    };
  }

  const planned = capture.planned;
  const targetAfter = sim.endWorld.balls.find((b) => b.number === candidate.target);
  const pocketedTarget = !!targetAfter && !targetAfter.active;
  if (!pocketedTarget) {
    return {
      verdict: 'pot-miss',
      message: planned
        ? diagnosePotMiss(planned, capture, sim)
        : diagnoseInferredPotMiss(capture, sim),
      planned,
      actual,
    };
  }
  if (!planned) {
    if (!sim.cueEnd) {
      return {
        verdict: 'foul',
        message: '目标球进了，但母球洗袋——下杆减少跟进或力度',
        planned: null,
        actual,
      };
    }
    const intent = capture.intent!;
    const aimRatio = Math.abs(angleDelta(capture.angle, intent.centerAngle)) / intent.halfWidth;
    if (aimRatio > 0.55) {
      return {
        verdict: 'position-miss',
        message: '球进了，但瞄准贴近袋口边缘——下杆把杆向收回窗口中心',
        planned: null,
        actual,
      };
    }
    const reference = generateCandidates(capture.worldBefore, [intent.target])
      .find(item => item.target === intent.target && item.pocket === intent.pocket);
    if (reference && capture.power - reference.power > 15) {
      return {
        verdict: 'position-miss',
        message: '进球线路稳定，但力度偏大——下杆先说出母球停位再出手',
        planned: null,
        actual,
      };
    }
    return {
      verdict: 'perfect',
      message: '进球线路稳定；下一杆出手前先说出母球停位',
      planned: null,
      actual,
    };
  }
  const powerDelta = capture.power - planned.candidate.power;
  if (Math.abs(powerDelta) > PERFECT_POWER_TOL) {
    return {
      verdict: 'position-miss',
      message: powerDelta > 0
        ? '力度偏大，母球冲过了计划力点'
        : '力度偏小，母球没达到计划力点',
      planned,
      actual,
    };
  }
  if (sim.cueEnd && planned.zone.length >= 3 && inZone(sim.cueEnd, planned.zone)) {
    // 单步计划（无下一杆）只说完美复现；多步计划引导玩家照第 2 杆打
    const message = planned.note.includes('本杆收尾') ? '完美复现' : '完美复现，下一杆照计划打';
    return { verdict: 'perfect', message, planned, actual };
  }
  return { verdict: 'position-miss', message: diagnosePositionMiss(planned, sim), planned, actual };
}

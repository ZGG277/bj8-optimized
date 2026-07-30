/*
[INPUT]: ShotCapture（出杆前快照：世界/杆参数/当时计划 steps[0]）+ simulateForDisplay(evaluate) + POCKETS(candidates)
[OUTPUT]: ShotReview 判定（perfect/position-miss/pot-miss）+ 一句话诊断 + 计划/实际轨迹对（供 Scene3D 对比渲染）
[POS]: planner 的复盘层——出杆结算后把实际杆参数跑一遍无扰动仿真，与当时计划逐步比对，给玩家即时反馈；不进 search 预算，每杆至多调用一次
[PROTOCOL]: 诊断规则/verdict 分类变化时，同步更新本注释与 src/planner/CLAUDE.md
*/
import type { BilliardsWorld } from '../physics';
import { simulateForDisplay, type DisplaySim } from './evaluate';
import { POCKETS } from './candidates';
import { getPocketAimWindow } from '../physics';
import type { PlannedStep } from './search';

type Point = { x: number; z: number };

/** 出杆瞬间捕获的快照（Game.handleCommit 里 strikeCueBall 之前采集） */
export interface ShotCapture {
  worldBefore: BilliardsWorld;
  angle: number;
  power: number;
  spin: { x: number; y: number };
  /** 出杆时生效计划的首步（null=没开引导/没算出来 → 不出复盘） */
  planned: PlannedStep | null;
}

export type ReviewVerdict = 'perfect' | 'position-miss' | 'pot-miss';

export interface ShotReview {
  verdict: ReviewVerdict;
  /** 一句话诊断，直接上 UI */
  message: string;
  /** 当时的计划首步（虚线渲染 + 停位圆环） */
  planned: PlannedStep;
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

/** 出杆结算后调用：当时有计划 → 出复盘；否则 null（静默跳过） */
export function buildShotReview(capture: ShotCapture): ShotReview | null {
  if (!capture.planned) return null;
  const planned = capture.planned;
  const sim = simulateForDisplay(capture.worldBefore, {
    ...planned.candidate,
    angle: capture.angle,
    power: capture.power,
    spin: capture.spin,
  });
  const targetAfter = sim.endWorld.balls.find((b) => b.number === planned.candidate.target);
  const pocketedTarget = !!targetAfter && !targetAfter.active;
  const actual = {
    cuePath: sim.cuePath,
    objectPath: sim.objectPath,
    cueEnd: sim.cueEnd,
    pocketedTarget,
  };
  if (!pocketedTarget) {
    return { verdict: 'pot-miss', message: diagnosePotMiss(planned, capture, sim), planned, actual };
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

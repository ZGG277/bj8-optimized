/*
[INPUT]: 依赖 ../physics 的 TABLE / POCKETS / BilliardsWorld / CueSpin 统一物理几何
[OUTPUT]: 对外输出 ShotCandidate 类型、pocketName 与 generateCandidates 几何候选生成器，并兼容重导出 POCKETS
[POS]: 走位规划层第一步——纯几何候选生成（ghost-ball + 路径遮挡 + 切角过滤），不做任何物理仿真
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import {
  POCKETS,
  TABLE,
  getPocketAimWindow,
  getCueBall,
  type BilliardsWorld,
  type CueSpin,
  type Pocket,
} from '../physics';
export { POCKETS, type Pocket } from '../physics';

const R = TABLE.ballRadius;

/** 袋口中文名（按坐标方位命名，与 POCKETS 顺序对应） */
const POCKET_NAMES = ['左上底袋', '右上底袋', '左中袋', '右中袋', '左下底袋', '右下底袋'];

export function pocketName(index: number): string {
  return POCKET_NAMES[index] ?? `${index} 号袋`;
}

// ---- 候选过滤常量 ----
export const MAX_CUT_ANGLE = (75 * Math.PI) / 180; // 最大切球角 75°
export const MAX_CANDIDATES = 60;                  // 候选总数上限
export const BASE_POWER_MIN = 38;
export const BASE_POWER_MAX = 78;

export type ShotCandidate = {
  target: number;        // 目标球号
  pocket: number;        // 袋口索引 0-5
  angle: number;         // 建议瞄准角（strikeCueBall 约定：atan2(dx, -dz)，0 朝 -z）
  power: number;         // 建议力度（1-100）
  spin: CueSpin;         // 杆法（x 垂直 +高杆/-低杆，y 水平 +右塞/-左塞）
  tolerance: number;     // Δφ：仍能进球的瞄准角容错半宽（rad）
  cueDistance: number;   // 母球到 ghost 点距离
  pocketDistance: number;// 目标球到袋距离
  cutAngle: number;      // 切球角（rad，0=直球）
};

/**
 * 路径遮挡判定：from→to 走廊宽 2R，其他 active 球心落入走廊即视为阻挡。
 * ignored 存放可忽略的球号（目标球本身、母球）。
 * 与 physics.ts 内部 pathClear 同思路（其未导出，这里按 2R 走廊自实现）。
 */
function pathClear(
  world: BilliardsWorld,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  ignored: Set<number>,
): boolean {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return false;

  for (const ball of world.balls) {
    if (!ball.active || ignored.has(ball.number)) continue;
    const projection = Math.min(1, Math.max(0, ((ball.x - fromX) * dx + (ball.z - fromZ) * dz) / lengthSquared));
    const nearestX = fromX + dx * projection;
    const nearestZ = fromZ + dz * projection;
    if (Math.hypot(ball.x - nearestX, ball.z - nearestZ) < R * 2) return false;
  }
  return true;
}

/**
 * 进球容错半宽（pooltool required_precision 思路）：
 * 从目标球心分别瞄准统一物理几何给出的左右安全落点，
 * 两个出射方向夹角的一半即 Δφ。
 */
function shotTolerance(targetX: number, targetZ: number, pocket: Pocket): number {
  const window = getPocketAimWindow(pocket);
  const leftX = window.left.x;
  const leftZ = window.left.z;
  const rightX = window.right.x;
  const rightZ = window.right.z;

  const angleLeft = Math.atan2(leftX - targetX, leftZ - targetZ);
  const angleRight = Math.atan2(rightX - targetX, rightZ - targetZ);
  let diff = Math.abs(angleLeft - angleRight);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return diff / 2;
}

/**
 * 生成全部几何可行候选：每颗合法球 × 6 袋口。
 *
 * 取舍说明：每个 (target, pocket) 组合只产出一个基础候选（中心杆 + 公式力度），
 * 不做力度/杆法展开——否则候选数 ×3 且绝大多数组合会在 erf 粗筛时被丢弃，
 * 浪费 MC 预算。力度/杆法变体在 search.ts 精排阶段只对 erf top-K 展开。
 * 候选总数按启发式评分（距离 + 切角惩罚）升序截断到 MAX_CANDIDATES。
 */
export function generateCandidates(world: BilliardsWorld, legal: number[]): ShotCandidate[] {
  const cue = getCueBall(world);
  if (!cue || !cue.active || legal.length === 0) return [];

  const candidates: ShotCandidate[] = [];

  for (const target of world.balls) {
    if (!target.active || !legal.includes(target.number)) continue;

    for (let pocketIndex = 0; pocketIndex < POCKETS.length; pocketIndex += 1) {
      const pocket = POCKETS[pocketIndex];
      const aimWindow = getPocketAimWindow(pocket);

      const pocketDx = aimWindow.center.x - target.x;
      const pocketDz = aimWindow.center.z - target.z;
      const pocketDistance = Math.hypot(pocketDx, pocketDz);
      if (pocketDistance === 0) continue;

      // ghost-ball 点：目标球心沿进球线后退 2R
      const ghostX = target.x - (pocketDx / pocketDistance) * R * 2;
      const ghostZ = target.z - (pocketDz / pocketDistance) * R * 2;

      // ghost 点不越界（母球在触点必须仍完整在台面内）
      if (Math.abs(ghostX) > TABLE.width / 2 || Math.abs(ghostZ) > TABLE.length / 2) continue;

      const cueDx = ghostX - cue.x;
      const cueDz = ghostZ - cue.z;
      const cueDistance = Math.hypot(cueDx, cueDz);
      if (cueDistance === 0) continue;

      // 切球角：母球行进方向与目标球进球方向的夹角（0=直球）
      const cosCut = (cueDx * pocketDx + cueDz * pocketDz) / (cueDistance * pocketDistance);
      if (cosCut <= 0) continue; // 反手球（母球在进球线前方），不可打
      const cutAngle = Math.acos(Math.min(1, cosCut));
      if (cutAngle > MAX_CUT_ANGLE) continue;

      // 两条路径无遮挡；cue→ghost 走廊同时保证 ghost 点处母球占位空间足够
      if (!pathClear(
        world,
        target.x,
        target.z,
        aimWindow.center.x,
        aimWindow.center.z,
        new Set([target.number]),
      )) continue;
      if (!pathClear(world, cue.x, cue.z, ghostX, ghostZ, new Set([0, target.number]))) continue;

      candidates.push({
        target: target.number,
        pocket: pocketIndex,
        angle: Math.atan2(cueDx, -cueDz),
        power: Math.min(BASE_POWER_MAX, Math.max(BASE_POWER_MIN, 35 + (cueDistance + pocketDistance) * 15)),
        spin: { x: 0, y: 0 },
        tolerance: shotTolerance(target.x, target.z, pocket),
        cueDistance,
        pocketDistance,
        cutAngle,
      });
    }
  }

  // 启发式评分（与 planSimpleShot 同量纲：距离 + 切角惩罚）升序截断
  candidates.sort(
    (a, b) =>
      a.cueDistance + a.pocketDistance + a.cutAngle * 1.4 -
      (b.cueDistance + b.pocketDistance + b.cutAngle * 1.4),
  );
  return candidates.slice(0, MAX_CANDIDATES);
}

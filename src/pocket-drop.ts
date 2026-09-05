/*
[INPUT]: 共享 PocketGeometry、实际 pocket-well profile 与物理层 pocket event 的入口快照
[OUTPUT]: 恒尺寸、入口连续、显式重力的有限视觉落袋轨迹（不是刚体碰撞）
[POS]: 纯表现层；不改变物理落袋判定、球局状态或 PocketGeometry 尺寸
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import {
  pocketLocalToWorld,
  worldToPocketLocal,
  type PocketGeometry,
} from './physics';
import { pocketRenderProfile } from './pocket-render/profile';

export type PocketDropInput = {
  pocket: PocketGeometry;
  entryX: number;
  entryZ: number;
  entryVx: number;
  entryVz: number;
  /** pocket event 的真实角速度；缺省或全零时落袋球不凭空自转。 */
  entryWx?: number;
  entryWy?: number;
  entryWz?: number;
};

export type PocketDropSample = {
  x: number;
  y: number;
  z: number;
  scale: 1;
  spinRate: number;
  spinAxis: Readonly<{ x: number; y: number; z: number }>;
  progress: number;
};

export type PocketDropTrajectory = {
  duration: number;
  /** 保持台面高度、将事件入口连续引导至实际孔洞中心的有界时长。 */
  entryDuration: number;
  pocketIndex: number;
  sample: (elapsedSeconds: number) => PocketDropSample;
};

const GRAVITY = 9.81;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function hermite(
  start: number,
  startVelocity: number,
  end: number,
  endVelocity: number,
  time: number,
  duration: number,
): number {
  const u = clamp(time / duration, 0, 1);
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * start
    + (u3 - 2 * u2 + u) * duration * startVelocity
    + (-2 * u3 + 3 * u2) * end
    + (u3 - u2) * duration * endVelocity;
}

/**
 * 第一阶段保持台面高度和 event 的一阶水平速度，并连续引导到真实 top ellipse 中心；
 * 第二阶段才以 9.81m/s² 自由落下，并仅沿实际 top/bottom ellipse 的中心线下落。球体从进入 well 起始终处于
 * 真实网格横截面的中心安全域。这里没有球-壁反弹或网袋软体计算，故不能称刚体模拟。
 */
export function createPocketDropTrajectory(input: PocketDropInput): PocketDropTrajectory {
  const profile = pocketRenderProfile(input.pocket);
  const entry = worldToPocketLocal(input.pocket, { x: input.entryX, z: input.entryZ });
  const outwardVelocity = input.entryVx * input.pocket.outward.x
    + input.entryVz * input.pocket.outward.z;
  const lateralVelocity = input.entryVx * input.pocket.tangent.x
    + input.entryVz * input.pocket.tangent.z;
  const entryDistance = Math.hypot(profile.topCenterDepth - entry.depth, entry.lateral);
  const entrySpeed = Math.hypot(input.entryVx, input.entryVz);
  // 入口距离和速度决定引导时间，并限制在 35–120ms，避免静态快照/极慢球无限停留。
  const entryDuration = clamp(0.035 + entryDistance / Math.max(0.45, entrySpeed), 0.035, 0.12);
  // 终点到达 lower ellipse 所在平面时立刻由 Scene3D 隐藏，避免球心落到袋底平面之下。
  const fallDuration = Math.sqrt(Math.max(0, 2 * (profile.ballRadius - profile.wellBottomY) / GRAVITY));
  const duration = entryDuration + fallDuration;
  const omega = {
    x: input.entryWx ?? 0,
    y: input.entryWy ?? 0,
    z: input.entryWz ?? 0,
  };
  const spinRate = Math.hypot(omega.x, omega.y, omega.z);
  const spinAxis = spinRate > 1e-9
    ? { x: omega.x / spinRate, y: omega.y / spinRate, z: omega.z / spinRate }
    : { x: 0, y: 0, z: 0 };

  return {
    duration,
    entryDuration,
    pocketIndex: input.pocket.index,
    sample(elapsedSeconds) {
      const time = clamp(elapsedSeconds, 0, duration);
      if (time === 0) {
        return {
          x: input.entryX,
          y: profile.ballRadius,
          z: input.entryZ,
          scale: 1,
          spinRate,
          spinAxis,
          progress: 0,
        };
      }
      const fallTime = Math.max(0, time - entryDuration);
      const y = profile.ballRadius - 0.5 * GRAVITY * fallTime * fallTime;
      let depth: number;
      let lateral: number;
      if (time <= entryDuration) {
        depth = hermite(
          entry.depth,
          outwardVelocity,
          profile.topCenterDepth,
          0,
          time,
          Math.max(entryDuration, 1e-6),
        );
        lateral = hermite(entry.lateral, lateralVelocity, 0, 0, time, Math.max(entryDuration, 1e-6));
      } else {
        // 以球心当前高度读取真实 well 的 top→bottom 线性横截面；不会越过 mesh 中心线。
        const wellProgress = clamp(
          (profile.wellTopY - y) / (profile.wellTopY - profile.wellBottomY),
          0,
          1,
        );
        depth = profile.topCenterDepth
          + (profile.bottomCenterDepth - profile.topCenterDepth) * wellProgress;
        lateral = 0;
      }
      const point = pocketLocalToWorld(input.pocket, depth, lateral);
      return {
        x: point.x,
        y,
        z: point.z,
        scale: 1,
        spinRate,
        spinAxis,
        progress: time / duration,
      };
    },
  };
}

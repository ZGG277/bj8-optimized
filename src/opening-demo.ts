/*
[INPUT]: 现有可操作相机终点位姿与归一化时间
[OUTPUT]: 约 5 秒湖面远景靠近球桌并精确落到现有相机的连续位姿
[POS]: 纯相机几何；不读取场景、DOM、球局或持久状态
[PROTOCOL]: 路径或时长变化时同步 opening-demo.test.ts 与本地验收记录
*/

import type { CameraPose } from './camera-view';

export const OPENING_DEMO_DURATION_MS = 5000;
export const OPENING_DEMO_FAR_DISTANCE = 34;

export type OpeningDemoFrame = CameraPose & {
  progress: number;
  distanceToHandoff: number;
};

/** 正式入口默认播放湖面开场；显式其他世界保持原有局前入口。 */
export function openingDemoEnabledForSearch(search: string): boolean {
  const params = new URLSearchParams(search);
  if (params.get('openingDemo') === '0') return false;
  if (params.get('openingDemo') === '1' || params.get('lake360') === '1') return true;
  const world = params.get('world');
  return world === null || world === 'lake';
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smootherStep = (value: number) => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const cubic = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * 由终点反推同一视线轴上的远景，避免动画末帧切换另一套相机公式。
 * 起点只把现有湖面当作大尺度错觉，不创建超大物理场景。
 */
export function openingDemoFrame(progress: number, handoff: CameraPose): OpeningDemoFrame {
  const t = smootherStep(progress);
  const dx = handoff.lookAt.x - handoff.position.x;
  const dz = handoff.lookAt.z - handoff.position.z;
  const length = Math.hypot(dx, dz) || 1;
  const forwardX = dx / length;
  const forwardZ = dz / length;
  const sideX = -forwardZ;
  const sideZ = forwardX;
  const end = handoff.position;

  const start = {
    x: end.x - forwardX * OPENING_DEMO_FAR_DISTANCE - sideX * 2.8,
    y: 3.45,
    z: end.z - forwardZ * OPENING_DEMO_FAR_DISTANCE - sideZ * 2.8,
  };
  const controlA = {
    x: end.x - forwardX * 25 - sideX * 1.8,
    y: 3.05,
    z: end.z - forwardZ * 25 - sideZ * 1.8,
  };
  const controlB = {
    x: end.x - forwardX * 7.2 + sideX * 0.45,
    y: 0.92,
    z: end.z - forwardZ * 7.2 + sideZ * 0.45,
  };
  const position = {
    x: cubic(start.x, controlA.x, controlB.x, end.x, t),
    y: cubic(start.y, controlA.y, controlB.y, end.y, t),
    z: cubic(start.z, controlA.z, controlB.z, end.z, t),
  };

  // 远处先看湖心与球桌整体，末段才收束到现有瞄准视线；终点逐项完全相同。
  const lookStart = {
    x: handoff.lookAt.x + forwardX * 0.75,
    y: 0.08,
    z: handoff.lookAt.z + forwardZ * 0.75,
  };
  const lookAt = {
    x: mix(lookStart.x, handoff.lookAt.x, t),
    y: mix(lookStart.y, handoff.lookAt.y, t),
    z: mix(lookStart.z, handoff.lookAt.z, t),
  };
  return {
    position,
    lookAt,
    progress: clamp01(progress),
    distanceToHandoff: Math.hypot(
      position.x - end.x,
      position.y - end.y,
      position.z - end.z,
    ),
  };
}

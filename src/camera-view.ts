/*
[INPUT]: 母球位置、世界杆向、力度预览与归一化视角高度
[OUTPUT]: 对外提供连续视角钳制、标签与第一人称→俯视的可测试相机位姿
[POS]: 相机纯几何层；Scene3D 的活相机与虚拟拾取相机必须共享这里的唯一位姿公式
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/

export const FIRST_PERSON_VIEW = 0;
export const OVERHEAD_VIEW = 1;

const FP_CAM_DIST = 0.72;
const FP_CAM_SIDE = 0.015;
const FP_CAM_HEIGHT = 0.16;
const FP_LOOK_AHEAD = 0.42;
const OVERHEAD_HEIGHT = 3.7;
const OVERHEAD_ORBIT_RADIUS = 0.85;
const OVERHEAD_LOOK_RADIUS = 0.05;

export type CameraPoint = {
  x: number;
  y: number;
  z: number;
};

export type CameraPose = {
  position: CameraPoint;
  lookAt: CameraPoint;
};

export function clampViewLevel(level: number): number {
  if (!Number.isFinite(level)) return FIRST_PERSON_VIEW;
  return Math.min(OVERHEAD_VIEW, Math.max(FIRST_PERSON_VIEW, level));
}

/** 端点保留产品名称；中间高度直接给出可感知的百分比。 */
export function viewLevelLabel(level: number): string {
  const clamped = clampViewLevel(level);
  if (clamped <= 0.005) return '第一人称';
  if (clamped >= 0.995) return '俯视';
  return `视角高度 ${Math.round(clamped * 100)}%`;
}

const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

/**
 * 相机在任意高度都消费同一个世界杆向：
 * - 低位以母球为轴，保持杆、视线、球路共线；
 * - 高位逐渐把轴心移到球台中心，确保整台可见；
 * - 俯视端仍保留 0.85m 环绕半径，转向时画面方向连续变化。
 */
export function cameraPoseAt(
  cueX: number,
  cueZ: number,
  aimAngle: number,
  previewPower: number,
  viewLevel: number,
): CameraPose {
  const level = clampViewLevel(viewLevel);
  const transition = level * level * (3 - 2 * level);
  const sin = Math.sin(aimAngle);
  const cos = Math.cos(aimAngle);
  const firstDistance = FP_CAM_DIST + previewPower * 0.0022;

  const firstPosition: CameraPoint = {
    x: cueX - sin * firstDistance + cos * FP_CAM_SIDE,
    y: FP_CAM_HEIGHT + previewPower * 0.0004,
    z: cueZ + cos * firstDistance + sin * FP_CAM_SIDE,
  };
  const firstLookAt: CameraPoint = {
    x: cueX + sin * FP_LOOK_AHEAD,
    y: 0.03,
    z: cueZ - cos * FP_LOOK_AHEAD,
  };

  const overheadPosition: CameraPoint = {
    x: -sin * OVERHEAD_ORBIT_RADIUS,
    y: OVERHEAD_HEIGHT,
    z: cos * OVERHEAD_ORBIT_RADIUS,
  };
  const overheadLookAt: CameraPoint = {
    x: -sin * OVERHEAD_LOOK_RADIUS,
    y: 0,
    z: cos * OVERHEAD_LOOK_RADIUS,
  };

  return {
    position: {
      x: mix(firstPosition.x, overheadPosition.x, transition),
      y: mix(firstPosition.y, overheadPosition.y, transition),
      z: mix(firstPosition.z, overheadPosition.z, transition),
    },
    lookAt: {
      x: mix(firstLookAt.x, overheadLookAt.x, transition),
      y: mix(firstLookAt.y, overheadLookAt.y, transition),
      z: mix(firstLookAt.z, overheadLookAt.z, transition),
    },
  };
}

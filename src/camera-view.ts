/*
[INPUT]: 母球位置、独立相机方位角、力度预览、归一化视角高度与视口宽高比
[OUTPUT]: 对外提供稍高出杆瞄准位、连续视角钳制、观战锁定路由、横竖屏全台方向、玩家非俯视杆向跟随与相机位姿
[POS]: 相机纯几何层；Scene3D 的活相机与虚拟拾取相机必须共享这里的唯一位姿公式，全台投影拟合委托 camera-framing
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { fullTableCameraPose, type CameraSafetyInsets } from './camera-framing';

export const FIRST_PERSON_VIEW = 0;
/** 稍高于第一人称，保留沿杆向观察白球与目标的出杆感。 */
export const SHOT_AIM_VIEW = 0.16;
export const OVERHEAD_VIEW = 1;
export const FULL_TABLE_AZIMUTH = 0;
export const LANDSCAPE_TABLE_AZIMUTH = Math.PI / 2;
export const CAMERA_FOV_DEGREES = 46;

const FP_CAM_DIST = 0.72;
const FP_CAM_SIDE = 0.015;
const FP_CAM_HEIGHT = 0.16;
const FP_LOOK_AHEAD = 0.42;
const OVERHEAD_ORBIT_RADIUS = 0.85;
/** 木帮外缘的半尺寸，略留 1cm 给阴影和抗锯齿边缘。 */
const TABLE_OUTER_HALF_WIDTH = 0.76;
const TABLE_OUTER_HALF_LENGTH = 1.4;
const ORBIT_RADIANS_PER_PIXEL = 0.008;
export const GLOBAL_CAMERA_VIEW_LEVEL = 0.42;
export const OVERHEAD_LOCK_VIEW_LEVEL = 0.995;

export type CameraPoint = {
  x: number;
  y: number;
  z: number;
};

export type CameraPose = {
  position: CameraPoint;
  lookAt: CameraPoint;
};

export type CameraInteractionMode = 'aim' | 'orbit' | 'locked';

export function clampViewLevel(level: number): number {
  if (!Number.isFinite(level)) return FIRST_PERSON_VIEW;
  return Math.min(OVERHEAD_VIEW, Math.max(FIRST_PERSON_VIEW, level));
}

export function normalizeCameraAzimuth(angle: number): number {
  if (!Number.isFinite(angle)) return FULL_TABLE_AZIMUTH;
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** 全局高度用于切换全台构图、吊灯和触控反馈；方位是否锁定另由俯视端点判定。 */
export function isGlobalCameraView(level: number): boolean {
  return clampViewLevel(level) >= GLOBAL_CAMERA_VIEW_LEVEL;
}

export function isOverheadCameraView(level: number): boolean {
  return clampViewLevel(level) >= OVERHEAD_LOCK_VIEW_LEVEL;
}

/** 竖屏让球台长边沿屏幕纵轴，横屏转 90° 让球台横放。 */
export function fullTableAzimuth(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return LANDSCAPE_TABLE_AZIMUTH;
  }
  return width < height ? FULL_TABLE_AZIMUTH : LANDSCAPE_TABLE_AZIMUTH;
}

/** 兼容既有观战调用；玩家与对手共享同一全台构图。 */
export const opponentOverheadAzimuth = fullTableAzimuth;

/** 顾燃回合锁定球桌；只有玩家显式开启手动视角时，球桌手势才用于环绕。 */
export function cameraInteractionMode(
  spectatorActive: boolean,
  manualCameraActive: boolean,
): CameraInteractionMode {
  if (spectatorActive) return 'locked';
  return manualCameraActive ? 'orbit' : 'aim';
}

/** 横向拖动只产生视觉方位角，不消费也不返回球杆瞄准角。 */
export function cameraAzimuthAfterDrag(current: number, pixelDelta: number): number {
  if (!Number.isFinite(pixelDelta)) return normalizeCameraAzimuth(current);
  return normalizeCameraAzimuth(current - pixelDelta * ORBIT_RADIANS_PER_PIXEL);
}

/**
 * 玩家只有停在俯视端点时保持独立方位；一旦选择非俯视视角，
 * 相机立即重新消费当前瞄准角。触摸瞄准期间的短暂锁镜由上层处理。
 */
export function cameraAzimuthAtView(
  cameraAzimuth: number,
  aimAngle: number,
  viewLevel: number,
  detached: boolean,
): number {
  const aim = normalizeCameraAzimuth(aimAngle);
  if (!detached || !isOverheadCameraView(viewLevel)) return aim;
  return normalizeCameraAzimuth(cameraAzimuth);
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
 * 把旋转后的球台外框分别投影到屏幕横/纵轴，再由透视 FOV 反算最低高度。
 * 竖屏的水平 FOV 最窄，因此方位角转到横台时会自动继续拉远，始终保留整台。
 */
export function overheadFitHeight(aspect: number, cameraAzimuth: number): number {
  return fullTableCameraPose({
    aspect,
    azimuth: normalizeCameraAzimuth(cameraAzimuth),
    halfWidth: TABLE_OUTER_HALF_WIDTH,
    halfLength: TABLE_OUTER_HALF_LENGTH,
    orbitRadius: OVERHEAD_ORBIT_RADIUS,
  }).pose.position.y;
}

/**
 * 相机在任意高度都消费独立的视觉方位角：
 * - 玩家低位传入瞄准角，保持杆、视线、球路共线；
 * - 观战时传入 cameraAzimuth，转动镜头不会污染球杆或物理瞄准；
 * - 高位逐渐把轴心移到球台中心，确保整台可见；
 * - 高位高度按视口比例与台面方向自适应，竖屏也能看全六袋。
 */
export function cameraPoseAt(
  cueX: number,
  cueZ: number,
  cameraAzimuth: number,
  previewPower: number,
  viewLevel: number,
  aspect = 16 / 9,
  fullTableSafety?: Partial<CameraSafetyInsets>,
): CameraPose {
  const level = clampViewLevel(viewLevel);
  const transition = level * level * (3 - 2 * level);
  const angle = normalizeCameraAzimuth(cameraAzimuth);
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const firstDistance = FP_CAM_DIST + previewPower * 0.0022;
  const overheadPose = fullTableCameraPose({
    aspect,
    azimuth: angle,
    halfWidth: TABLE_OUTER_HALF_WIDTH,
    halfLength: TABLE_OUTER_HALF_LENGTH,
    orbitRadius: OVERHEAD_ORBIT_RADIUS,
    safety: fullTableSafety,
  }).pose;

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

  const overheadPosition: CameraPoint = overheadPose.position;
  const overheadLookAt: CameraPoint = overheadPose.lookAt;

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

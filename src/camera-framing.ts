/*
[INPUT]: 已确认的白球/首碰目标球/袋口轮廓、当前视觉方位、视口比例与 HUD 安全边距
[OUTPUT]: 固定 46° FOV 下的瞄准构图与全台构图位姿，以及可由 DOM 控件矩形导出的安全边距
[POS]: 不依赖 React/Three.js/物理世界的纯投影拟合层；确认帧只冻结目标身份，pose 始终消费当前视觉方位
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/

export type FramingPoint = { x: number; y: number; z: number };
export type FramingPose = { position: FramingPoint; lookAt: FramingPoint };
export type FramingBall = FramingPoint & { radius: number };

export type CameraSafetyInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type CameraControlRect = {
  id?: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  dockEdge: 'right' | 'bottom' | 'left' | 'top' | 'free';
};

/** Game 的 data-* 控件节点最小适配面；保留 free，交由安全区策略决定是否真是遮挡。 */
export type CameraControlElement = {
  dataset: { controlSlot?: string; dockEdge?: string };
  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number };
};

export type CameraPocketOutline = {
  index: number;
  center: FramingPoint;
  /** 袋口左右两侧 jaw 的完整开口边缘。 */
  left: FramingPoint;
  right: FramingPoint;
  /** 向袋腔延伸的轮廓深度，防止只把开口中心放进画面。 */
  depth: number;
  outward: { x: number; z: number };
};

export type CameraFraming = {
  kind: 'aim';
  /** 只在幽灵球抬手确认时确定；拨轮微调不会重新选球/跳袋。 */
  targetNumber: number;
  pocketIndex: number;
  cue: FramingBall;
  object: FramingBall;
  pocket: CameraPocketOutline;
  safety: CameraSafetyInsets;
};

export type FramingResult = {
  pose: FramingPose;
  /** 指定球面和袋口轮廓已占用的最大安全区比例（越大越紧）。 */
  occupancy: number;
  /** 当薄切/长台需要比偏好机位更高或更远时为 true。 */
  elevatedOrRetreated: boolean;
};

export type AimFramingDecision = {
  framing: CameraFraming | null;
  /** true 表示调用方继续使用既有 16% 出杆位，不猜测袋口也不改杆向。 */
  fallback: boolean;
};

export const DEFAULT_CAMERA_SAFETY: CameraSafetyInsets = {
  top: 0.045,
  right: 0.045,
  bottom: 0.045,
  left: 0.045,
};

export const CAMERA_FOV_DEGREES = 46;

const EPSILON = 1e-8;
const MAX_EDGE_SAFETY = 0.3;

export function cameraControlRectsFromElements(
  elements: Iterable<CameraControlElement>,
): CameraControlRect[] {
  const controls: CameraControlRect[] = [];
  for (const element of elements) {
    const edge = element.dataset.dockEdge;
    if (edge !== 'right' && edge !== 'bottom' && edge !== 'left' && edge !== 'top' && edge !== 'free') continue;
    const rect = element.getBoundingClientRect();
    controls.push({
      id: element.dataset.controlSlot,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      dockEdge: edge,
    });
  }
  return controls;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizedSafety(safety: Partial<CameraSafetyInsets> | undefined): CameraSafetyInsets {
  return {
    top: clamp(safety?.top ?? DEFAULT_CAMERA_SAFETY.top, 0, MAX_EDGE_SAFETY),
    right: clamp(safety?.right ?? DEFAULT_CAMERA_SAFETY.right, 0, MAX_EDGE_SAFETY),
    bottom: clamp(safety?.bottom ?? DEFAULT_CAMERA_SAFETY.bottom, 0, MAX_EDGE_SAFETY),
    left: clamp(safety?.left ?? DEFAULT_CAMERA_SAFETY.left, 0, MAX_EDGE_SAFETY),
  };
}

/**
 * 仅吸收贴边控件的真实占位。自由控件位置不可预测，不能把整个视口缩成一个很小的矩形；
 * 因此它们由上层在碰撞明显时选择保守回退，而非污染所有正常构图。
 */
export function cameraSafetyFromControlRects(
  viewport: { left: number; top: number; right: number; bottom: number },
  controls: readonly CameraControlRect[],
  base: Partial<CameraSafetyInsets> = DEFAULT_CAMERA_SAFETY,
): CameraSafetyInsets {
  const width = Math.max(1, viewport.right - viewport.left);
  const height = Math.max(1, viewport.bottom - viewport.top);
  const safety = normalizedSafety(base);
  for (const control of controls) {
    const overlapsViewport = control.right > viewport.left && control.left < viewport.right &&
      control.bottom > viewport.top && control.top < viewport.bottom;
    if (!overlapsViewport) continue;
    if (control.dockEdge === 'right') {
      safety.right = Math.max(safety.right, clamp((viewport.right - control.left) / width + 0.018, 0, MAX_EDGE_SAFETY));
    } else if (control.dockEdge === 'bottom') {
      safety.bottom = Math.max(safety.bottom, clamp((viewport.bottom - control.top) / height + 0.018, 0, MAX_EDGE_SAFETY));
    } else if (control.dockEdge === 'left') {
      safety.left = Math.max(safety.left, clamp((control.right - viewport.left) / width + 0.018, 0, MAX_EDGE_SAFETY));
    } else if (control.dockEdge === 'top') {
      safety.top = Math.max(safety.top, clamp((control.bottom - viewport.top) / height + 0.018, 0, MAX_EDGE_SAFETY));
    } else if (
      control.dockEdge === 'free' &&
      control.id === 'aimDial' &&
      control.top >= viewport.top + height * 0.64 &&
      control.right - control.left >= Math.min(140, width * 0.15)
    ) {
      // 默认自由瞄准拨轮虽未“dock”，但它贴近下缘且横跨球桌下中袋。
      // 仅为这个具名、可解释的遮挡物让出底边；其余自由控件保持局部覆盖语义。
      safety.bottom = Math.max(safety.bottom, clamp((viewport.bottom - control.top) / height + 0.018, 0, MAX_EDGE_SAFETY));
    }
  }
  return safety;
}

export function createAimCameraFraming(input: CameraFraming): CameraFraming {
  return {
    ...input,
    safety: normalizedSafety(input.safety),
    cue: { ...input.cue },
    object: { ...input.object },
    pocket: {
      ...input.pocket,
      center: { ...input.pocket.center },
      left: { ...input.pocket.left },
      right: { ...input.pocket.right },
      outward: { ...input.pocket.outward },
    },
  };
}

/** 只有稳定的首碰目标和袋口同时存在才进入自动构图；无目标是显式回退状态。 */
export function framingForConfirmedAim(input: CameraFraming | null): AimFramingDecision {
  return input === null
    ? { framing: null, fallback: true }
    : { framing: createAimCameraFraming(input), fallback: false };
}

function addSphereSurface(points: FramingPoint[], ball: FramingBall) {
  // 用包围球的轴对齐立方体 8 个角做保守截锥检查。安全区对应凸截锥：
  // 立方体各顶点都在内，整个立方体及其中任意球面都在内；这比有限球面采样可证明完整。
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        points.push({
          x: ball.x + sx * ball.radius,
          y: ball.y + sy * ball.radius,
          z: ball.z + sz * ball.radius,
        });
      }
    }
  }
}

function pocketContour(pocket: CameraPocketOutline): FramingPoint[] {
  const tangentX = pocket.right.x - pocket.left.x;
  const tangentZ = pocket.right.z - pocket.left.z;
  const halfX = tangentX / 2;
  const halfZ = tangentZ / 2;
  const points: FramingPoint[] = [];
  for (let step = 0; step <= 8; step += 1) {
    const offset = -1 + (step / 4);
    points.push({
      x: pocket.center.x + halfX * offset,
      y: pocket.center.y,
      z: pocket.center.z + halfZ * offset,
    });
    // 可见洞口不是一根线：带入袋腔的一圈轮廓也必须安全入镜。
    points.push({
      x: pocket.center.x + pocket.outward.x * pocket.depth + halfX * offset,
      y: pocket.center.y - Math.min(0.035, pocket.depth * 0.6),
      z: pocket.center.z + pocket.outward.z * pocket.depth + halfZ * offset,
    });
  }
  return points;
}

function basisForPose(pose: FramingPose) {
  const forwardX = pose.lookAt.x - pose.position.x;
  const forwardY = pose.lookAt.y - pose.position.y;
  const forwardZ = pose.lookAt.z - pose.position.z;
  const forwardLength = Math.hypot(forwardX, forwardY, forwardZ) || 1;
  const fx = forwardX / forwardLength;
  const fy = forwardY / forwardLength;
  const fz = forwardZ / forwardLength;
  // 固定 up=(0,1,0)，相机在台面上方，退化时用稳定右向量兜底。
  // Three.js PerspectiveCamera.lookAt 的屏幕右轴为 up × forward。
  // 例如相机在 +z 看原点时世界 +x 必须投到屏幕 +x。
  const rightLength = Math.hypot(fz, fx) || 1;
  const rx = -fz / rightLength;
  const rz = fx / rightLength;
  // up = normalize(right × forward)，确保世界向上在屏幕上也是正 y。
  const ux = -fy * fx / rightLength;
  const uy = rightLength;
  const uz = -fy * fz / rightLength;
  return { fx, fy, fz, rx, rz, ux, uy, uz };
}

function projectPoint(point: FramingPoint, pose: FramingPose, aspect: number) {
  const basis = basisForPose(pose);
  const dx = point.x - pose.position.x;
  const dy = point.y - pose.position.y;
  const dz = point.z - pose.position.z;
  const depth = dx * basis.fx + dy * basis.fy + dz * basis.fz;
  if (depth <= EPSILON) return null;
  const horizontal = dx * basis.rx + dz * basis.rz;
  const vertical = dx * basis.ux + dy * basis.uy + dz * basis.uz;
  const tanHalf = Math.tan((CAMERA_FOV_DEGREES * Math.PI) / 360);
  return {
    x: horizontal / (depth * tanHalf * aspect),
    y: vertical / (depth * tanHalf),
  };
}

function withinSafety(
  points: readonly FramingPoint[],
  pose: FramingPose,
  aspect: number,
  safety: CameraSafetyInsets,
) {
  const minX = -1 + safety.left * 2;
  const maxX = 1 - safety.right * 2;
  const minY = -1 + safety.bottom * 2;
  const maxY = 1 - safety.top * 2;
  let occupancy = 0;
  for (const point of points) {
    const projected = projectPoint(point, pose, aspect);
    if (!projected || projected.x < minX || projected.x > maxX || projected.y < minY || projected.y > maxY) {
      return { fits: false, occupancy: Infinity };
    }
    const xUse = Math.abs((projected.x - (minX + maxX) / 2) / Math.max(EPSILON, (maxX - minX) / 2));
    const yUse = Math.abs((projected.y - (minY + maxY) / 2) / Math.max(EPSILON, (maxY - minY) / 2));
    occupancy = Math.max(occupancy, xUse, yUse);
  }
  return { fits: true, occupancy };
}

function projectedBounds(points: readonly FramingPoint[], pose: FramingPose, aspect: number) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    const projected = projectPoint(point, pose, aspect);
    if (!projected) return null;
    minX = Math.min(minX, projected.x);
    maxX = Math.max(maxX, projected.x);
    minY = Math.min(minY, projected.y);
    maxY = Math.max(maxY, projected.y);
  }
  return { minX, maxX, minY, maxY };
}

export const AIM_CAMERA_ELEVATION_DEGREES = 28;

function aimPoseAtDistance(
  framing: CameraFraming,
  azimuth: number,
  distance: number,
): FramingPose {
  const sin = Math.sin(azimuth);
  const cos = Math.cos(azimuth);
  // 幽灵球确认后使用轻微抬高的 28° 构图；保留第一人称方向感，同时更容易看清目标球与袋口。
  const elevation = Math.tan(AIM_CAMERA_ELEVATION_DEGREES * Math.PI / 180);
  const height = Math.max(0.24, distance * elevation);
  const centerX = (framing.cue.x + framing.object.x + framing.pocket.center.x) / 3;
  const centerZ = (framing.cue.z + framing.object.z + framing.pocket.center.z) / 3;
  return {
    position: {
      x: framing.cue.x - sin * distance,
      y: height,
      z: framing.cue.z + cos * distance,
    },
    lookAt: { x: centerX, y: 0.005, z: centerZ },
  };
}

/**
 * 目标身份/袋口在确认时稳定；当前 azimuth 每帧传入，所以拨轮微调会更新构图方向但不会偷偷换袋。
 */
export function aimCameraPose(
  framing: CameraFraming,
  currentAzimuth: number,
  aspect: number,
): FramingResult {
  const safeAspect = clamp(Number.isFinite(aspect) ? aspect : 16 / 9, 0.25, 4);
  const points: FramingPoint[] = [];
  addSphereSurface(points, framing.cue);
  addSphereSurface(points, framing.object);
  points.push(...pocketContour(framing.pocket));
  // 从紧邻白球身后的安全下界起二分，而不是把 0.82m 当作硬最小距离；
  // 低机位/近距离只是软偏好，真正约束由完整球面、袋口和 HUD 安全区决定。
  const preferredDistance = 0.72;
  let low = 0.16;
  let high = 12;
  let best = aimPoseAtDistance(framing, currentAzimuth, high);
  let bestFit = withinSafety(points, best, safeAspect, framing.safety);
  // 对合理输入大距离一定可见；若不成立仍返回最保守机位，让调用方可报告而不是 NaN。
  if (!bestFit.fits) return { pose: best, occupancy: bestFit.occupancy, elevatedOrRetreated: true };
  for (let step = 0; step < 30; step += 1) {
    const middle = (low + high) / 2;
    const candidate = aimPoseAtDistance(framing, currentAzimuth, middle);
    const fit = withinSafety(points, candidate, safeAspect, framing.safety);
    if (fit.fits) {
      high = middle;
      best = candidate;
      bestFit = fit;
    } else {
      low = middle;
    }
  }
  return {
    pose: best,
    occupancy: bestFit.occupancy,
    elevatedOrRetreated: high > preferredDistance * 1.08 || best.position.y > 0.3,
  };
}

/** 全台只拟合真实木帮外缘与六袋所在的边界，不再保留固定 3.7m / 23% 余量。 */
export function fullTableCameraPose(input: {
  aspect: number;
  azimuth: number;
  halfWidth: number;
  halfLength: number;
  orbitRadius?: number;
  safety?: Partial<CameraSafetyInsets>;
}): FramingResult {
  const aspect = clamp(Number.isFinite(input.aspect) ? input.aspect : 16 / 9, 0.25, 4);
  const safety = normalizedSafety(input.safety);
  const sin = Math.sin(input.azimuth);
  const cos = Math.cos(input.azimuth);
  const orbit = input.orbitRadius ?? 0.85;
  const points: FramingPoint[] = [
    { x: -input.halfWidth, y: 0.04, z: -input.halfLength },
    { x: input.halfWidth, y: 0.04, z: -input.halfLength },
    { x: -input.halfWidth, y: 0.04, z: input.halfLength },
    { x: input.halfWidth, y: 0.04, z: input.halfLength },
  ];
  const safeCenterX = safety.left - safety.right;
  const safeCenterY = safety.bottom - safety.top;
  const basePoseAtHeight = (height: number): FramingPose => ({
    position: { x: -sin * orbit, y: height, z: cos * orbit },
    lookAt: { x: -sin * 0.05, y: 0, z: cos * 0.05 },
  });
  // 先用完整外框的实际投影把它置到可用矩形中心，再检查四边拟合。
  // 必须把 position 与 lookAt 作为刚体在屏幕 right/up 平面共同平移：只动 lookAt 会改变
  // yaw/pitch，让竖屏球台斜过来并被迫拉远。共同平移保持球台方位和透视基准不变。
  const poseForHeight = (height: number): FramingPose => {
    const base = basePoseAtHeight(height);
    // 对称安全区没有平移目标，跳过数值求解以保持 180° 环绕的位姿严格对称。
    if (Math.abs(safeCenterX) < 1e-12 && Math.abs(safeCenterY) < 1e-12) {
      return base;
    }
    const basis = basisForPose(base);
    const distance = Math.hypot(
      base.lookAt.x - base.position.x,
      base.lookAt.y - base.position.y,
      base.lookAt.z - base.position.z,
    );
    const tanHalf = Math.tan((CAMERA_FOV_DEGREES * Math.PI) / 360);
    // 由屏幕中心偏移得到足够接近的刚体平移初值，后续只修正透视下外框的微小不对称。
    let shiftRight = -safeCenterX * distance * tanHalf * aspect;
    let shiftUp = -safeCenterY * distance * tanHalf;
    const measure = (right: number, up: number) => {
      const translateX = basis.rx * right + basis.ux * up;
      const translateY = basis.uy * up;
      const translateZ = basis.rz * right + basis.uz * up;
      const pose: FramingPose = {
        position: {
          x: base.position.x + translateX,
          y: base.position.y + translateY,
          z: base.position.z + translateZ,
        },
        lookAt: {
          x: base.lookAt.x + translateX,
          y: base.lookAt.y + translateY,
          z: base.lookAt.z + translateZ,
        },
      };
      const bounds = projectedBounds(points, pose, aspect);
      return { pose, bounds };
    };
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const current = measure(shiftRight, shiftUp);
      if (!current.bounds) break;
      const centerX = (current.bounds.minX + current.bounds.maxX) / 2;
      const centerY = (current.bounds.minY + current.bounds.maxY) / 2;
      const errorX = safeCenterX - centerX;
      const errorY = safeCenterY - centerY;
      if (Math.hypot(errorX, errorY) < 1e-5) return current.pose;
      const step = Math.max(0.01, distance * 0.002);
      const rightSample = measure(shiftRight + step, shiftUp).bounds;
      const upSample = measure(shiftRight, shiftUp + step).bounds;
      if (!rightSample || !upSample) break;
      const rightCenterX = (rightSample.minX + rightSample.maxX) / 2;
      const rightCenterY = (rightSample.minY + rightSample.maxY) / 2;
      const upCenterX = (upSample.minX + upSample.maxX) / 2;
      const upCenterY = (upSample.minY + upSample.maxY) / 2;
      const j11 = (rightCenterX - centerX) / step;
      const j12 = (upCenterX - centerX) / step;
      const j21 = (rightCenterY - centerY) / step;
      const j22 = (upCenterY - centerY) / step;
      const determinant = j11 * j22 - j12 * j21;
      if (Math.abs(determinant) < 1e-8) break;
      const moveRight = (errorX * j22 - j12 * errorY) / determinant;
      const moveUp = (j11 * errorY - errorX * j21) / determinant;
      shiftRight += clamp(moveRight, -0.65, 0.65);
      shiftUp += clamp(moveUp, -0.65, 0.65);
    }
    return measure(shiftRight, shiftUp).pose;
  };
  let low = 0.1;
  let high = 20;
  let best = poseForHeight(high);
  let fit = withinSafety(points, best, aspect, safety);
  if (!fit.fits) return { pose: best, occupancy: fit.occupancy, elevatedOrRetreated: true };
  for (let step = 0; step < 34; step += 1) {
    const middle = (low + high) / 2;
    const candidate = poseForHeight(middle);
    const candidateFit = withinSafety(points, candidate, aspect, safety);
    if (candidateFit.fits) {
      high = middle;
      best = candidate;
      fit = candidateFit;
    } else {
      low = middle;
    }
  }
  return { pose: best, occupancy: fit.occupancy, elevatedOrRetreated: false };
}

/** 供测试/Scene3D 验证完整轮廓的独立投影真值。 */
export function projectFramingPoint(point: FramingPoint, pose: FramingPose, aspect: number) {
  return projectPoint(point, pose, aspect);
}

export function aimFramingPoints(framing: CameraFraming): FramingPoint[] {
  const points: FramingPoint[] = [];
  addSphereSurface(points, framing.cue);
  addSphereSurface(points, framing.object);
  points.push(...pocketContour(framing.pocket));
  return points;
}

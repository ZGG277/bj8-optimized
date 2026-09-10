/*
[INPUT]: 390×844/1280×800/844×390 的白球、目标球、袋口与木帮几何
[OUTPUT]: 验证球面/袋口完整投影、安全区、薄切回退与全台紧密拟合
[POS]: 自适应构图的独立几何真值；不复用拟合器的内部边界判断
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  AIM_CAMERA_ELEVATION_DEGREES,
  aimCameraPose,
  aimFramingPoints,
  cameraSafetyFromControlRects,
  cameraControlRectsFromElements,
  createAimCameraFraming,
  DEFAULT_CAMERA_SAFETY,
  framingForConfirmedAim,
  fullTableCameraPose,
  projectFramingPoint,
  type CameraFraming,
} from './camera-framing';

const ballRadius = 0.028575;

function framing(overrides: Partial<CameraFraming> = {}): CameraFraming {
  return createAimCameraFraming({
    kind: 'aim',
    targetNumber: 3,
    pocketIndex: 1,
    cue: { x: -0.4, y: ballRadius, z: 0.78, radius: ballRadius },
    object: { x: 0.12, y: ballRadius, z: -0.12, radius: ballRadius },
    pocket: {
      index: 1,
      center: { x: 0.56, y: 0.005, z: -1.23 },
      left: { x: 0.60, y: 0.005, z: -1.19 },
      right: { x: 0.53, y: 0.005, z: -1.27 },
      depth: 0.052,
      outward: { x: 0.707, z: -0.707 },
    },
    safety: { top: 0.06, right: 0.06, bottom: 0.06, left: 0.06 },
    ...overrides,
  });
}

function expectAimInsideSafeArea(input: CameraFraming, aspect: number, azimuth: number) {
  const result = aimCameraPose(input, azimuth, aspect);
  const safety = input.safety;
  for (const point of aimFramingPoints(input)) {
    const projection = projectFramingPoint(point, result.pose, aspect);
    expect(projection).not.toBeNull();
    expect(projection!.x).toBeGreaterThanOrEqual(-1 + safety.left * 2 - 1e-6);
    expect(projection!.x).toBeLessThanOrEqual(1 - safety.right * 2 + 1e-6);
    expect(projection!.y).toBeGreaterThanOrEqual(-1 + safety.bottom * 2 - 1e-6);
    expect(projection!.y).toBeLessThanOrEqual(1 - safety.top * 2 + 1e-6);
  }
  expect(result.occupancy).toBeGreaterThan(0.5);
  return result;
}

function threeProjection(
  point: { x: number; y: number; z: number },
  pose: { position: { x: number; y: number; z: number }; lookAt: { x: number; y: number; z: number } },
  aspect: number,
) {
  const camera = new PerspectiveCamera(46, aspect, 0.01, 60);
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
  camera.updateMatrixWorld(true);
  return new Vector3(point.x, point.y, point.z).project(camera);
}

describe('adaptive camera framing', () => {
  it('幽灵球确认后的偏好机位轻微抬高到 28°', () => {
    const input = framing();
    const result = aimCameraPose(input, 0.3, 1280 / 800);
    const horizontal = Math.hypot(
      result.pose.position.x - input.cue.x,
      result.pose.position.z - input.cue.z,
    );
    const elevation = Math.atan2(result.pose.position.y, horizontal) * 180 / Math.PI;
    expect(AIM_CAMERA_ELEVATION_DEGREES).toBe(28);
    expect(elevation).toBeGreaterThanOrEqual(27.9);
    expect(elevation).toBeLessThan(34);
  });

  it('与 Three.js lookAt 的左右轴完全一致，避免右侧 HUD 安全区镜像', () => {
    const pose = { position: { x: 0, y: 0, z: 2 }, lookAt: { x: 0, y: 0, z: 0 } };
    const worldRight = { x: 0.4, y: 0, z: 0 };
    const pure = projectFramingPoint(worldRight, pose, 1);
    const three = threeProjection(worldRight, pose, 1);
    expect(pure?.x).toBeGreaterThan(0);
    expect(pure?.x).toBeCloseTo(three.x, 10);
    expect(pure?.y).toBeCloseTo(three.y, 10);
  });

  it('没有稳定首碰目标或袋口时明确回退，不擅自改变用户杆向', () => {
    const fallback = framingForConfirmedAim(null);
    expect(fallback).toEqual({ framing: null, fallback: true });
  });

  it.each([
    [390, 844],
    [1280, 800],
    [844, 390],
  ])('在 %s×%s 中完整放入白球、首碰球和袋口轮廓', (width, height) => {
    expectAimInsideSafeArea(framing(), width / height, 0.52);
  });

  it('近袋局面仍保留完整球面与袋腔轮廓，而不是只放入球心', () => {
    const nearPocket = framing({
      object: { x: 0.46, y: ballRadius, z: -1.08, radius: ballRadius },
    });
    expectAimInsideSafeArea(nearPocket, 390 / 844, 0.38);
  });

  it('长台薄切会为安全区抬高或后退，且杆向变化不会重选目标身份', () => {
    const thinCut = framing({
      cue: { x: -0.56, y: ballRadius, z: 1.12, radius: ballRadius },
      object: { x: 0.50, y: ballRadius, z: -0.76, radius: ballRadius },
      safety: { top: 0.08, right: 0.2, bottom: 0.18, left: 0.08 },
    });
    const initial = expectAimInsideSafeArea(thinCut, 390 / 844, 0.63);
    const afterDial = expectAimInsideSafeArea(thinCut, 390 / 844, 0.76);
    expect(initial.elevatedOrRetreated).toBe(true);
    expect(afterDial.pose.position.x).not.toBeCloseTo(initial.pose.position.x, 6);
    expect(thinCut.targetNumber).toBe(3);
    expect(thinCut.pocketIndex).toBe(1);
  });

  it('右/底停靠控件只占用相应边缘，不因自由控件压缩全部视口', () => {
    const safety = cameraSafetyFromControlRects(
      { left: 0, top: 0, right: 390, bottom: 844 },
      [
        { left: 322, top: 210, right: 390, bottom: 360, dockEdge: 'right' },
        { left: 110, top: 760, right: 280, bottom: 844, dockEdge: 'bottom' },
        { left: 130, top: 330, right: 250, bottom: 460, dockEdge: 'free' },
      ],
    );
    expect(safety.right).toBeGreaterThan(0.17);
    expect(safety.bottom).toBeGreaterThan(0.11);
    expect(safety.left).toBeLessThan(0.1);
    expect(safety.top).toBeLessThan(0.1);
  });

  it('默认自由瞄准拨轮贴近下缘并横跨球桌时，仅把它纳入 bottom 安全区', () => {
    const safety = cameraSafetyFromControlRects(
      { left: 0, top: 0, right: 1280, bottom: 800 },
      [
        { id: 'aimDial', left: 515, top: 643, right: 765, bottom: 701, dockEdge: 'free' },
        { id: 'spin', left: 100, top: 260, right: 190, bottom: 330, dockEdge: 'free' },
      ],
    );
    expect(safety.bottom).toBeGreaterThanOrEqual(0.21);
    expect(safety.top).toBe(DEFAULT_CAMERA_SAFETY.top);
    expect(safety.left).toBe(DEFAULT_CAMERA_SAFETY.left);
  });

  it('保留 Game 实际 data-dock-edge=free 的 aimDial，再由安全策略判定遮挡', () => {
    const controls = cameraControlRectsFromElements([{
      dataset: { controlSlot: 'aimDial', dockEdge: 'free' },
      getBoundingClientRect: () => ({ left: 515, top: 643, right: 765, bottom: 701 }),
    }, {
      dataset: { controlSlot: 'spin', dockEdge: 'free' },
      getBoundingClientRect: () => ({ left: 100, top: 260, right: 190, bottom: 330 }),
    }]);
    expect(controls).toEqual([
      { id: 'aimDial', left: 515, top: 643, right: 765, bottom: 701, dockEdge: 'free' },
      { id: 'spin', left: 100, top: 260, right: 190, bottom: 330, dockEdge: 'free' },
    ]);
    const safety = cameraSafetyFromControlRects(
      { left: 0, top: 0, right: 1280, bottom: 800 }, controls,
    );
    expect(safety.bottom).toBeGreaterThanOrEqual(0.21);
  });

  it('全台对齐非对称可用矩形中心，避开默认拨轮而非只额外拉远', () => {
    const safety = cameraSafetyFromControlRects(
      { left: 0, top: 0, right: 1280, bottom: 800 },
      [{ id: 'aimDial', left: 515, top: 643, right: 765, bottom: 701, dockEdge: 'free' }],
    );
    const result = fullTableCameraPose({
      aspect: 1280 / 800,
      azimuth: Math.PI / 2,
      halfWidth: 0.76,
      halfLength: 1.4,
      safety,
    });
    const projections = [-0.76, 0.76].flatMap(x => [-1.4, 1.4].map(z =>
      threeProjection({ x, y: 0.04, z }, result.pose, 1280 / 800)));
    const pockets = [
      [-0.635, -1.27], [0.635, -1.27], [-0.635, 0],
      [0.635, 0], [-0.635, 1.27], [0.635, 1.27],
    ].map(([x, z]) => threeProjection({ x, y: 0.04, z }, result.pose, 1280 / 800));
    const minX = Math.min(...projections.map(point => point.x));
    const maxX = Math.max(...projections.map(point => point.x));
    const minY = Math.min(...projections.map(point => point.y));
    const maxY = Math.max(...projections.map(point => point.y));
    expect(minX).toBeGreaterThanOrEqual(-1 + safety.left * 2 - 1e-6);
    expect(maxX).toBeLessThanOrEqual(1 - safety.right * 2 + 1e-6);
    expect(minY).toBeGreaterThanOrEqual(-1 + safety.bottom * 2 - 1e-6);
    expect(maxY).toBeLessThanOrEqual(1 - safety.top * 2 + 1e-6);
    expect((minY + maxY) / 2).toBeCloseTo(safety.bottom - safety.top, 3);
    for (const pocket of pockets) {
      expect(pocket.x).toBeGreaterThanOrEqual(-1 + safety.left * 2 - 1e-6);
      expect(pocket.x).toBeLessThanOrEqual(1 - safety.right * 2 + 1e-6);
      expect(pocket.y).toBeGreaterThanOrEqual(-1 + safety.bottom * 2 - 1e-6);
      expect(pocket.y).toBeLessThanOrEqual(1 - safety.top * 2 + 1e-6);
    }
  });

  it('390×844 非对称右/底安全区保持竖台基准，不因避 HUD 引入 yaw', () => {
    const aspect = 390 / 844;
    const safety = { top: 0.045, right: 0.16, bottom: 0.2, left: 0.045 };
    const result = fullTableCameraPose({
      aspect,
      azimuth: 0,
      halfWidth: 0.76,
      halfLength: 1.4,
      safety,
    });
    const leftNear = threeProjection({ x: -0.76, y: 0.04, z: -1.4 }, result.pose, aspect);
    const leftFar = threeProjection({ x: -0.76, y: 0.04, z: 1.4 }, result.pose, aspect);
    const rightNear = threeProjection({ x: 0.76, y: 0.04, z: -1.4 }, result.pose, aspect);
    const rightFar = threeProjection({ x: 0.76, y: 0.04, z: 1.4 }, result.pose, aspect);
    // position/lookAt 的 x 差为零，证明 HUD 偏移没有引入 yaw；同一条长边剩余 x 差
    // 仅来自俯视透视缩放（390px 上约 15px），而非原先约 12° 的旋转。
    expect(result.pose.lookAt.x - result.pose.position.x).toBeCloseTo(0, 10);
    expect(Math.abs(leftNear.x - leftFar.x)).toBeLessThan(0.09);
    expect(Math.abs(rightNear.x - rightFar.x)).toBeLessThan(0.09);
    // 两条短边保持横向，y 只允许相机俯仰带来的轻微透视差。
    expect(Math.abs(leftNear.y - rightNear.y)).toBeLessThan(0.025);
    expect(Math.abs(leftFar.y - rightFar.y)).toBeLessThan(0.025);
    // 相比浏览器故障版 6.5016m，方向固定后以约 5.01m 完成同一安全拟合，
    // 因此同 FOV 下球的屏幕直径至少提升约 6.5/5.02 倍。
    expect(result.pose.position.y).toBeLessThan(5.02);
  });

  it('以 Three.js 独立投影验证非对称右/底安全区中的完整球体', () => {
    const asymmetric = framing({
      safety: { top: 0.045, right: 0.22, bottom: 0.16, left: 0.04 },
    });
    const aspect = 390 / 844;
    const result = aimCameraPose(asymmetric, 0.52, aspect);
    const minX = -1 + asymmetric.safety.left * 2;
    const maxX = 1 - asymmetric.safety.right * 2;
    const minY = -1 + asymmetric.safety.bottom * 2;
    const maxY = 1 - asymmetric.safety.top * 2;
    // 用独立的高密度球面采样验收，而拟合器本身只使用可证明安全的包围立方体。
    for (const ball of [asymmetric.cue, asymmetric.object]) {
      for (let latitude = 0; latitude <= 12; latitude += 1) {
        const phi = (latitude / 12) * Math.PI;
        for (let longitude = 0; longitude < 32; longitude += 1) {
          const theta = (longitude / 32) * Math.PI * 2;
          const point = {
            x: ball.x + ball.radius * Math.sin(phi) * Math.cos(theta),
            y: ball.y + ball.radius * Math.cos(phi),
            z: ball.z + ball.radius * Math.sin(phi) * Math.sin(theta),
          };
          const projected = threeProjection(point, result.pose, aspect);
          expect(projected.x).toBeGreaterThanOrEqual(minX - 1e-6);
          expect(projected.x).toBeLessThanOrEqual(maxX + 1e-6);
          expect(projected.y).toBeGreaterThanOrEqual(minY - 1e-6);
          expect(projected.y).toBeLessThanOrEqual(maxY + 1e-6);
        }
      }
    }
  });

  it.each([
    [390, 844, 0],
    [1280, 800, Math.PI / 2],
    [844, 390, Math.PI / 2],
  ])('全台在 %s×%s 用实际投影紧密放入六袋和木帮边界', (width, height, azimuth) => {
    const result = fullTableCameraPose({
      aspect: width / height,
      azimuth,
      halfWidth: 0.76,
      halfLength: 1.4,
      safety: { top: 0.035, right: 0.035, bottom: 0.035, left: 0.035 },
    });
    const corners = [-0.76, 0.76].flatMap(x => [-1.4, 1.4].map(z => ({ x, y: 0.04, z })));
    let maxUse = 0;
    for (const corner of corners) {
      const projected = projectFramingPoint(corner, result.pose, width / height);
      expect(projected).not.toBeNull();
      expect(Math.abs(projected!.x)).toBeLessThanOrEqual(0.94);
      expect(Math.abs(projected!.y)).toBeLessThanOrEqual(0.94);
      maxUse = Math.max(maxUse, Math.abs(projected!.x), Math.abs(projected!.y));
    }
    expect(maxUse).toBeGreaterThan(0.78);
  });
});

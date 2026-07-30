/*
[INPUT]: camera-view 连续视角、独立方位角与竖屏全台适配纯几何
[OUTPUT]: 锁定端点、任意高度、全局视角阈值、环绕独立性及竖屏六袋安全边界回归
[POS]: 连续视角相机回归测试
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  CAMERA_FOV_DEGREES,
  FIRST_PERSON_VIEW,
  GLOBAL_CAMERA_VIEW_LEVEL,
  OVERHEAD_VIEW,
  SPECTATOR_VIEW_LEVEL,
  cameraAzimuthAfterDrag,
  cameraAzimuthAtView,
  cameraPoseAt,
  clampViewLevel,
  isGlobalCameraView,
  normalizeCameraAzimuth,
  viewLevelLabel,
} from './camera-view';

describe('continuous camera view', () => {
  it('钳制任意输入并保留端点语义', () => {
    expect(clampViewLevel(-1)).toBe(FIRST_PERSON_VIEW);
    expect(clampViewLevel(0.43)).toBe(0.43);
    expect(clampViewLevel(2)).toBe(OVERHEAD_VIEW);
    expect(clampViewLevel(Number.NaN)).toBe(FIRST_PERSON_VIEW);
    expect(viewLevelLabel(0)).toBe('第一人称');
    expect(viewLevelLabel(0.43)).toBe('视角高度 43%');
    expect(viewLevelLabel(1)).toBe('俯视');
  });

  it('全局高度从统一阈值开始冻结球台视觉方位', () => {
    expect(isGlobalCameraView(GLOBAL_CAMERA_VIEW_LEVEL - 0.001)).toBe(false);
    expect(isGlobalCameraView(GLOBAL_CAMERA_VIEW_LEVEL)).toBe(true);
    expect(isGlobalCameraView(OVERHEAD_VIEW)).toBe(true);
  });

  it('高度随推杆位置单调抬升且中间值不会吸附端点', () => {
    const heights = [0, 0.2, 0.43, 0.75, 1].map(
      level => cameraPoseAt(0.18, 0.62, 0.3, 0, level).position.y,
    );
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(heights[2]).toBeGreaterThan(heights[1]);
    expect(heights[2]).toBeLessThan(heights[3]);
  });

  it.each([0, 0.25, 0.6, 1])('在高度 %s 转向 180° 会环绕到球台另一侧', (level) => {
    const forward = cameraPoseAt(0, 0, 0, 0, level);
    const reverse = cameraPoseAt(0, 0, Math.PI, 0, level);
    expect(forward.position.z * reverse.position.z).toBeLessThan(0);
    expect(Math.abs(forward.position.y - reverse.position.y)).toBeLessThan(1e-10);
  });

  it('俯视端沿世界杆向绕球台中心旋转而不是锁死方向', () => {
    const north = cameraPoseAt(0.3, 0.8, 0, 0, 1);
    const east = cameraPoseAt(0.3, 0.8, Math.PI / 2, 0, 1);
    expect(north.position.x).toBeCloseTo(0, 10);
    expect(north.position.z).toBeCloseTo(0.85, 10);
    expect(east.position.x).toBeCloseTo(-0.85, 10);
    expect(east.position.z).toBeCloseTo(0, 10);
  });

  it('观战环绕只换算视觉方位角，不需要也不会返回瞄准事实', () => {
    const aimAngle = 0.37;
    const cameraBefore = -0.8;
    const cameraAfter = cameraAzimuthAfterDrag(cameraBefore, 120);
    expect(cameraAfter).not.toBe(cameraBefore);
    expect(aimAngle).toBe(0.37);
    expect(normalizeCameraAzimuth(cameraAfter + Math.PI * 2)).toBeCloseTo(cameraAfter, 10);
  });

  it('观战或主动全局模式保持视觉方位，拉回第一人称时沿最短圆弧回接杆向', () => {
    const cameraAzimuth = Math.PI - 0.1;
    const aimAngle = -Math.PI + 0.1;
    expect(cameraAzimuthAtView(cameraAzimuth, aimAngle, 0.82, true))
      .toBeCloseTo(cameraAzimuth, 10);
    const middle = cameraAzimuthAtView(cameraAzimuth, aimAngle, 0.25, true);
    expect(Math.abs(normalizeCameraAzimuth(middle - aimAngle))).toBeLessThan(0.2);
    expect(cameraAzimuthAtView(cameraAzimuth, aimAngle, 0, true))
      .toBeCloseTo(aimAngle, 10);
    expect(cameraAzimuthAtView(cameraAzimuth, aimAngle, 1, false))
      .toBeCloseTo(aimAngle, 10);
  });

  it.each([0, Math.PI / 2])(
    '390×844 竖屏观战位姿在方位角 %s 下仍把木帮外缘留在安全边界内',
    (cameraAzimuth) => {
      const aspect = 324 / 810;
      const pose = cameraPoseAt(
        0,
        0.55,
        cameraAzimuth,
        0,
        SPECTATOR_VIEW_LEVEL,
        aspect,
      );
      const camera = new PerspectiveCamera(CAMERA_FOV_DEGREES, aspect, 0.01, 60);
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
      camera.updateMatrixWorld(true);

      const corners = [
        [-0.76, -1.4],
        [0.76, -1.4],
        [-0.76, 1.4],
        [0.76, 1.4],
      ];
      for (const [x, z] of corners) {
        const projected = new Vector3(x, 0, z).project(camera);
        expect(Math.abs(projected.x)).toBeLessThanOrEqual(0.94);
        expect(Math.abs(projected.y)).toBeLessThanOrEqual(0.94);
      }
    },
  );
});

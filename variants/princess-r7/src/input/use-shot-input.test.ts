/*
[INPUT]: 依赖 vitest 与 use-shot-input 导出的纯按键瞄准积分函数
[OUTPUT]: 键盘持续瞄准在不同刷新率下等价、长按速度封顶且标签页恢复不跳角的回归断言
[POS]: input 协调器纯数值测试，不挂载 React/DOM/rAF
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import {
  AIM_MAX_SPEED,
  aimDeltaForHold,
} from './use-shot-input';

function integrate(seconds: number, fps: number): number {
  const dt = 1 / fps;
  let angle = 0;
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += dt) {
    angle += aimDeltaForHold(1, elapsed, dt);
  }
  return angle;
}

describe('持续按键瞄准积分', () => {
  it('60Hz 与 120Hz 按住 2 秒得到近似相同角度', () => {
    expect(integrate(2, 60)).toBeCloseTo(integrate(2, 120), 2);
  });

  it('长按速度封顶，单帧最大增量不超过 maxSpeed×50ms', () => {
    expect(aimDeltaForHold(1, 100, 1)).toBeCloseTo(AIM_MAX_SPEED * 0.05, 8);
  });

  it('左右方向严格对称', () => {
    expect(aimDeltaForHold(-1, 1.2, 1 / 60)).toBeCloseTo(
      -aimDeltaForHold(1, 1.2, 1 / 60),
      10,
    );
  });
});

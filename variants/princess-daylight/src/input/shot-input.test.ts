/*
[INPUT]: shot-input 纯换算函数与构造的拖拽/按压会话
[OUTPUT]: 对外验证输入确定性:行程归一、保底力度、按住满力时长、击球点单位圆约束
[POS]: input 目录的单元测试层,只断言数值与结构,不依赖 DOM 或 rAF
[PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import {
  buildShotIntent,
  clampSpin,
  HOLD_FULL_MS,
  MIN_POWER,
  normalizeTravel,
  powerFromDrag,
  powerFromHold,
} from './shot-input';

describe('powerFromDrag:可用行程归一化', () => {
  it('98px 可用距离拖到底得到 100', () => {
    expect(powerFromDrag(300, 398, 98)).toBe(100);
  });

  it('行程窗口下限 72:更短行程按 72 归一', () => {
    expect(normalizeTravel(20)).toBe(72);
    expect(powerFromDrag(300, 372, 20)).toBe(100);
  });

  it('行程窗口上限 180:更长行程按 180 归一', () => {
    expect(normalizeTravel(600)).toBe(180);
    expect(powerFromDrag(100, 280, 600)).toBe(100);
    expect(powerFromDrag(100, 190, 600)).toBe(50);
  });

  it('轻点(无位移)给保底力度 6', () => {
    expect(powerFromDrag(300, 300, 120)).toBe(MIN_POWER);
    expect(powerFromDrag(300, 280, 120)).toBe(MIN_POWER); // 上拉也不算负力
  });

  it('半程拖拽约半程力度', () => {
    expect(powerFromDrag(200, 260, 120)).toBe(50);
  });
});

describe('powerFromHold:真实时长决定最终力度', () => {
  it('1350ms 得到 81±1', () => {
    const p = powerFromHold(1000, 2350);
    expect(Math.abs(p - 81)).toBeLessThanOrEqual(1);
  });

  it('1667ms 满力,超出仍为 100', () => {
    expect(powerFromHold(0, HOLD_FULL_MS)).toBe(100);
    expect(powerFromHold(0, 5000)).toBe(100);
  });

  it('瞬时松手给保底力度 6', () => {
    expect(powerFromHold(500, 500)).toBe(MIN_POWER);
  });

  it('最终值只由松开时刻决定,与预览帧数无关', () => {
    // 模拟 rAF 只跑了 3 帧(低帧率),松开时刻仍是 2350
    const previewFrames = [1016, 1033, 1050].map(t => powerFromHold(1000, t));
    expect(Math.max(...previewFrames)).toBeLessThan(10);
    expect(Math.abs(powerFromHold(1000, 2350) - 81)).toBeLessThanOrEqual(1);
  });
});

describe('clampSpin:击球点单位圆约束', () => {
  const bounds = { width: 100, height: 100 };

  it('中心为中杆', () => {
    expect(clampSpin({ x: 50, y: 50 }, bounds)).toEqual({ x: 0, y: 0 });
  });

  it('上边缘为高杆(x=+1)', () => {
    const s = clampSpin({ x: 50, y: 0 }, bounds);
    expect(s.x).toBeCloseTo(1, 5);
    expect(s.y).toBeCloseTo(0, 5);
  });

  it('右边缘为右塞(y=+1)', () => {
    const s = clampSpin({ x: 100, y: 50 }, bounds);
    expect(s.x).toBeCloseTo(0, 5);
    expect(s.y).toBeCloseTo(1, 5);
  });

  it('角落超出单位圆时等比收回', () => {
    const s = clampSpin({ x: 100, y: 100 }, bounds);
    expect(Math.hypot(s.x, s.y)).toBeCloseTo(1, 5);
  });

  it('异常尺寸不产出 NaN', () => {
    expect(clampSpin({ x: 10, y: 10 }, { width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('buildShotIntent:一次会话只产出一个意图', () => {
  it('拖拽会话', () => {
    const intent = buildShotIntent(
      { kind: 'drag', startY: 200, currentY: 272, availableTravel: 72 },
      { x: 0.5, y: -0.5 },
    );
    expect(intent).toEqual({ power: 100, spin: { x: 0.5, y: -0.5 } });
  });

  it('按压会话以松开时刻重算', () => {
    const intent = buildShotIntent({ kind: 'hold', startTime: 1000 }, { x: 0, y: 0 }, 2350);
    expect(Math.abs(intent.power - 81)).toBeLessThanOrEqual(1);
  });

  it('击球点越界也会被收回单位圆', () => {
    const intent = buildShotIntent(
      { kind: 'drag', startY: 0, currentY: 10, availableTravel: 100 },
      { x: 3, y: -2 },
    );
    expect(intent.spin.x).toBe(1);
    expect(intent.spin.y).toBe(-1);
  });
});

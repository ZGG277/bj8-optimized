/*
[INPUT]: ShootControl 出杆提交走廊纯判定函数
[OUTPUT]: 回归顺蓄力方向可越边满力、横向/反向移出则取消
[POS]: 出杆误触取消几何回归，不依赖 DOM
[PROTOCOL]: 取消走廊或容错距离变化时同步更新 ShootControl.tsx 与 components/CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import {
  CHARGE_ESCAPE_PADDING_PX,
  isChargePointerInCommitCorridor,
} from './ShootControl';

const gesture = {
  startX: 100,
  startY: 100,
  rect: { left: 80, right: 120, top: 70, bottom: 170 },
};

describe('isChargePointerInCommitCorridor', () => {
  it('竖向蓄力向下越过控件底部仍可提交满力', () => {
    expect(isChargePointerInCommitCorridor(gesture, 'vertical', 100, 400)).toBe(true);
  });

  it('竖向蓄力缓慢横向移出容错走廊则取消', () => {
    expect(isChargePointerInCommitCorridor(
      gesture,
      'vertical',
      gesture.rect.left - CHARGE_ESCAPE_PADDING_PX - 1,
      130,
    )).toBe(false);
  });

  it('底部横向蓄力向右越边有效，向上移出则取消', () => {
    expect(isChargePointerInCommitCorridor(gesture, 'horizontal', 400, 100)).toBe(true);
    expect(isChargePointerInCommitCorridor(
      gesture,
      'horizontal',
      130,
      gesture.rect.top - CHARGE_ESCAPE_PADDING_PX - 1,
    )).toBe(false);
  });

  it('手指轻微偏离仍在 24px 容错内', () => {
    expect(isChargePointerInCommitCorridor(
      gesture,
      'vertical',
      gesture.rect.right + CHARGE_ESCAPE_PADDING_PX,
      130,
    )).toBe(true);
  });
});

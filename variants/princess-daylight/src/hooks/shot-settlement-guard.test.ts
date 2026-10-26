/*
[INPUT]: 依赖 vitest 与 shot-settlement-guard 纯幂等原语
[OUTPUT]: 同杆去重与跨局相同 shotId 可重新结算的回归断言
[POS]: hooks 层结算生命周期测试，不挂载 React
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import { createShotSettlementGuard } from './shot-settlement-guard';

describe('ShotSettlementGuard', () => {
  it('同一局同杆只接收一次', () => {
    const guard = createShotSettlementGuard();
    expect(guard.accept(1)).toBe(true);
    expect(guard.accept(1)).toBe(false);
    expect(guard.accept(2)).toBe(true);
  });

  it('新局 reset 后可重新接收与上一局相同的 shotId', () => {
    const guard = createShotSettlementGuard();
    expect(guard.accept(1)).toBe(true);
    guard.reset();
    expect(guard.accept(1)).toBe(true);
  });
});

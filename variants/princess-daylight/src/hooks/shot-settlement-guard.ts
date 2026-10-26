/*
[INPUT]: 只接收 physics shotId 与显式 reset 生命周期
[OUTPUT]: 对外提供 createShotSettlementGuard，保证同局同杆仅结算一次且新局可重新接收相同 shotId
[POS]: hooks 层的纯结算幂等原语；不依赖 React、物理世界或规则状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
export type ShotSettlementGuard = {
  accept: (shotId: number) => boolean;
  reset: () => void;
};

export function createShotSettlementGuard(): ShotSettlementGuard {
  let lastSettledShot = 0;
  return {
    accept(shotId) {
      if (shotId === lastSettledShot) return false;
      lastSettledShot = shotId;
      return true;
    },
    reset() {
      lastSettledShot = 0;
    },
  };
}

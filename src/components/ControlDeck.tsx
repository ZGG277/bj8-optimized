/*
[INPUT]: 依赖 matchMessage、canAim、spin、charging、previewPower、走位规划状态与事件回调
[OUTPUT]: 渲染控制区（消息提示、💡 走位按钮三态常驻、瞄准微调、击球点盘、出杆区）
[POS]: HUD 组件层，组合 AimControls / SpinControl / ShootControl；不持有对局状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { AimControls } from './AimControls';
import { SpinControl } from './SpinControl';
import { ShootControl } from './ShootControl';
import type { CueSpin } from '../physics';
import type { PositionPlanStatus } from '../hooks/usePositionPlan';

interface ControlDeckProps {
  matchMessage: string;
  worldMoving: boolean;
  canAim: boolean;
  /** 玩家回合（aiming + actor=player + 球静止）：💡 按钮可见性唯一判据 */
  playerTurn: boolean;
  spin: CueSpin;
  charging: boolean;
  previewPower: number;
  breaking: boolean;
  planStatus: PositionPlanStatus;
  onAimAdjust: (d: number) => void;
  onSpinChange: (spin: CueSpin) => void;
  /** 💡 点击：ready=打开引导 / showing=关闭引导（与提示条 ✕ 等价）；其余态 disabled 不会触发 */
  onTogglePlan: () => void;
  onBeginCharge: (clientY: number, availableTravel: number) => void;
  onUpdateCharge: (clientY: number) => void;
  onReleaseCharge: () => void;
  onCancelCharge: () => void;
  onTapShot: () => void;
}

export function ControlDeck({
  matchMessage,
  worldMoving,
  canAim,
  playerTurn,
  spin,
  charging,
  previewPower,
  breaking,
  planStatus,
  onAimAdjust,
  onSpinChange,
  onTogglePlan,
  onBeginCharge,
  onUpdateCharge,
  onReleaseCharge,
  onCancelCharge,
  onTapShot,
}: ControlDeckProps) {
  // 💡 走位按钮三态常驻（玩家回合内）：
  //   is-lit  = ready（可点击打开）
  //   is-open = showing（引导展示中，点击=关闭，与 ✕ 等价）
  //   is-dim  = computing（呼吸）/ failed / idle（灰静态，disabled）
  // 非玩家回合用 visibility 隐藏而非卸载——保持 control-deck 网格列稳定，避免布局跳动破版
  const planStateClass =
    planStatus === 'ready'
      ? 'is-lit'
      : planStatus === 'showing'
        ? 'is-open'
        : planStatus === 'computing'
          ? 'is-dim is-computing'
          : 'is-dim';
  const planDisabled = planStatus !== 'ready' && planStatus !== 'showing';

  return (
    <footer className="control-deck">
      <div className="match-message">
        <span>{matchMessage}</span>
        {!worldMoving && <small>瞄好停一拍再出杆</small>}
      </div>

      <button
        type="button"
        className={`plan-button ${planStateClass}`}
        style={{ visibility: playerTurn ? 'visible' : 'hidden' }}
        aria-label="走位规划"
        disabled={planDisabled}
        onClick={onTogglePlan}
      >
        <strong>{planStatus === 'computing' ? '计算中' : '💡 走位'}</strong>
      </button>

      <AimControls disabled={!canAim} onAdjust={onAimAdjust} />

      <SpinControl spin={spin} disabled={!canAim} onSpinChange={onSpinChange} />

      <ShootControl
        disabled={!canAim}
        charging={charging}
        power={previewPower}
        breaking={breaking}
        onBegin={onBeginCharge}
        onUpdate={onUpdateCharge}
        onRelease={onReleaseCharge}
        onCancel={onCancelCharge}
        onTap={onTapShot}
      />
    </footer>
  );
}
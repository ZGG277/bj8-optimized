/*
[INPUT]: 禁用态与瞄准微调回调
[OUTPUT]: 对外提供 AimControls 瞄准微调按钮组,唯一 aria-label,禁用同时用透明度和删除线表达
[POS]: 控制组件层,只渲染方向微调,不持有瞄准角状态
[PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
*/

type Props = {
  disabled: boolean;
  onAdjust: (delta: number) => void;
};

/** 触屏设备用更小步进,避免一按就越过瞄准点 */
function adjustStep(): number {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 0.004 : 0.01;
}

export function AimControls({ disabled, onAdjust }: Props) {
  const step = adjustStep();
  return (
    <div className="aim-controls" onPointerDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label="瞄准向左微调"
        onClick={() => onAdjust(-step)}
        disabled={disabled}
      >
        ◀
      </button>
      <div>
        <strong>方向</strong>
        <small>微调</small>
      </div>
      <button
        type="button"
        aria-label="瞄准向右微调"
        onClick={() => onAdjust(step)}
        disabled={disabled}
      >
        ▶
      </button>
    </div>
  );
}

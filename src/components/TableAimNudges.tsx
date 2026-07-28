/*
[INPUT]: 可瞄准状态与自适应方向微调回调
[OUTPUT]: 球桌内部的左右外向大三角微调控件；移动端显示、桌面隐藏
[POS]: 控制组件层，保证方向触控命中区属于 viewport，不占用外部控制栏
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/

interface TableAimNudgesProps {
  disabled: boolean;
  onAdjust: (delta: number) => void;
}

const STEP = 0.01;

export function TableAimNudges({ disabled, onAdjust }: TableAimNudgesProps) {
  return (
    <div
      className="table-aim-nudges"
      aria-label="球桌内方向微调"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="aim-nudge-left"
        aria-label="向左精细调整击球方向"
        disabled={disabled}
        onClick={() => onAdjust(-STEP)}
      >
        ◀
      </button>
      <button
        type="button"
        className="aim-nudge-right"
        aria-label="向右精细调整击球方向"
        disabled={disabled}
        onClick={() => onAdjust(STEP)}
      >
        ▶
      </button>
    </div>
  );
}

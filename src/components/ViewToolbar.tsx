/*
[INPUT]: 当前视角模式与切换/旋转/俯身微调回调
[OUTPUT]: 对外提供 ViewToolbar 视角工具条,按钮自带 aria-pressed/aria-label 并拦截指针冒泡
[POS]: 控制组件层,只渲染视角切换、左右转与俯身微调,不持有视角状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/

type ViewMode = 'first' | 'overhead';

type Props = {
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  onRotate: (direction: -1 | 1) => void;
  onElevate: (direction: -1 | 1) => void;
};

/** 视角工具条:pointerdown 拦截冒泡,点击不会改变瞄准角 */
export function ViewToolbar({ viewMode, onViewMode, onRotate, onElevate }: Props) {
  return (
    <div
      className="view-switcher"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={viewMode === 'first' ? 'active' : ''}
        aria-pressed={viewMode === 'first'}
        onClick={() => onViewMode('first')}
      >
        第一人称
      </button>
      <button
        type="button"
        className={viewMode === 'overhead' ? 'active' : ''}
        aria-pressed={viewMode === 'overhead'}
        onClick={() => onViewMode('overhead')}
      >
        俯视
      </button>
      {viewMode === 'first' && (
        <>
          <button type="button" aria-label="视角向左转" onClick={() => onRotate(-1)}>◀</button>
          <button type="button" aria-label="视角向右转" onClick={() => onRotate(1)}>▶</button>
          <button type="button" aria-label="俯身角度抬高" onClick={() => onElevate(1)}>▲</button>
          <button type="button" aria-label="俯身角度压低" onClick={() => onElevate(-1)}>▼</button>
        </>
      )}
    </div>
  );
}

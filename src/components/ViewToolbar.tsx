/*
[INPUT]: 当前视角模式与切换/45° 粗调杆向/俯身微调回调
[OUTPUT]: 对外提供 ViewToolbar 视角与粗瞄工具条,按钮自带 aria-pressed/aria-label 并拦截指针冒泡
[POS]: 控制组件层,只渲染视角切换、世界杆向粗调与俯身微调,不持有状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/

type ViewMode = 'first' | 'overhead';

type Props = {
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  onRotate: (direction: -1 | 1) => void;
  onElevate: (direction: -1 | 1) => void;
};

/** 工具条:pointerdown 拦截冒泡；左右键显式以 45° 调整世界杆向。 */
export function ViewToolbar({ viewMode, onViewMode, onRotate, onElevate }: Props) {
  return (
    <div
      className="view-switcher"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`view-mode-button ${viewMode === 'first' ? 'active' : ''}`}
        aria-pressed={viewMode === 'first'}
        aria-label="切换第一人称视角"
        onClick={() => onViewMode('first')}
      >
        第一人称
      </button>
      <button
        type="button"
        className={`view-mode-button ${viewMode === 'overhead' ? 'active' : ''}`}
        aria-pressed={viewMode === 'overhead'}
        aria-label="切换俯视视角"
        onClick={() => onViewMode('overhead')}
      >
        俯视
      </button>
      {viewMode === 'first' && (
        <>
          <button className="view-extra-button" type="button" aria-label="杆向向左转 45 度" onClick={() => onRotate(-1)}>◀</button>
          <button className="view-extra-button" type="button" aria-label="杆向向右转 45 度" onClick={() => onRotate(1)}>▶</button>
          <button className="view-extra-button" type="button" aria-label="俯身角度抬高" onClick={() => onElevate(1)}>▲</button>
          <button className="view-extra-button" type="button" aria-label="俯身角度压低" onClick={() => onElevate(-1)}>▼</button>
        </>
      )}
    </div>
  );
}

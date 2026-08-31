/*
[INPUT]: 依赖连续视角高度、canAim、spin、charging、previewPower 与三项辅助开关状态/事件回调
[OUTPUT]: 渲染右侧黑色四控件轨及灯泡三入口菜单；长按整轨进入抖动编辑态，槽位仅在轨内纵向调整
[POS]: HUD 组件层，组合 ViewToolbar / 辅助菜单 / SpinControl / ShootControl；不持有对局状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { SpinControl } from './SpinControl';
import { ShootControl } from './ShootControl';
import { ViewToolbar } from './ViewToolbar';
import { useControlSlotDrag } from '../hooks/useControlSlotDrag';
import type { CueSpin } from '../physics';
import type { PositionPlanStatus } from '../hooks/usePositionPlan';

type ControlSlotId = 'view' | 'guidance' | 'spin' | 'shoot';
const LAYOUT_LONG_PRESS_MS = 420;

interface DraggableControlSlotProps {
  id: ControlSlotId;
  children: ReactNode;
  editing: boolean;
  railRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

function DraggableControlSlot({
  id,
  children,
  editing,
  railRef,
  className = '',
}: DraggableControlSlotProps) {
  const drag = useControlSlotDrag(id, editing, railRef);
  return (
    <div
      ref={drag.elementRef}
      data-control-slot={id}
      className={`control-slot control-slot-${id} ${drag.dragging ? 'is-dragging' : ''} ${className}`}
      style={drag.style}
      {...drag.slotDragProps}
    >
      <div className="control-slot-body">{children}</div>
    </div>
  );
}

interface ControlDeckProps {
  viewLevel: number;
  canAim: boolean;
  spin: CueSpin;
  charging: boolean;
  previewPower: number;
  breaking: boolean;
  planStatus: PositionPlanStatus;
  guidanceEnabled: boolean;
  hasReview: boolean;
  aimAssistEnabled: boolean;
  aimDialEnabled: boolean;
  onViewLevel: (level: number) => void;
  onSpinChange: (spin: CueSpin) => void;
  /** 💡 菜单内的走位与复盘开关 */
  onTogglePlan: () => void;
  onToggleAimAssist: () => void;
  onToggleAimDial: () => void;
  onBeginCharge: (clientY: number, availableTravel: number) => void;
  onUpdateCharge: (clientY: number) => void;
  onReleaseCharge: () => void;
  onCancelCharge: () => void;
  onTapShot: () => void;
}

export function ControlDeck({
  viewLevel,
  canAim,
  spin,
  charging,
  previewPower,
  breaking,
  planStatus,
  guidanceEnabled,
  hasReview,
  aimAssistEnabled,
  aimDialEnabled,
  onViewLevel,
  onSpinChange,
  onTogglePlan,
  onToggleAimAssist,
  onToggleAimDial,
  onBeginCharge,
  onUpdateCharge,
  onReleaseCharge,
  onCancelCharge,
  onTapShot,
}: ControlDeckProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const assistControlRef = useRef<HTMLDivElement>(null);
  const activationRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    timer: number;
  } | null>(null);
  const editingRef = useRef(false);
  const suppressRailClickRef = useRef(false);
  const suppressOutsideClickRef = useRef(false);
  const [editing, setEditing] = useState(false);
  const [assistMenuOpen, setAssistMenuOpen] = useState(false);
  editingRef.current = editing;

  // 灯泡只表达用户已打开的辅助，不因后台 ready/computing 自动亮起。
  const anyAssistEnabled = guidanceEnabled || aimAssistEnabled || aimDialEnabled;
  const planStateClass = anyAssistEnabled ? 'is-open' : 'is-off';
  const planDisabled = planStatus !== 'ready' && planStatus !== 'showing' && !hasReview;

  const clearActivation = () => {
    const activation = activationRef.current;
    if (activation) window.clearTimeout(activation.timer);
    activationRef.current = null;
  };

  useEffect(() => {
    const lockFromOutside = (event: PointerEvent) => {
      if (!editingRef.current || railRef.current?.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
      suppressOutsideClickRef.current = true;
      editingRef.current = false;
      setEditing(false);
    };
    const suppressOutsideClick = (event: MouseEvent) => {
      if (!suppressOutsideClickRef.current) return;
      suppressOutsideClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const lockWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAssistMenuOpen(false);
      if (editingRef.current && event.key === 'Escape') {
        editingRef.current = false;
        setEditing(false);
      }
    };
    const closeAssistMenuFromOutside = (event: PointerEvent) => {
      if (assistControlRef.current?.contains(event.target as Node)) return;
      setAssistMenuOpen(false);
    };
    document.addEventListener('pointerdown', lockFromOutside, true);
    document.addEventListener('pointerdown', closeAssistMenuFromOutside, true);
    document.addEventListener('click', suppressOutsideClick, true);
    window.addEventListener('keydown', lockWithEscape);
    return () => {
      clearActivation();
      document.removeEventListener('pointerdown', lockFromOutside, true);
      document.removeEventListener('pointerdown', closeAssistMenuFromOutside, true);
      document.removeEventListener('click', suppressOutsideClick, true);
      window.removeEventListener('keydown', lockWithEscape);
    };
  }, []);

  const handleRailPointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (editing) return;
    clearActivation();
    const pointerId = event.pointerId;
    const x = event.clientX;
    const y = event.clientY;
    const timer = window.setTimeout(() => {
      const activation = activationRef.current;
      if (!activation || activation.pointerId !== pointerId) return;
      activationRef.current = null;
      suppressRailClickRef.current = true;
      editingRef.current = true;
      setAssistMenuOpen(false);
      setEditing(true);
      onCancelCharge();
    }, LAYOUT_LONG_PRESS_MS);
    activationRef.current = { pointerId, x, y, timer };
  };

  const handleRailPointerMoveCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    const activation = activationRef.current;
    if (!activation || activation.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - activation.x, event.clientY - activation.y) > 8) {
      clearActivation();
    }
  };

  const handleRailPointerEndCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    const activation = activationRef.current;
    if (activation?.pointerId === event.pointerId) clearActivation();
  };

  const handleRailClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!editing && !suppressRailClickRef.current) return;
    suppressRailClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <footer className="control-deck">
      <div
        ref={railRef}
        className={`control-rail ${editing ? 'is-editing' : ''}`}
        data-layout-editing={editing}
        aria-label="右侧控制区，长按进入布局调整"
        onPointerDownCapture={handleRailPointerDownCapture}
        onPointerMoveCapture={handleRailPointerMoveCapture}
        onPointerUpCapture={handleRailPointerEndCapture}
        onPointerCancelCapture={handleRailPointerEndCapture}
        onClickCapture={handleRailClickCapture}
      >
        <DraggableControlSlot id="view" editing={editing} railRef={railRef}>
          <ViewToolbar
            viewLevel={viewLevel}
            onViewLevel={onViewLevel}
          />
        </DraggableControlSlot>
        <DraggableControlSlot id="guidance" editing={editing} railRef={railRef}>
          <div
            ref={assistControlRef}
            className={`assist-control ${assistMenuOpen ? 'menu-open' : ''}`}
          >
            <button
              type="button"
              className={`plan-button ${planStateClass}`}
              aria-label="打开辅助功能"
              aria-expanded={assistMenuOpen}
              onClick={() => setAssistMenuOpen(open => !open)}
            >
              <span aria-hidden="true">💡</span>
              <strong>辅助</strong>
            </button>
            {assistMenuOpen && (
              <div className="assist-menu" role="group" aria-label="辅助功能">
                <button
                  type="button"
                  className={`assist-option aim-option ${aimAssistEnabled ? 'active' : ''}`}
                  role="switch"
                  aria-label="瞄准辅助线"
                  aria-checked={aimAssistEnabled}
                  onClick={onToggleAimAssist}
                >
                  <span className="assist-aim-icon" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`assist-option guidance-option ${guidanceEnabled ? 'active' : ''}`}
                  role="switch"
                  aria-label="走位与击球复盘"
                  aria-checked={guidanceEnabled}
                  disabled={planDisabled}
                  onClick={onTogglePlan}
                >
                  <span className="assist-route-icon" aria-hidden="true"><i /><i /><i /></span>
                </button>
                <button
                  type="button"
                  className={`assist-option dial-option ${aimDialEnabled ? 'active' : ''}`}
                  role="switch"
                  aria-label="拨轮瞄准"
                  aria-checked={aimDialEnabled}
                  onClick={onToggleAimDial}
                >
                  <span className="assist-dial-icon" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </DraggableControlSlot>
        <DraggableControlSlot id="spin" editing={editing} railRef={railRef}>
          <SpinControl spin={spin} disabled={!canAim} onSpinChange={onSpinChange} />
        </DraggableControlSlot>
        <DraggableControlSlot id="shoot" editing={editing} railRef={railRef}>
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
        </DraggableControlSlot>
        <span className="control-layout-status" aria-live="polite">
          {editing ? '布局调整已开启，拖动控件并点击球桌保存' : ''}
        </span>
      </div>
    </footer>
  );
}

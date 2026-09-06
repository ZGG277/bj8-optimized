/*
[INPUT]: 五个游戏控件状态、模式门控、观战视角锁、默认拨轮/可选方向键、四项辅助入口、视口尺寸、Pointer 手势与逐控件学习记录
[OUTPUT]: 纯视觉五控件层；灯泡展开瞄准线、走位、复盘、瞄准器四项开关；全部内容手势统一交回控件消费真实变化回执，保留自由拖动、右/底吸附与 v3 持久化
[POS]: HUD 控件编排层；组合 ViewToolbar / AimControls·AimDial / SpinControl / ShootControl，不持有游戏规则
[PROTOCOL]: 控件集合、布局手势或存储协议变化时同步更新本注释、components/CLAUDE.md 与布局测试
*/
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { markControlLearned } from '../control-onboarding';
import { AimControls } from './AimControls';
import { AimDial } from './AimDial';
import { SpinControl } from './SpinControl';
import { ShootControl } from './ShootControl';
import { ViewToolbar } from './ViewToolbar';
import type { CueSpin } from '../physics';
import type { PositionPlanStatus } from '../hooks/usePositionPlan';
import {
  CONTROL_LAYOUT_LONG_PRESS_MS,
  CONTROL_LAYOUT_MOVE_THRESHOLD,
  CONTROL_LAYOUT_TOUCH_LONG_PRESS_MS,
  CONTROL_LAYOUT_TOUCH_MOVE_THRESHOLD,
  canDock,
  clampFreePlacement,
  controlAxisDelta,
  dockItemLength,
  loadControlLayouts,
  nearestDockPosition,
  placeDockedControl,
  resolveLayoutProfile,
  saveControlLayouts,
  snapEdgeAt,
  swapDockedControlPositions,
  type DockEdge,
  type DockItemId,
  type Placement,
  type ProfileLayout,
  type StoredControlLayouts,
} from '../layout/control-layout';

type Axis = 'horizontal' | 'vertical';

export const CONTENT_GESTURE_LAYOUT_CANCEL_PX = 3;

export function controlActivationIntent(
  id: DockItemId,
  distance: number,
  deadlineReached: boolean,
  layoutMoveThreshold: number,
): 'pending' | 'quick-gesture' | 'layout' {
  // 瞄准和蓄力一旦出现明确位移，本次手势就属于控件内容；
  // 即使此时刚好跨过长按时限，也不能再升级为布局拖位。
  if ((id === 'aimDial' || id === 'power') &&
    distance > CONTENT_GESTURE_LAYOUT_CANCEL_PX) {
    return 'quick-gesture';
  }
  if (deadlineReached) return 'layout';
  if (distance > layoutMoveThreshold) return 'quick-gesture';
  return 'pending';
}

type LayoutDrag = {
  id: DockItemId;
  pointerId: number;
  startX: number;
  startY: number;
  latestClientX: number;
  latestClientY: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  element: HTMLElement;
  origin: Placement;
  latest: Extract<Placement, { mode: 'free' }>;
  frame: number | null;
};

type DockableControlSlotProps = {
  id: DockItemId;
  placement: Placement;
  dragging: boolean;
  children: ReactNode;
  className?: string;
  onLayoutStart: (
    id: DockItemId,
    pointerId: number,
    startX: number,
    startY: number,
    currentX: number,
    currentY: number,
    rect: DOMRect,
    element: HTMLElement,
  ) => void;
};

function DockableControlSlot({
  id,
  placement,
  dragging,
  children,
  className = '',
  onLayoutStart,
}: DockableControlSlotProps) {
  const activationRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    timer: number;
    moveThreshold: number;
    deadline: number;
    originalTarget: Element | null;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const clearActivation = () => {
    if (activationRef.current) window.clearTimeout(activationRef.current.timer);
    activationRef.current = null;
  };

  useEffect(() => () => clearActivation(), []);

  const style: CSSProperties = placement.mode === 'free'
    ? {
        left: `${placement.x * 100}%`,
        top: `${placement.y * 100}%`,
      }
    : placement.edge === 'right'
      ? { top: `${placement.position * 100}%` }
      : { left: `${placement.position * 100}%` };

  return (
    <div
      data-control-slot={id}
      data-placement={placement.mode}
      data-dock-edge={placement.mode === 'docked' ? placement.edge : 'free'}
      className={[
        'control-slot',
        `control-slot-${id}`,
        placement.mode === 'free' ? 'is-free' : 'is-docked',
        dragging ? 'is-dragging' : '',
        className,
      ].filter(Boolean).join(' ')}
      style={style}
      onPointerDownCapture={(event) => {
        if (dragging) return;
        // 左右微调按钮的静止长按属于连续瞄准，不得被控件布局长按抢走。
        if (event.target instanceof Element &&
          event.target.closest('[data-control-content-hold="aim-button"]')) return;
        clearActivation();
        const target = event.currentTarget;
        const pointerId = event.pointerId;
        const x = event.clientX;
        const y = event.clientY;
        const touch = event.pointerType === 'touch';
        // 取消浏览器对长按的默认接管；内容操作仍全部由 Pointer 事件提交。
        if (touch && event.cancelable) event.preventDefault();
        const moveThreshold = touch
          ? CONTROL_LAYOUT_TOUCH_MOVE_THRESHOLD
          : CONTROL_LAYOUT_MOVE_THRESHOLD;
        const timer = window.setTimeout(() => {
          const activation = activationRef.current;
          if (!activation || activation.pointerId !== pointerId) return;
          activationRef.current = null;
          suppressClickRef.current = true;
          try {
            target.setPointerCapture(pointerId);
          } catch {
            // 部分旧版 WebView 不允许异步转移捕获，window 监听仍可接管。
          }
          onLayoutStart(
            id,
            pointerId,
            x,
            y,
            x,
            y,
            target.getBoundingClientRect(),
            target,
          );
        }, touch ? CONTROL_LAYOUT_TOUCH_LONG_PRESS_MS : CONTROL_LAYOUT_LONG_PRESS_MS);
        activationRef.current = {
          pointerId,
          x,
          y,
          timer,
          moveThreshold,
          deadline: window.performance.now() +
            (touch ? CONTROL_LAYOUT_TOUCH_LONG_PRESS_MS : CONTROL_LAYOUT_LONG_PRESS_MS),
          originalTarget: event.target instanceof Element ? event.target : null,
        };
      }}
      onPointerMoveCapture={(event) => {
        const activation = activationRef.current;
        if (!activation || activation.pointerId !== event.pointerId) return;
        const distance = Math.hypot(
          event.clientX - activation.x,
          event.clientY - activation.y,
        );
        const intent = controlActivationIntent(
          id,
          distance,
          window.performance.now() >= activation.deadline,
          activation.moveThreshold,
        );
        if (intent === 'layout') {
          window.clearTimeout(activation.timer);
          activationRef.current = null;
          suppressClickRef.current = true;
          const target = event.currentTarget;
          try {
            target.setPointerCapture(event.pointerId);
          } catch {
            // 旧版 WebView 由 window Pointer 监听继续接管。
          }
          onLayoutStart(
            id,
            event.pointerId,
            activation.x,
            activation.y,
            event.clientX,
            event.clientY,
            target.getBoundingClientRect(),
            target,
          );
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (intent === 'quick-gesture') {
          clearActivation();
          event.stopPropagation();
          // 首次内容移动也交回原控件，让拨轮统一消费真实变化回执；
          // 不在布局层旁路调整角度，否则单次移动的成功事实会丢失。
          activation.originalTarget?.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            cancelable: true,
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            isPrimary: event.isPrimary,
            buttons: event.buttons || 1,
            button: event.button,
            clientX: event.clientX,
            clientY: event.clientY,
            pressure: event.pressure,
            width: event.width,
            height: event.height,
          }));
          return;
        }
        event.stopPropagation();
      }}
      onPointerUpCapture={(event) => {
        clearActivation();
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerCancelCapture={clearActivation}
      onContextMenu={(event) => event.preventDefault()}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="control-slot-body">{children}</div>
    </div>
  );
}

interface ControlDeckProps {
  viewLevel: number;
  manualCameraActive: boolean;
  viewLocked: boolean;
  canAim: boolean;
  spin: CueSpin;
  charging: boolean;
  previewPower: number;
  breaking: boolean;
  planStatus: PositionPlanStatus;
  guidanceEnabled: boolean;
  reviewEnabled: boolean;
  hasReview: boolean;
  aimAssistEnabled: boolean;
  aimDialEnabled: boolean;
  aimDialVisible: boolean;
  aimDialPrecisionActive: boolean;
  onViewLevel: (level: number) => void;
  onToggleManualCamera: () => void;
  onSpinChange: (spin: CueSpin) => void;
  onLayoutAdjusted: () => void;
  onToggleGuidance: () => void;
  onToggleReview: () => void;
  onToggleAimAssist: () => void;
  onToggleAimDial: () => void;
  onAimButtonAdjust: (angleDelta: number) => boolean;
  onAimDialAdjust: (pixelDelta: number, pressureGain?: number) => boolean;
  onToggleAimDialPrecision: () => boolean;
  onBeginCharge: (coordinate: number, availableTravel: number) => void;
  onUpdateCharge: (coordinate: number) => void;
  onReleaseCharge: () => void;
  onCancelCharge: () => void;
  onTapShot: () => void;
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readViewport() {
  if (typeof window === 'undefined') return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function axisFor(id: DockItemId, placement: Placement): Axis {
  if (placement.mode === 'docked') {
    return placement.edge === 'right' ? 'vertical' : 'horizontal';
  }
  return id === 'aimDial' ? 'horizontal' : 'vertical';
}

export function ControlDeck({
  viewLevel,
  manualCameraActive,
  viewLocked,
  canAim,
  spin,
  charging,
  previewPower,
  breaking,
  planStatus,
  guidanceEnabled,
  reviewEnabled,
  hasReview,
  aimAssistEnabled,
  aimDialEnabled,
  aimDialVisible,
  aimDialPrecisionActive,
  onViewLevel,
  onToggleManualCamera,
  onSpinChange,
  onLayoutAdjusted,
  onToggleGuidance,
  onToggleReview,
  onToggleAimAssist,
  onToggleAimDial,
  onAimButtonAdjust,
  onAimDialAdjust,
  onToggleAimDialPrecision,
  onBeginCharge,
  onUpdateCharge,
  onReleaseCharge,
  onCancelCharge,
  onTapShot,
}: ControlDeckProps) {
  const [viewport, setViewport] = useState(readViewport);
  const [storedLayouts, setStoredLayouts] = useState<StoredControlLayouts>(() =>
    loadControlLayouts(browserStorage()));
  const [draggingId, setDraggingId] = useState<DockItemId | null>(null);
  const [snapPreview, setSnapPreview] = useState<DockEdge | null>(null);
  const [assistMenuOpen, setAssistMenuOpen] = useState(false);
  const dragRef = useRef<LayoutDrag | null>(null);

  const profile = resolveLayoutProfile(viewport.width, viewport.height);
  const layout = storedLayouts.layouts[profile];
  const layoutRef = useRef<ProfileLayout>(layout);
  const profileRef = useRef(profile);
  const viewportRef = useRef(viewport);
  layoutRef.current = layout;
  profileRef.current = profile;
  viewportRef.current = viewport;

  useEffect(() => {
    saveControlLayouts(storedLayouts, browserStorage());
  }, [storedLayouts]);

  useEffect(() => {
    const onResize = () => {
      setViewport(readViewport());
      dragRef.current = null;
      setDraggingId(null);
      setSnapPreview(null);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setStoredLayouts(current => {
      const currentLayout = current.layouts[profile];
      let changed = false;
      const nextLayout = { ...currentLayout };
      (Object.keys(currentLayout) as DockItemId[]).forEach(id => {
        const placement = currentLayout[id];
        if (placement.mode !== 'free') return;
        const element = document.querySelector<HTMLElement>(
          `[data-control-slot="${id}"]`,
        );
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const clamped = clampFreePlacement(
          placement.x * viewport.width,
          placement.y * viewport.height,
          rect.width,
          rect.height,
          viewport.width,
          viewport.height,
        );
        if (Math.abs(clamped.x - placement.x) > 0.0001 ||
          Math.abs(clamped.y - placement.y) > 0.0001) {
          nextLayout[id] = clamped;
          changed = true;
        }
      });
      if (!changed) return current;
      layoutRef.current = nextLayout;
      return {
        ...current,
        layouts: { ...current.layouts, [profile]: nextLayout },
      };
    });
  }, [profile, viewport.height, viewport.width]);

  const updatePlacement = useCallback((
    targetProfile: typeof profile,
    id: DockItemId,
    placement: Placement,
  ) => {
    setStoredLayouts(current => {
      const nextLayout = { ...current.layouts[targetProfile], [id]: placement };
      layoutRef.current = nextLayout;
      return {
        ...current,
        layouts: { ...current.layouts, [targetProfile]: nextLayout },
      };
    });
  }, []);

  const dockAtPosition = useCallback((
    targetProfile: typeof profile,
    id: DockItemId,
    edge: DockEdge,
    position: number,
  ) => {
    setStoredLayouts(current => {
      const nextLayout = placeDockedControl(
        current.layouts[targetProfile],
        id,
        edge,
        position,
      );
      layoutRef.current = nextLayout;
      return {
        ...current,
        layouts: { ...current.layouts, [targetProfile]: nextLayout },
      };
    });
  }, []);

  const startLayoutDrag = useCallback((
    id: DockItemId,
    pointerId: number,
    startX: number,
    startY: number,
    currentX: number,
    currentY: number,
    rect: DOMRect,
    element: HTMLElement,
  ) => {
    onCancelCharge();
    setAssistMenuOpen(false);
    const currentViewport = viewportRef.current;
    const originFree = clampFreePlacement(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      rect.width,
      rect.height,
      currentViewport.width,
      currentViewport.height,
    );
    const latest = clampFreePlacement(
      originFree.x * currentViewport.width + currentX - startX,
      originFree.y * currentViewport.height + currentY - startY,
      rect.width,
      rect.height,
      currentViewport.width,
      currentViewport.height,
    );
    dragRef.current = {
      id,
      pointerId,
      startX,
      startY,
      latestClientX: currentX,
      latestClientY: currentY,
      centerX: originFree.x * currentViewport.width,
      centerY: originFree.y * currentViewport.height,
      width: rect.width,
      height: rect.height,
      element,
      origin: layoutRef.current[id],
      latest,
      frame: null,
    };
    element.style.setProperty(
      '--layout-drag-x',
      `${latest.x * currentViewport.width -
        originFree.x * currentViewport.width}px`,
    );
    element.style.setProperty(
      '--layout-drag-y',
      `${latest.y * currentViewport.height -
        originFree.y * currentViewport.height}px`,
    );
    setDraggingId(id);
  }, [onCancelCharge]);

  useEffect(() => {
    const paintDrag = (drag: LayoutDrag) => {
      drag.frame = null;
      const currentViewport = viewportRef.current;
      const element = drag.element;
      if (!element) return;
      const x = drag.latest.x * currentViewport.width - drag.centerX;
      const y = drag.latest.y * currentViewport.height - drag.centerY;
      element.style.setProperty('--layout-drag-x', `${x}px`);
      element.style.setProperty('--layout-drag-y', `${y}px`);
    };

    const scheduleDragPaint = (drag: LayoutDrag) => {
      if (drag.frame !== null) return;
      drag.frame = window.requestAnimationFrame(() => paintDrag(drag));
    };

    const settleFreePosition = (drag: LayoutDrag) => {
      if (drag.frame !== null) {
        window.cancelAnimationFrame(drag.frame);
        drag.frame = null;
      }
      const element = drag.element;
      if (element) {
        element.style.removeProperty('--layout-drag-x');
        element.style.removeProperty('--layout-drag-y');
        try {
          if (element.hasPointerCapture(drag.pointerId)) {
            element.releasePointerCapture(drag.pointerId);
          }
        } catch {
          // Pointer 已由浏览器取消时无需重复释放。
        }
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const currentViewport = viewportRef.current;
      drag.latestClientX = event.clientX;
      drag.latestClientY = event.clientY;
      const free = clampFreePlacement(
        drag.centerX + event.clientX - drag.startX,
        drag.centerY + event.clientY - drag.startY,
        drag.width,
        drag.height,
        currentViewport.width,
        currentViewport.height,
      );
      drag.latest = free;
      scheduleDragPaint(drag);
      const candidate = snapEdgeAt(
        event.clientX,
        event.clientY,
        currentViewport.width,
        currentViewport.height,
      );
      setSnapPreview(
        candidate && canDock(
          layoutRef.current,
          drag.id,
          candidate,
          currentViewport.width,
          currentViewport.height,
        )
          ? candidate
          : null,
      );
    };

    const finish = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const currentViewport = viewportRef.current;
      settleFreePosition(drag);
      const edge = snapEdgeAt(
        drag.latestClientX,
        drag.latestClientY,
        currentViewport.width,
        currentViewport.height,
      );
      let docked = false;
      if (edge && canDock(
        layoutRef.current,
        drag.id,
        edge,
        currentViewport.width,
        currentViewport.height,
      )) {
        const rail = document.querySelector<HTMLElement>(`.dock-rail-${edge}`);
        const railRect = rail?.getBoundingClientRect();
        const siblings = rail
          ? Array.from(rail.querySelectorAll<HTMLElement>('[data-control-slot]'))
            .filter(element => element.dataset.controlSlot !== drag.id)
          : [];
        const occupied = railRect
          ? siblings.map(element => {
          const rect = element.getBoundingClientRect();
              return edge === 'right'
                ? { start: rect.top - railRect.top, end: rect.bottom - railRect.top }
                : { start: rect.left - railRect.left, end: rect.right - railRect.left };
            })
          : [];
        const span = railRect
          ? edge === 'right' ? railRect.height : railRect.width
          : 0;
        const requested = railRect
          ? edge === 'right'
            ? drag.latestClientY - railRect.top
            : drag.latestClientX - railRect.left
          : 0;
        const swapTarget = drag.origin.mode === 'docked' &&
          drag.origin.edge === edge
          ? siblings.find(element => {
              const rect = element.getBoundingClientRect();
              return edge === 'right'
                ? drag.latestClientY >= rect.top && drag.latestClientY <= rect.bottom
                : drag.latestClientX >= rect.left && drag.latestClientX <= rect.right;
            })
          : null;
        const swapTargetId = swapTarget?.dataset.controlSlot as DockItemId | undefined;
        if (swapTargetId) {
          setStoredLayouts(current => {
            const nextLayout = swapDockedControlPositions(
              current.layouts[profileRef.current],
              drag.id,
              swapTargetId,
            );
            layoutRef.current = nextLayout;
            return {
              ...current,
              layouts: {
                ...current.layouts,
                [profileRef.current]: nextLayout,
              },
            };
          });
          docked = true;
        }
        const position = nearestDockPosition(
          requested,
          dockItemLength(
            edge,
            drag.id,
            currentViewport.width,
            currentViewport.height,
          ),
          occupied,
          span,
        );
        if (!docked && position !== null) {
          dockAtPosition(profileRef.current, drag.id, edge, position);
          docked = true;
        }
      }
      if (!docked) {
        updatePlacement(profileRef.current, drag.id, drag.latest);
      }
      const layoutAdjusted = Math.hypot(
        drag.latestClientX - drag.startX,
        drag.latestClientY - drag.startY,
      ) > 2;
      dragRef.current = null;
      setDraggingId(null);
      setSnapPreview(null);
      if (layoutAdjusted) onLayoutAdjusted();
    };

    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
    return () => {
      const drag = dragRef.current;
      if (drag && drag.frame !== null) window.cancelAnimationFrame(drag.frame);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
    };
  }, [dockAtPosition, onLayoutAdjusted, updatePlacement]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setAssistMenuOpen(false);
      const drag = dragRef.current;
      if (drag) {
        if (drag.frame !== null) window.cancelAnimationFrame(drag.frame);
        const element = drag.element;
        if (element) {
          element.style.removeProperty('--layout-drag-x');
          element.style.removeProperty('--layout-drag-y');
        }
        updatePlacement(profileRef.current, drag.id, drag.latest);
      }
      dragRef.current = null;
      setDraggingId(null);
      setSnapPreview(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [updatePlacement]);

  // 按需规划从 idle 开始：玩家瞄准时必须允许先点亮，Worker 才会进入 computing。
  // 已点亮时保持可用，用户可在计算中途再次点击熄灭并取消。
  const guidanceAvailable =
    canAim || guidanceEnabled || planStatus === 'ready' || planStatus === 'showing';
  const guidanceStateClass = guidanceEnabled ? 'is-open' : 'is-off';

  const nodes = useMemo<Record<DockItemId, ReactNode>>(() => ({
    view: (
      <ViewToolbar
        viewLevel={viewLevel}
        manualCameraActive={manualCameraActive}
        disabled={viewLocked}
        orientation={axisFor('view', layout.view)}
        onViewLevel={onViewLevel}
        onToggleManualCamera={onToggleManualCamera}
      />
    ),
    bulb: (
      <div className={`assist-control ${assistMenuOpen ? 'menu-open' : ''}`}>
        <button
          type="button"
          className={`plan-button ${guidanceStateClass} ${aimAssistEnabled || aimDialEnabled || reviewEnabled ? 'has-aim-assist' : ''}`}
          aria-label="打开辅助功能"
          data-control-tip="assist-menu"
          aria-expanded={assistMenuOpen}
          onClick={() => {
            setAssistMenuOpen(open => !open);
            markControlLearned('assist-menu');
          }}
        >
          <span className="bulb-icon" aria-hidden="true"><i /></span>
        </button>
        {assistMenuOpen && (
          <div
            className={`assist-menu assist-menu-${axisFor('bulb', layout.bulb)}`}
            role="group"
            aria-label="辅助功能"
          >
            <button
              type="button"
              className={`assist-option aim-option ${aimAssistEnabled ? 'active' : ''}`}
              role="switch"
              aria-label="瞄准辅助线"
              data-control-tip="assist-aim"
              aria-checked={aimAssistEnabled}
              onClick={() => {
                onToggleAimAssist();
                markControlLearned('assist-aim');
              }}
            >
              <span className="trajectory-icon" aria-hidden="true"><i /></span>
            </button>
            <button
              type="button"
              className={`assist-option guidance-option ${guidanceEnabled ? 'active' : ''}`}
              role="switch"
              aria-label="走位规划"
              data-control-tip="assist-plan"
              aria-checked={guidanceEnabled}
              disabled={!guidanceAvailable}
              onClick={() => {
                if (!guidanceAvailable) return;
                onToggleGuidance();
                markControlLearned('assist-plan');
              }}
            >
              <span className="route-icon" aria-hidden="true"><i /><i /><i /></span>
            </button>
            <button
              type="button"
              className={`assist-option review-option ${reviewEnabled ? 'active' : ''} ${hasReview ? 'has-review' : ''}`}
              role="switch"
              aria-label="显示击球复盘"
              data-control-tip="assist-review"
              aria-checked={reviewEnabled}
              onClick={() => {
                onToggleReview();
                markControlLearned('assist-review');
              }}
            >
              <span className="review-icon" aria-hidden="true"><i /></span>
            </button>
            <button
              type="button"
              className={`assist-option dial-option ${aimDialEnabled ? 'active' : ''}`}
              role="switch"
              aria-label={aimDialEnabled ? '切换为方向键瞄准' : '切换为拨轮瞄准'}
              data-control-tip="assist-input"
              aria-checked={aimDialEnabled}
              onClick={() => {
                onToggleAimDial();
                markControlLearned('assist-input');
                setAssistMenuOpen(false);
              }}
            >
              {aimDialEnabled ? (
                <span className="direction-keys-icon" aria-hidden="true"><i /><i /></span>
              ) : (
                <span className="dial-icon" aria-hidden="true"><i /></span>
              )}
            </button>
          </div>
        )}
      </div>
    ),
    spin: (
      <SpinControl spin={spin} disabled={!canAim} onSpinChange={onSpinChange} />
    ),
    power: (
      <ShootControl
        disabled={!canAim}
        charging={charging}
        power={previewPower}
        breaking={breaking}
        orientation={axisFor('power', layout.power)}
        onBegin={onBeginCharge}
        onUpdate={onUpdateCharge}
        onRelease={onReleaseCharge}
        onCancel={onCancelCharge}
        onTap={onTapShot}
      />
    ),
    aimDial: canAim ? (
      aimDialEnabled && aimDialVisible ? (
        <AimDial
          visible
          precisionActive={aimDialPrecisionActive}
          orientation={axisFor('aimDial', layout.aimDial)}
          onAdjust={onAimDialAdjust}
          onTogglePrecision={onToggleAimDialPrecision}
        />
      ) : (
        <AimControls disabled={false} onAdjust={onAimButtonAdjust} />
      )
    ) : null,
  }), [
    aimAssistEnabled,
    aimDialEnabled,
    aimDialPrecisionActive,
    aimDialVisible,
    assistMenuOpen,
    breaking,
    canAim,
    charging,
    guidanceAvailable,
    guidanceEnabled,
    guidanceStateClass,
    hasReview,
    layout,
    manualCameraActive,
    viewLocked,
    onAimDialAdjust,
    onAimButtonAdjust,
    onToggleAimDial,
    onToggleAimDialPrecision,
    onBeginCharge,
    onCancelCharge,
    onReleaseCharge,
    onSpinChange,
    onTapShot,
    onToggleAimAssist,
    onToggleGuidance,
    onToggleReview,
    onToggleManualCamera,
    onUpdateCharge,
    onViewLevel,
    planStatus,
    previewPower,
    reviewEnabled,
    spin,
    viewLevel,
  ]);

  const visibleIds = (Object.keys(nodes) as DockItemId[])
    .filter(id => nodes[id] !== null);
  const docked = (edge: DockEdge) => visibleIds
    .filter(id => layout[id].mode === 'docked' && layout[id].edge === edge)
    .sort((a, b) => {
      const pa = layout[a];
      const pb = layout[b];
      return pa.mode === 'docked' && pb.mode === 'docked'
        ? pa.position - pb.position
        : 0;
    });
  const free = visibleIds.filter(id => layout[id].mode === 'free');

  const renderSlot = (id: DockItemId) => (
    <DockableControlSlot
      key={id}
      id={id}
      placement={layout[id]}
      dragging={draggingId === id}
      className={id === 'aimDial' && !aimDialEnabled ? 'is-aim-buttons' : ''}
      onLayoutStart={startLayoutDrag}
    >
      {nodes[id]}
    </DockableControlSlot>
  );

  return (
    <footer
      className={`control-deck ${draggingId ? 'is-layout-dragging' : ''}`}
      data-layout-profile={profile}
      onContextMenuCapture={(event) => event.preventDefault()}
    >
      <div className={`dock-snap-preview dock-snap-right ${snapPreview === 'right' ? 'active' : ''}`} />
      <div className={`dock-snap-preview dock-snap-bottom ${snapPreview === 'bottom' ? 'active' : ''}`} />
      <div className="dock-rail dock-rail-right" aria-label="右侧控制停靠区">
        {docked('right').map(renderSlot)}
      </div>
      <div className="dock-rail dock-rail-bottom" aria-label="底部控制停靠区">
        {docked('bottom').map(renderSlot)}
      </div>
      <div className="control-free-layer">
        {free.map(renderSlot)}
      </div>
      <span className="control-layout-status" aria-live="polite">
        {draggingId ? '正在调整控件位置' : ''}
      </span>
    </footer>
  );
}

export { controlAxisDelta };

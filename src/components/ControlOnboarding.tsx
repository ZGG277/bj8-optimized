/*
[INPUT]: control-onboarding 的稳定提示表/逐控件状态，DOM data-control-tip 锚点与鼠标、键盘、触屏 Pointer 事件
[OUTPUT]: 全局唯一、穿透交互的就地控件说明；触摸立即显示并在松手后短暂停留，鼠标/键盘继续遵循学习状态
[POS]: HUD 非模态提示层；只观察锚点，不拦截点击、不推断动作成功，也不持有游戏状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  CONTROL_LEARNING_STORAGE_KEY,
  CONTROL_TIPS,
  controlLearning,
  isControlTipId,
  shouldShowControlTip,
  type ControlTipId,
} from '../control-onboarding';

type TipSource = 'hover' | 'keyboard' | 'touch';
type TipTarget = { element: HTMLElement; id: ControlTipId; source: TipSource };
type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/** 动态控件（手动视角、横竖出杆）可覆写稳定默认文案。 */
export function controlTipCopy(id: ControlTipId, override: string | undefined): string {
  return override || CONTROL_TIPS[id];
}

/** 始终优先左侧；左侧贴屏的入口只在上方钳制，避免提示盖住点击目标。 */
export function controlTipPosition(anchor: Rect, tip: Pick<Rect, 'width' | 'height'>, width: number, height: number) {
  const margin = 8;
  const gap = 10;
  const clamp = (value: number, maximum: number) => Math.max(margin, Math.min(value, maximum));
  const fitsLeft = anchor.left - tip.width - gap >= margin;
  return {
    left: clamp(anchor.left - tip.width - gap, width - tip.width - margin),
    top: clamp(fitsLeft
      ? anchor.top + (anchor.height - tip.height) / 2
      : anchor.top - tip.height - gap, height - tip.height - margin),
    side: fitsLeft ? 'left' : 'above',
  };
}

function findTarget(target: EventTarget | null, source: TipSource): TipTarget | null {
  if (!(target instanceof Element)) return null;
  // 介绍页有用户独立改动，只消费既有稳定选择器，不改写它的源文件或 DOM。
  const element = target.closest<HTMLElement>('[data-control-tip], .mode-choice .mode-start');
  const id = element?.dataset.controlTip ?? (element?.closest('.mode-choice.practice') ? 'start-practice'
    : element?.closest('.mode-choice.challenge') ? 'start-challenge' : undefined);
  if (!element || !isControlTipId(id)) return null;
  return { element, id, source };
}

export function ControlOnboarding() {
  const revision = useSyncExternalStore(controlLearning.subscribe, controlLearning.getRevision, () => 0);
  const [target, setTarget] = useState<TipTarget | null>(null);
  const [tipCopy, setTipCopy] = useState<string | null>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<ReturnType<typeof controlTipPosition> | null>(null);
  // 触屏没有悬停态，因此每次直接触摸都显示所触控件；鼠标和键盘仍保持首用引导规则。
  const active = target && (target.source === 'touch' ||
    shouldShowControlTip(target.id, controlLearning.has(target.id))) ? target : null;

  useEffect(() => {
    let keyboard = false;
    let touchHideTimer: number | null = null;
    const clearTouchHideTimer = () => {
      if (touchHideTimer === null) return;
      window.clearTimeout(touchHideTimer);
      touchHideTimer = null;
    };
    const show = (candidate: TipTarget | null) => setTarget(current =>
      current?.element === candidate?.element && current?.source === candidate?.source ? current : candidate);
    const pointerOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.buttons !== 0) return;
      show(findTarget(event.target, 'hover'));
    };
    const pointerOut = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') show(findTarget(event.relatedTarget, 'hover'));
    };
    const pointerDown = (event: PointerEvent) => {
      keyboard = false;
      clearTouchHideTimer();
      show(event.pointerType === 'touch' ? findTarget(event.target, 'touch') : null);
    };
    const pointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') {
        show(findTarget(document.elementFromPoint(event.clientX, event.clientY), 'hover'));
        return;
      }
      if (event.pointerType === 'touch') {
        touchHideTimer = window.setTimeout(() => {
          touchHideTimer = null;
          show(null);
        }, 1000);
      }
    };
    const pointerCancel = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      clearTouchHideTimer();
      show(null);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { show(null); return; }
      keyboard = true;
      show(findTarget(document.activeElement, 'keyboard'));
    };
    const focusIn = (event: FocusEvent) => { if (keyboard) show(findTarget(event.target, 'keyboard')); };
    const focusOut = () => show(null);
    const storage = (event: StorageEvent) => {
      if (event.key === CONTROL_LEARNING_STORAGE_KEY) controlLearning.refresh();
    };
    document.addEventListener('pointerover', pointerOver, true);
    document.addEventListener('pointerout', pointerOut, true);
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('pointerup', pointerUp, true);
    document.addEventListener('pointercancel', pointerCancel, true);
    document.addEventListener('keydown', keyDown, true);
    document.addEventListener('focusin', focusIn, true);
    document.addEventListener('focusout', focusOut, true);
    window.addEventListener('storage', storage);
    return () => {
      document.removeEventListener('pointerover', pointerOver, true);
      document.removeEventListener('pointerout', pointerOut, true);
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('pointerup', pointerUp, true);
      document.removeEventListener('pointercancel', pointerCancel, true);
      document.removeEventListener('keydown', keyDown, true);
      document.removeEventListener('focusin', focusIn, true);
      document.removeEventListener('focusout', focusOut, true);
      window.removeEventListener('storage', storage);
      clearTouchHideTimer();
    };
  }, []);

  useLayoutEffect(() => {
    setPosition(null);
    if (!active) {
      setTipCopy(null);
      return;
    }
    const anchor = active.element;
    const updateCopy = () => {
      const next = controlTipCopy(active.id, anchor.dataset.controlTipCopy);
      setTipCopy(current => current === next ? current : next);
    };
    const descriptionId = `control-tip-${active.id}`;
    const previousDescription = anchor.getAttribute('aria-describedby');
    anchor.setAttribute('aria-describedby', [previousDescription, descriptionId].filter(Boolean).join(' '));
    const update = () => {
      const hint = hintRef.current;
      if (!anchor.isConnected || !hint || anchor.closest('.is-layout-dragging')) {
        setTarget(null);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      if (!rect.width || !rect.height) { setTarget(null); return; }
      const next = controlTipPosition(rect, hint.getBoundingClientRect(), window.innerWidth, window.innerHeight);
      setPosition(current => current?.left === next.left && current?.top === next.top && current?.side === next.side ? current : next);
      updateCopy();
    };
    update();
    const resize = new ResizeObserver(update);
    resize.observe(anchor);
    if (hintRef.current) resize.observe(hintRef.current);
    // 只在提示显示时观察，控件移动/菜单卸载后立即跟随或退出；不创建常驻帧循环。
    const mutation = new MutationObserver(update);
    mutation.observe(document.getElementById('root') ?? document.body, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ['style', 'class', 'disabled', 'aria-disabled', 'data-control-tip-copy'],
    });
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      if (previousDescription === null) anchor.removeAttribute('aria-describedby');
      else anchor.setAttribute('aria-describedby', previousDescription);
    };
  }, [active?.element, active?.id, revision]);

  if (!active) return null;
  return createPortal(
    <div
      ref={hintRef}
      id={`control-tip-${active.id}`}
      className="control-onboarding-tip"
      data-tip-for={active.id}
      data-tip-side={position?.side ?? 'left'}
      role="tooltip"
      style={{ left: position?.left ?? -1000, top: position?.top ?? -1000, visibility: position ? 'visible' : 'hidden' }}
    >{tipCopy ?? controlTipCopy(active.id, active.element.dataset.controlTipCopy)}</div>,
    document.body,
  );
}

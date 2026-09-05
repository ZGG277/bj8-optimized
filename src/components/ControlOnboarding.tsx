/*
[INPUT]: control-onboarding 的稳定提示表/逐控件状态，DOM data-control-tip 锚点与真实鼠标/键盘焦点
[OUTPUT]: 全局唯一、穿透交互的左侧控件说明；一般首用提示成功学习即隐藏，三项速查始终可见，触屏不触发悬停
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

type TipTarget = { element: HTMLElement; id: ControlTipId };
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

function findTarget(target: EventTarget | null): TipTarget | null {
  if (!(target instanceof Element)) return null;
  // 介绍页有用户独立改动，只消费既有稳定选择器，不改写它的源文件或 DOM。
  const element = target.closest<HTMLElement>('[data-control-tip], .mode-choice .mode-start');
  const id = element?.dataset.controlTip ?? (element?.closest('.mode-choice.practice') ? 'start-practice'
    : element?.closest('.mode-choice.challenge') ? 'start-challenge' : undefined);
  if (!element || !isControlTipId(id)) return null;
  return { element, id };
}

export function ControlOnboarding() {
  const revision = useSyncExternalStore(controlLearning.subscribe, controlLearning.getRevision, () => 0);
  const [target, setTarget] = useState<TipTarget | null>(null);
  const [tipCopy, setTipCopy] = useState<string | null>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<ReturnType<typeof controlTipPosition> | null>(null);
  // 视角端点、手动视角与出杆在学会后仍可作为常驻速查；其他控件保持首用即收起。
  const active = target && shouldShowControlTip(target.id, controlLearning.has(target.id)) ? target : null;

  useEffect(() => {
    let keyboard = false;
    const show = (candidate: TipTarget | null) => setTarget(current =>
      current?.element === candidate?.element ? current : candidate);
    const pointerOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.buttons !== 0) return;
      show(findTarget(event.target));
    };
    const pointerOut = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') show(findTarget(event.relatedTarget));
    };
    const pointerDown = () => { keyboard = false; show(null); };
    const pointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') show(findTarget(document.elementFromPoint(event.clientX, event.clientY)));
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { show(null); return; }
      keyboard = true;
      show(findTarget(document.activeElement));
    };
    const focusIn = (event: FocusEvent) => { if (keyboard) show(findTarget(event.target)); };
    const focusOut = () => show(null);
    const storage = (event: StorageEvent) => {
      if (event.key === CONTROL_LEARNING_STORAGE_KEY) controlLearning.refresh();
    };
    document.addEventListener('pointerover', pointerOver, true);
    document.addEventListener('pointerout', pointerOut, true);
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('pointerup', pointerUp, true);
    document.addEventListener('keydown', keyDown, true);
    document.addEventListener('focusin', focusIn, true);
    document.addEventListener('focusout', focusOut, true);
    window.addEventListener('storage', storage);
    return () => {
      document.removeEventListener('pointerover', pointerOver, true);
      document.removeEventListener('pointerout', pointerOut, true);
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('pointerup', pointerUp, true);
      document.removeEventListener('keydown', keyDown, true);
      document.removeEventListener('focusin', focusIn, true);
      document.removeEventListener('focusout', focusOut, true);
      window.removeEventListener('storage', storage);
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

/*
[INPUT]: 当前首局微提示、对局是否允许展示与跳过回调
[OUTPUT]: 对外提供跟随球桌或可移动控件的一行非阻塞提示，含弱化跳过入口与无障碍名称
[POS]: HUD 展示层；只观察稳定 DOM 锚点，不持有引导状态或改写对局
[PROTOCOL]: 提示文案、锚点或布局变化时更新本注释、components/CLAUDE.md 与样式文档
*/
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { FirstMatchGuideStep } from '../first-match-guide';

type GuideCopy = {
  text: string;
  selector: string;
  fallbackSelector?: string;
};

export const FIRST_MATCH_GUIDE_COPY: Record<FirstMatchGuideStep, GuideCopy> = {
  'break-place': {
    text: '放好白球',
    selector: '.viewport',
  },
  'break-coarse': {
    text: '拖动粗瞄',
    selector: '.viewport',
  },
  'break-fine': {
    text: '拨轮精瞄',
    selector: '[data-control-slot="aimDial"]',
    fallbackSelector: '.viewport',
  },
  'break-power': {
    text: '下拉蓄力·松手击球',
    selector: '[data-control-slot="power"]',
  },
  'player-view': {
    text: '拖动切视角',
    selector: '[data-control-slot="view"]',
  },
  'player-spin': {
    text: '点母球调杆法',
    selector: '[data-control-slot="spin"]',
  },
  'player-layout': {
    text: '长按控件可移动',
    selector: '[data-control-slot="view"]',
  },
};

type AnchorSide = 'left' | 'right' | 'above' | 'below' | 'table';

type AnchorPosition = {
  left: number;
  top: number;
  side: AnchorSide;
};

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function positionForAnchor(
  anchor: DOMRect,
  hint: DOMRect,
  tableAnchor: boolean,
): AnchorPosition {
  const maxLeft = window.innerWidth - hint.width - VIEWPORT_MARGIN;
  const maxTop = window.innerHeight - hint.height - VIEWPORT_MARGIN;

  if (tableAnchor) {
    return {
      left: clamp(anchor.left + 12, VIEWPORT_MARGIN, maxLeft),
      top: clamp(anchor.bottom - hint.height - 12, VIEWPORT_MARGIN, maxTop),
      side: 'table',
    };
  }

  const horizontalControl = anchor.width > anchor.height * 1.35;
  if (horizontalControl) {
    const aboveTop = anchor.top - hint.height - ANCHOR_GAP;
    const useAbove = aboveTop >= VIEWPORT_MARGIN;
    return {
      left: clamp(
        anchor.left + anchor.width / 2 - hint.width / 2,
        VIEWPORT_MARGIN,
        maxLeft,
      ),
      top: clamp(
        useAbove ? aboveTop : anchor.bottom + ANCHOR_GAP,
        VIEWPORT_MARGIN,
        maxTop,
      ),
      side: useAbove ? 'above' : 'below',
    };
  }

  const leftCandidate = anchor.left - hint.width - ANCHOR_GAP;
  const rightCandidate = anchor.right + ANCHOR_GAP;
  const canUseLeft = leftCandidate >= VIEWPORT_MARGIN;
  const canUseRight = rightCandidate + hint.width <= window.innerWidth - VIEWPORT_MARGIN;
  if (canUseLeft || canUseRight) {
    const useLeft = canUseLeft && (!canUseRight || anchor.left > window.innerWidth / 2);
    return {
      left: clamp(
        useLeft ? leftCandidate : rightCandidate,
        VIEWPORT_MARGIN,
        maxLeft,
      ),
      top: clamp(
        anchor.top + anchor.height / 2 - hint.height / 2,
        VIEWPORT_MARGIN,
        maxTop,
      ),
      side: useLeft ? 'left' : 'right',
    };
  }

  const aboveTop = anchor.top - hint.height - ANCHOR_GAP;
  const useAbove = aboveTop >= VIEWPORT_MARGIN;
  return {
    left: clamp(
      anchor.left + anchor.width / 2 - hint.width / 2,
      VIEWPORT_MARGIN,
      maxLeft,
    ),
    top: clamp(
      useAbove ? aboveTop : anchor.bottom + ANCHOR_GAP,
      VIEWPORT_MARGIN,
      maxTop,
    ),
    side: useAbove ? 'above' : 'below',
  };
}

interface FirstMatchGuideProps {
  step: FirstMatchGuideStep;
  visible: boolean;
  onSkip: () => void;
}

export function FirstMatchGuide({
  step,
  visible,
  onSkip,
}: FirstMatchGuideProps) {
  const copy = FIRST_MATCH_GUIDE_COPY[step];
  const hintRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<AnchorPosition | null>(null);
  const selectors = useMemo(
    () => [copy.selector, copy.fallbackSelector].filter(Boolean) as string[],
    [copy.fallbackSelector, copy.selector],
  );

  useEffect(() => {
    if (!visible) return;
    setPosition(null);
    let timer = 0;
    let last = '';
    const update = () => {
      timer = 0;
      const hint = hintRef.current;
      const anchor = selectors
        .map(selector => document.querySelector<HTMLElement>(selector))
        .find(Boolean);
      if (!hint || !anchor) {
        setPosition(null);
        return;
      }
      const next = positionForAnchor(
        anchor.getBoundingClientRect(),
        hint.getBoundingClientRect(),
        anchor.matches('.viewport'),
      );
      const signature = `${Math.round(next.left)}:${Math.round(next.top)}:${next.side}`;
      if (signature !== last) {
        last = signature;
        setPosition(next);
      }
    };
    const schedule = () => {
      if (timer) return;
      timer = window.setTimeout(update, 0);
    };
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeFilter: ['class', 'style'],
    });
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(document.body);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      if (timer) window.clearTimeout(timer);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [selectors, visible]);

  if (!visible) return null;

  return (
    <aside
      ref={hintRef}
      className={`first-match-guide is-${position?.side ?? 'measuring'}`}
      style={{
        left: position?.left ?? -1000,
        top: position?.top ?? -1000,
        visibility: position ? 'visible' : 'hidden',
      } as CSSProperties}
      role="status"
      aria-live="polite"
      aria-label={`新手提示：${copy.text}`}
    >
      <span>{copy.text}</span>
      <button
        type="button"
        className="guide-skip"
        aria-label="跳过新手引导"
        title="跳过新手引导"
        onClick={onSkip}
      >
        <i aria-hidden="true">×</i>
      </button>
    </aside>
  );
}

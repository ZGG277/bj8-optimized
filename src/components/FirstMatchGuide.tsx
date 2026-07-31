/*
[INPUT]: 当前首局引导步骤、对局是否允许展示，以及跳过/继续回调
[OUTPUT]: 对外提供跟随球桌或可移动控件的紧凑非模态提示，含键鼠/触控文案与无障碍语义
[POS]: HUD 展示层；只观察稳定 DOM 锚点，不持有引导状态或改写对局
[PROTOCOL]: 步骤文案、锚点或布局变化时更新本注释、components/CLAUDE.md 与样式文档
*/
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { FirstMatchGuideStep } from '../first-match-guide';

type GuideCopy = {
  eyebrow: string;
  title: string;
  body: string;
  selector: string;
  fallbackSelector?: string;
};

const GUIDE_COPY: Record<FirstMatchGuideStep, GuideCopy> = {
  'break-place': {
    eyebrow: '开球 1 / 3',
    title: '先放置白球',
    body: '在开球区移动虚白球，点击或轻触确认位置。',
    selector: '.viewport',
  },
  'break-aim': {
    eyebrow: '开球 2 / 3',
    title: '粗瞄，再用拨轮精瞄',
    body: '拖动幽灵球或瞄准线找方向；再拨动方向拨轮微调，键盘方向键也可用。',
    selector: '[data-control-slot="aimDial"]',
    fallbackSelector: '.viewport',
  },
  'break-power': {
    eyebrow: '开球 3 / 3',
    title: '下拉蓄力，松手击球',
    body: '按住球杆控件向下拉，力度合适时松手；键盘可按住空格蓄力。',
    selector: '[data-control-slot="power"]',
  },
  'player-aim': {
    eyebrow: '你的回合 1 / 5',
    title: '先观察球形',
    body: '确认目标球与幽灵球，再在台面粗瞄、用方向拨轮做最后微调。',
    selector: '[data-control-slot="aimDial"]',
    fallbackSelector: '.viewport',
  },
  view: {
    eyebrow: '你的回合 2 / 5',
    title: '切换趴下与俯视',
    body: '拖动视角杆连续调整高度；方向键、PageUp / PageDown 也可微调。',
    selector: '[data-control-slot="view"]',
  },
  spin: {
    eyebrow: '你的回合 3 / 5',
    title: '选择母球击球点',
    body: '点击小母球展开击球点，拖动选择杆法；方向键微调，0 键回中杆。',
    selector: '[data-control-slot="spin"]',
  },
  power: {
    eyebrow: '你的回合 4 / 5',
    title: '下拉并释放出杆',
    body: '按住球杆向下拉，观察能量变化，松手完成击球。',
    selector: '[data-control-slot="power"]',
  },
  layout: {
    eyebrow: '你的回合 5 / 5',
    title: '控件位置也能调整',
    body: '触屏长按任一控件，或用鼠标按住片刻，即可拖到顺手的位置。',
    selector: '[data-control-slot="view"]',
  },
};

type AnchorPosition = {
  left: number;
  top: number;
  side: 'left' | 'right' | 'above' | 'below' | 'table';
};

const CARD_WIDTH = 210;
const CARD_ESTIMATED_HEIGHT = 154;
const VIEWPORT_MARGIN = 10;

function positionForAnchor(rect: DOMRect, tableAnchor: boolean): AnchorPosition {
  const width = Math.min(CARD_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
  if (tableAnchor) {
    return {
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(
          window.innerWidth - width - VIEWPORT_MARGIN,
          rect.left + 12,
        ),
      ),
      top: Math.max(
        VIEWPORT_MARGIN,
        Math.min(
          window.innerHeight - CARD_ESTIMATED_HEIGHT - VIEWPORT_MARGIN,
          rect.bottom - CARD_ESTIMATED_HEIGHT - 12,
        ),
      ),
      side: 'table',
    };
  }
  if (rect.width > rect.height * 1.35) {
    const canUseAbove = rect.top >= CARD_ESTIMATED_HEIGHT + 20;
    return {
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(
          window.innerWidth - width - VIEWPORT_MARGIN,
          rect.left + rect.width / 2 - width / 2,
        ),
      ),
      top: Math.max(
        VIEWPORT_MARGIN,
        Math.min(
          window.innerHeight - CARD_ESTIMATED_HEIGHT - VIEWPORT_MARGIN,
          canUseAbove
            ? rect.top - CARD_ESTIMATED_HEIGHT - 10
            : rect.bottom + 10,
        ),
      ),
      side: canUseAbove ? 'above' : 'below',
    };
  }
  const useLeft =
    rect.left >= width + 20 ||
    rect.left + rect.width / 2 > window.innerWidth / 2;
  const left = useLeft ? rect.left - width - 10 : rect.right + 10;
  return {
    left: Math.max(
      VIEWPORT_MARGIN,
      Math.min(window.innerWidth - width - VIEWPORT_MARGIN, left),
    ),
    top: Math.max(
      VIEWPORT_MARGIN,
      Math.min(
        window.innerHeight - CARD_ESTIMATED_HEIGHT - VIEWPORT_MARGIN,
        rect.top + rect.height / 2 - CARD_ESTIMATED_HEIGHT / 2,
      ),
    ),
    side: useLeft ? 'left' : 'right',
  };
}

interface FirstMatchGuideProps {
  step: FirstMatchGuideStep;
  visible: boolean;
  onNext: () => void;
  onSkip: () => void;
}

export function FirstMatchGuide({
  step,
  visible,
  onNext,
  onSkip,
}: FirstMatchGuideProps) {
  const copy = GUIDE_COPY[step];
  const [position, setPosition] = useState<AnchorPosition | null>(null);
  const isLast = step === 'layout';
  const selectors = useMemo(
    () => [copy.selector, copy.fallbackSelector].filter(Boolean) as string[],
    [copy.fallbackSelector, copy.selector],
  );

  useEffect(() => {
    if (!visible) return;
    let timer = 0;
    let last = '';
    const update = () => {
      timer = 0;
      const anchor = selectors
        .map(selector => document.querySelector<HTMLElement>(selector))
        .find(Boolean);
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        const next = positionForAnchor(rect, anchor.matches('.viewport'));
        const signature = `${Math.round(next.left)}:${Math.round(next.top)}:${next.side}`;
        if (signature !== last) {
          last = signature;
          setPosition(next);
        }
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

  if (!visible || !position) return null;

  return (
    <aside
      className={`first-match-guide is-${position.side}`}
      style={{
        left: position.left,
        top: position.top,
      } as CSSProperties}
      aria-label="新手引导"
      aria-live="polite"
    >
      <span className="first-match-guide-eyebrow">{copy.eyebrow}</span>
      <strong>{copy.title}</strong>
      <p>{copy.body}</p>
      <div className="first-match-guide-actions">
        <button type="button" className="guide-skip" onClick={onSkip}>
          跳过引导
        </button>
        <button type="button" className="guide-next" onClick={onNext}>
          {isLast ? '完成' : '下一步'}
        </button>
      </div>
    </aside>
  );
}

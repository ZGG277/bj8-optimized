/*
[INPUT]: 辅助线/走位状态、灯泡布局与新用户本地证据
[OUTPUT]: 对外提供灯泡双开关与随可移动灯泡锚定的一次性非模态功能提示
[POS]: HUD 辅助入口组件；独立管理菜单/提示展开与持久化，ControlDeck 只负责装配
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { Placement } from '../layout/control-layout';
import { FIRST_MATCH_GUIDE_STORAGE_KEY } from '../first-match-guide';
import {
  LEGACY_PLAYER_SKILL_STORAGE_KEY,
  PLAYER_SKILL_STORAGE_KEY,
  PREVIOUS_PLAYER_SKILL_STORAGE_KEY,
} from '../opponent/model';

export const BULB_COACHMARK_STORAGE_KEY =
  'guagua-billiards:bulb-coachmark:v1';

export const BULB_COACHMARK_COPY_ID = 'bulb-coachmark-copy';

type StorageReader = Pick<Storage, 'getItem'>;
type StorageWriter = Pick<Storage, 'setItem'>;
type AssistAxis = 'horizontal' | 'vertical';
type CoachmarkSide = 'left' | 'right' | 'above' | 'below';

type CoachmarkPosition = {
  left: number;
  top: number;
  side: CoachmarkSide;
};

type AnchoredCoachmarkPosition = CoachmarkPosition & {
  anchorVersion: string;
};

const COACHMARK_GAP = 8;
const COACHMARK_MARGIN = 8;

const SKILL_STORAGE_KEYS = [
  PLAYER_SKILL_STORAGE_KEY,
  PREVIOUS_PLAYER_SKILL_STORAGE_KEY,
  LEGACY_PLAYER_SKILL_STORAGE_KEY,
] as const;

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hasPlayedShot(storage: StorageReader): boolean {
  for (const key of SKILL_STORAGE_KEYS) {
    const saved = storage.getItem(key);
    if (!saved) continue;
    const profile = JSON.parse(saved) as Record<string, unknown>;
    const evidence = [
      profile.totalPlayerShots,
      profile.qualifiedShots,
      profile.matchesEvaluated,
    ];
    if (evidence.some(value =>
      typeof value === 'number' && Number.isFinite(value) && value > 0)) {
      return true;
    }
  }
  return false;
}

/** 只对能确认的新用户展示；受限/损坏存储不冒险打扰。 */
export function shouldShowBulbCoachmark(
  storage?: StorageReader | null,
): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(BULB_COACHMARK_STORAGE_KEY) === 'done') return false;
    if (storage.getItem(FIRST_MATCH_GUIDE_STORAGE_KEY) === 'done') return false;
    return !hasPlayedShot(storage);
  } catch {
    return false;
  }
}

export function saveBulbCoachmarkDismissed(
  storage?: StorageWriter | null,
): void {
  if (!storage) return;
  try {
    storage.setItem(BULB_COACHMARK_STORAGE_KEY, 'done');
  } catch {
    // 受限 WebView 中至少保持本次会话已收起。
  }
}

export function bulbCoachmarkSideFor(placement: Placement): CoachmarkSide {
  if (placement.mode === 'docked') {
    return placement.edge === 'bottom' ? 'above' : 'left';
  }
  return placement.x < 0.5 ? 'right' : 'left';
}

/** 同一侧内移动也必须改变版本，确保拖放落位后提示重新测量真实锚点。 */
export function bulbCoachmarkAnchorVersion(placement: Placement): string {
  return placement.mode === 'free'
    ? `free:${placement.x}:${placement.y}`
    : `docked:${placement.edge}:${placement.order}:${placement.position}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function positionBulbCoachmark(
  anchor: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>,
  hint: Pick<DOMRect, 'width' | 'height'>,
  preferredSide: CoachmarkSide,
  viewportWidth: number,
  viewportHeight: number,
): CoachmarkPosition {
  const maxLeft = viewportWidth - hint.width - COACHMARK_MARGIN;
  const maxTop = viewportHeight - hint.height - COACHMARK_MARGIN;
  let side = preferredSide;
  if (side === 'left' && anchor.left - hint.width - COACHMARK_GAP < COACHMARK_MARGIN) {
    side = 'right';
  } else if (
    side === 'right' &&
    anchor.right + COACHMARK_GAP + hint.width > viewportWidth - COACHMARK_MARGIN
  ) {
    side = 'left';
  } else if (
    side === 'above' &&
    anchor.top - hint.height - COACHMARK_GAP < COACHMARK_MARGIN
  ) {
    side = 'below';
  }

  if (side === 'left' || side === 'right') {
    return {
      left: clamp(
        side === 'left'
          ? anchor.left - hint.width - COACHMARK_GAP
          : anchor.right + COACHMARK_GAP,
        COACHMARK_MARGIN,
        maxLeft,
      ),
      top: clamp(
        anchor.top + anchor.height / 2 - hint.height / 2,
        COACHMARK_MARGIN,
        maxTop,
      ),
      side,
    };
  }

  return {
    left: clamp(
      anchor.left + anchor.width / 2 - hint.width / 2,
      COACHMARK_MARGIN,
      maxLeft,
    ),
    top: clamp(
      side === 'above'
        ? anchor.top - hint.height - COACHMARK_GAP
        : anchor.bottom + COACHMARK_GAP,
      COACHMARK_MARGIN,
      maxTop,
    ),
    side,
  };
}

function useBulbCoachmark() {
  const storageRef = useRef<Storage | null>(null);
  const [visible, setVisible] = useState(() => {
    const storage = browserStorage();
    storageRef.current = storage;
    return shouldShowBulbCoachmark(storage);
  });
  const dismiss = useCallback(() => {
    setVisible(false);
    saveBulbCoachmarkDismissed(storageRef.current);
  }, []);
  return { dismiss, visible };
}

interface BulbCoachmarkProps {
  anchorRef?: RefObject<HTMLElement>;
  anchorVersion?: string;
  preferredSide: CoachmarkSide;
  visible: boolean;
  onDismiss: () => void;
}

export function BulbCoachmark({
  anchorRef,
  anchorVersion = 'static',
  preferredSide,
  visible,
  onDismiss,
}: BulbCoachmarkProps) {
  const hintRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<AnchoredCoachmarkPosition | null>(null);

  useEffect(() => {
    if (!visible || !anchorRef) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const anchor = anchorRef.current;
      const hint = hintRef.current;
      if (!anchor || !hint) return;
      const next = positionBulbCoachmark(
        anchor.getBoundingClientRect(),
        hint.getBoundingClientRect(),
        preferredSide,
        window.innerWidth,
        window.innerHeight,
      );
      setPosition(current => (
        current?.anchorVersion === anchorVersion &&
        current.left === next.left &&
        current.top === next.top &&
        current.side === next.side
          ? current
          : { ...next, anchorVersion }
      ));
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };
    const resizeObserver = new ResizeObserver(schedule);
    if (anchorRef.current) resizeObserver.observe(anchorRef.current);
    if (hintRef.current) resizeObserver.observe(hintRef.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    schedule();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [anchorRef, anchorVersion, preferredSide, visible]);

  if (!visible) return null;
  const anchoredPosition = position?.anchorVersion === anchorVersion
    ? position
    : null;
  const coachmark = (
    <aside
      ref={hintRef}
      className={`bulb-coachmark is-${anchoredPosition?.side ?? preferredSide}`}
      style={{
        left: anchoredPosition?.left ?? -1000,
        top: anchoredPosition?.top ?? -1000,
        visibility: anchorRef && !anchoredPosition ? 'hidden' : 'visible',
      } as CSSProperties}
      aria-label="小灯泡功能提示"
    >
      <span
        id={BULB_COACHMARK_COPY_ID}
        className="bulb-coachmark-copy"
        role="status"
        aria-live="polite"
      >
        <strong>小灯泡里有</strong>
        <span>瞄准辅助线 · 走位/击球复盘</span>
      </span>
      <button
        type="button"
        className="bulb-coachmark-dismiss"
        aria-label="关闭小灯泡功能提示"
        title="不再提示"
        onClick={onDismiss}
      >
        <i aria-hidden="true">×</i>
      </button>
    </aside>
  );
  return typeof document === 'undefined'
    ? coachmark
    : createPortal(coachmark, document.body);
}

interface BulbAssistControlProps {
  placement: Placement;
  axis: AssistAxis;
  guidanceAvailable: boolean;
  guidanceEnabled: boolean;
  aimAssistEnabled: boolean;
  layoutDragging: boolean;
  onToggleGuidance: () => void;
  onToggleAimAssist: () => void;
}

export function BulbAssistControl({
  placement,
  axis,
  guidanceAvailable,
  guidanceEnabled,
  aimAssistEnabled,
  layoutDragging,
  onToggleGuidance,
  onToggleAimAssist,
}: BulbAssistControlProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const bulbButtonRef = useRef<HTMLButtonElement>(null);
  const coachmark = useBulbCoachmark();
  const guidanceStateClass = guidanceEnabled ? 'is-open' : 'is-off';
  const coachmarkVisible = coachmark.visible && !menuOpen && !layoutDragging;

  useEffect(() => {
    if (layoutDragging) setMenuOpen(false);
  }, [layoutDragging]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  return (
    <div className={`assist-control ${menuOpen ? 'menu-open' : ''}`}>
      <button
        ref={bulbButtonRef}
        type="button"
        className={`plan-button ${guidanceStateClass} ${aimAssistEnabled ? 'has-aim-assist' : ''}`}
        aria-label={`${menuOpen ? '关闭' : '打开'}辅助功能：瞄准辅助线与走位复盘`}
        aria-expanded={menuOpen}
        aria-controls="bulb-assist-menu"
        aria-describedby={coachmarkVisible ? BULB_COACHMARK_COPY_ID : undefined}
        onClick={() => {
          coachmark.dismiss();
          setMenuOpen(open => !open);
        }}
      >
        <span className="bulb-icon" aria-hidden="true"><i /></span>
      </button>
      <BulbCoachmark
        anchorRef={bulbButtonRef}
        anchorVersion={bulbCoachmarkAnchorVersion(placement)}
        preferredSide={bulbCoachmarkSideFor(placement)}
        visible={coachmarkVisible}
        onDismiss={coachmark.dismiss}
      />
      {menuOpen && (
        <div
          id="bulb-assist-menu"
          className={`assist-menu assist-menu-${axis}`}
          role="group"
          aria-label="辅助功能"
        >
          <button
            type="button"
            className={`assist-option aim-option ${aimAssistEnabled ? 'active' : ''}`}
            role="switch"
            aria-label="瞄准辅助线"
            aria-checked={aimAssistEnabled}
            onClick={onToggleAimAssist}
          >
            <span className="trajectory-icon" aria-hidden="true"><i /></span>
          </button>
          <button
            type="button"
            className={`assist-option guidance-option ${guidanceEnabled ? 'active' : ''}`}
            role="switch"
            aria-label="走位与击球复盘"
            aria-checked={guidanceEnabled}
            disabled={!guidanceAvailable}
            onClick={onToggleGuidance}
          >
            <span className="route-icon" aria-hidden="true"><i /><i /><i /></span>
          </button>
        </div>
      )}
    </div>
  );
}

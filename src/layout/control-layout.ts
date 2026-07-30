/*
[INPUT]: 视口尺寸、Pointer 坐标、本地存储与五个控件的布局事实
[OUTPUT]: 三类响应式布局、自由位置钳制、保留沿边落点的右/底吸附、容量判断与 v2→v3 安全迁移
[POS]: 控件布局纯领域层；不依赖 React 或具体控件 DOM
[PROTOCOL]: 布局类型、阈值或存储协议变化时同步更新本文件测试与 src/CLAUDE.md
*/
export type DockItemId = 'view' | 'bulb' | 'spin' | 'power' | 'aimDial';
export type DockEdge = 'right' | 'bottom';
export type LayoutProfile = 'desktop' | 'portrait' | 'landscape';

export type FreePlacement = {
  mode: 'free';
  x: number;
  y: number;
};

export type DockedPlacement = {
  mode: 'docked';
  edge: DockEdge;
  order: number;
  position: number;
};

export type Placement = FreePlacement | DockedPlacement;
export type ProfileLayout = Record<DockItemId, Placement>;
export type StoredControlLayouts = {
  version: 3;
  layouts: Record<LayoutProfile, ProfileLayout>;
};

export const CONTROL_LAYOUT_STORAGE_KEY = 'guagua-billiards:control-layout:v3';
export const CONTROL_LAYOUT_LONG_PRESS_MS = 420;
export const CONTROL_LAYOUT_MOVE_THRESHOLD = 8;
export const CONTROL_LAYOUT_TOUCH_LONG_PRESS_MS = 340;
export const CONTROL_LAYOUT_TOUCH_MOVE_THRESHOLD = 14;
export const CONTROL_LAYOUT_SNAP_THRESHOLD = 48;
export const CONTROL_LAYOUT_SAFE_GUTTER = 8;

const IDS: DockItemId[] = ['view', 'bulb', 'spin', 'power', 'aimDial'];
const PROFILES: LayoutProfile[] = ['desktop', 'portrait', 'landscape'];
const LEGACY_PREFIX = 'bj8-control-y:v2:';

const DEFAULT_RIGHT_POSITIONS: Record<LayoutProfile, number[]> = {
  desktop: [0.14, 0.32, 0.42, 0.66, 0.88],
  portrait: [0.14, 0.32, 0.42, 0.66, 0.88],
  landscape: [0.15, 0.40, 0.58, 0.84, 0.5],
};

export function defaultProfileLayout(
  profile: LayoutProfile = 'desktop',
): ProfileLayout {
  const positions = DEFAULT_RIGHT_POSITIONS[profile];
  return {
    view: { mode: 'docked', edge: 'right', order: 0, position: positions[0] },
    bulb: { mode: 'docked', edge: 'right', order: 1, position: positions[1] },
    spin: { mode: 'docked', edge: 'right', order: 2, position: positions[2] },
    power: { mode: 'docked', edge: 'right', order: 3, position: positions[3] },
    aimDial: { mode: 'free', x: 0.5, y: 0.84 },
  };
}

export function createDefaultControlLayouts(): StoredControlLayouts {
  return {
    version: 3,
    layouts: {
      desktop: defaultProfileLayout('desktop'),
      portrait: defaultProfileLayout('portrait'),
      landscape: defaultProfileLayout('landscape'),
    },
  };
}

export function resolveLayoutProfile(width: number, height: number): LayoutProfile {
  if (width >= 900 && height > 560) return 'desktop';
  return height >= width ? 'portrait' : 'landscape';
}

function finite01(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function parseProfile(
  value: unknown,
  fallback: ProfileLayout,
  profile: LayoutProfile,
): ProfileLayout | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Record<DockItemId, Partial<Placement>>>;
  const result = {} as ProfileLayout;
  for (const id of IDS) {
    const candidate = raw[id];
    if (candidate?.mode === 'docked' &&
      (candidate.edge === 'right' || candidate.edge === 'bottom')) {
      result[id] = {
        mode: 'docked',
        edge: candidate.edge,
        order:
          typeof candidate.order === 'number' && Number.isFinite(candidate.order)
            ? candidate.order
            : 0,
        position: finite01(
          'position' in candidate ? candidate.position : undefined,
          DEFAULT_RIGHT_POSITIONS[profile][
            typeof candidate.order === 'number' && Number.isFinite(candidate.order)
              ? Math.min(4, Math.max(0, Math.round(candidate.order)))
              : 0
          ],
        ),
      };
    } else if (candidate?.mode === 'free') {
      const defaultFree = fallback[id].mode === 'free'
        ? fallback[id]
        : { mode: 'free' as const, x: 0.5, y: 0.5 };
      result[id] = {
        mode: 'free',
        x: finite01(candidate.x, defaultFree.x),
        y: finite01(candidate.y, defaultFree.y),
      };
    } else {
      result[id] = fallback[id];
    }
  }
  return result;
}

type StorageReader = Pick<Storage, 'getItem'>;
type StorageWriter = Pick<Storage, 'setItem'>;

function migrateLegacy(storage: StorageReader): StoredControlLayouts {
  const migrated = createDefaultControlLayouts();
  const oldIds: Array<[DockItemId, string, number]> = [
    ['view', 'view', 0],
    ['bulb', 'guidance', 1],
    ['spin', 'spin', 2],
    ['power', 'shoot', 3],
  ];
  const ordered = oldIds
    .map(([id, key, base]) => {
      const value = Number(storage.getItem(`${LEGACY_PREFIX}${key}`));
      return { id, visualTop: base * 1000 + (Number.isFinite(value) ? value : 0) };
    })
    .sort((a, b) => a.visualTop - b.visualTop);
  for (const profile of PROFILES) {
    const positions = DEFAULT_RIGHT_POSITIONS[profile];
    ordered.forEach((entry, order) => {
      migrated.layouts[profile][entry.id] = {
        mode: 'docked',
        edge: 'right',
        order,
        position: positions[order],
      };
    });
  }
  return migrated;
}

export function loadControlLayouts(storage?: StorageReader | null): StoredControlLayouts {
  if (!storage) return createDefaultControlLayouts();
  try {
    const saved = storage.getItem(CONTROL_LAYOUT_STORAGE_KEY);
    if (saved) {
      const raw = JSON.parse(saved) as {
        version?: number;
        layouts?: Partial<Record<LayoutProfile, unknown>>;
      };
      if (raw.version === 3 && raw.layouts) {
        const defaults = createDefaultControlLayouts();
        for (const profile of PROFILES) {
          defaults.layouts[profile] =
            parseProfile(raw.layouts[profile], defaults.layouts[profile], profile)
              ?? defaults.layouts[profile];
        }
        return defaults;
      }
    }
    return migrateLegacy(storage);
  } catch {
    return createDefaultControlLayouts();
  }
}

export function saveControlLayouts(
  value: StoredControlLayouts,
  storage?: StorageWriter | null,
): void {
  if (!storage) return;
  try {
    storage.setItem(CONTROL_LAYOUT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 受限存储环境只保留当前会话状态。
  }
}

export function clampFreePlacement(
  x: number,
  y: number,
  itemWidth: number,
  itemHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): FreePlacement {
  const halfW = itemWidth / 2;
  const halfH = itemHeight / 2;
  const px = Math.min(
    viewportWidth - CONTROL_LAYOUT_SAFE_GUTTER - halfW,
    Math.max(CONTROL_LAYOUT_SAFE_GUTTER + halfW, x),
  );
  const py = Math.min(
    viewportHeight - CONTROL_LAYOUT_SAFE_GUTTER - halfH,
    Math.max(CONTROL_LAYOUT_SAFE_GUTTER + halfH, y),
  );
  return {
    mode: 'free',
    x: viewportWidth > 0 ? px / viewportWidth : 0.5,
    y: viewportHeight > 0 ? py / viewportHeight : 0.5,
  };
}

export function snapEdgeAt(
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number,
): DockEdge | null {
  const right = viewportWidth - clientX;
  const bottom = viewportHeight - clientY;
  if (right > CONTROL_LAYOUT_SNAP_THRESHOLD &&
    bottom > CONTROL_LAYOUT_SNAP_THRESHOLD) return null;
  if (right <= CONTROL_LAYOUT_SNAP_THRESHOLD &&
    bottom <= CONTROL_LAYOUT_SNAP_THRESHOLD) {
    return right <= bottom ? 'right' : 'bottom';
  }
  return right <= CONTROL_LAYOUT_SNAP_THRESHOLD ? 'right' : 'bottom';
}

export function canDock(
  layout: ProfileLayout,
  item: DockItemId,
  edge: DockEdge,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  const docked = IDS.filter(id =>
    id !== item && layout[id].mode === 'docked' && layout[id].edge === edge);
  const required =
    docked.reduce(
      (total, id) => total + dockItemLength(edge, id, viewportWidth, viewportHeight),
      0,
    ) +
    dockItemLength(edge, item, viewportWidth, viewportHeight) +
    docked.length * 6;
  const available = edge === 'right'
    ? viewportHeight - 58
    : viewportWidth - 16;
  return required <= available;
}

export function dockItemLength(
  edge: DockEdge,
  item: DockItemId,
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (item === 'bulb') return 50;
  if (item === 'spin') return edge === 'right' ? 56 : 58;
  if (item === 'aimDial') return edge === 'right' ? 150 : Math.min(250, viewportWidth - 92);
  if (edge === 'bottom') {
    if (viewportHeight <= 560 && viewportWidth > viewportHeight) {
      return Math.min(180, viewportWidth * 0.23);
    }
    if (viewportWidth <= 640 && viewportHeight >= viewportWidth) {
      return Math.min(168, viewportWidth * 0.42);
    }
    return Math.min(210, Math.max(150, viewportWidth * 0.25));
  }
  if (viewportHeight <= 560 && viewportWidth > viewportHeight) {
    return item === 'view'
      ? 92
      : Math.min(150, Math.max(100, viewportHeight * 0.28));
  }
  if (viewportWidth <= 640 && viewportHeight >= viewportWidth) {
    return Math.min(190, Math.max(124, viewportHeight * 0.23));
  }
  return Math.min(210, Math.max(132, viewportHeight * 0.25));
}

export type DockInterval = { start: number; end: number };

export function nearestDockPosition(
  requestedCenter: number,
  itemLength: number,
  occupied: DockInterval[],
  span: number,
): number | null {
  if (span <= 0 || itemLength > span) return null;
  const half = itemLength / 2;
  const sorted = occupied
    .map(interval => ({
      start: Math.max(0, Math.min(span, interval.start)),
      end: Math.max(0, Math.min(span, interval.end)),
    }))
    .filter(interval => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
  const ranges: Array<{ min: number; max: number }> = [];
  let cursor = 0;
  for (const interval of sorted) {
    const min = cursor + half;
    const max = interval.start - 6 - half;
    if (min <= max) ranges.push({ min, max });
    cursor = Math.max(cursor, interval.end + 6);
  }
  const min = cursor + half;
  const max = span - half;
  if (min <= max) ranges.push({ min, max });
  if (!ranges.length) return null;
  const requested = Math.min(span - half, Math.max(half, requestedCenter));
  const best = ranges
    .map(range => ({
      center: Math.min(range.max, Math.max(range.min, requested)),
      distance: requested < range.min
        ? range.min - requested
        : requested > range.max
          ? requested - range.max
          : 0,
    }))
    .sort((a, b) => a.distance - b.distance)[0];
  return best.center / span;
}

export function placeDockedControl(
  layout: ProfileLayout,
  item: DockItemId,
  edge: DockEdge,
  position: number,
): ProfileLayout {
  const next: ProfileLayout = {
    ...layout,
    [item]: {
      mode: 'docked',
      edge,
      order: 0,
      position: Math.min(1, Math.max(0, position)),
    },
  };
  const ordered = IDS.filter(id => {
    const placement = next[id];
    return placement.mode === 'docked' && placement.edge === edge;
  }).sort((a, b) => {
    const pa = next[a];
    const pb = next[b];
    return pa.mode === 'docked' && pb.mode === 'docked'
      ? pa.position - pb.position
      : 0;
  });
  ordered.forEach((id, order) => {
    const placement = next[id];
    if (placement.mode === 'docked') next[id] = { ...placement, order };
  });
  return next;
}

export function swapDockedControlPositions(
  layout: ProfileLayout,
  first: DockItemId,
  second: DockItemId,
): ProfileLayout {
  const firstPlacement = layout[first];
  const secondPlacement = layout[second];
  if (first === second ||
    firstPlacement.mode !== 'docked' ||
    secondPlacement.mode !== 'docked' ||
    firstPlacement.edge !== secondPlacement.edge) {
    return layout;
  }
  const next: ProfileLayout = {
    ...layout,
    [first]: {
      ...firstPlacement,
      position: secondPlacement.position,
      order: secondPlacement.order,
    },
    [second]: {
      ...secondPlacement,
      position: firstPlacement.position,
      order: firstPlacement.order,
    },
  };
  const edge = firstPlacement.edge;
  const ordered = IDS.filter(id => {
    const placement = next[id];
    return placement.mode === 'docked' && placement.edge === edge;
  }).sort((a, b) => {
    const pa = next[a];
    const pb = next[b];
    return pa.mode === 'docked' && pb.mode === 'docked'
      ? pa.position - pb.position
      : 0;
  });
  ordered.forEach((id, order) => {
    const placement = next[id];
    if (placement.mode === 'docked') next[id] = { ...placement, order };
  });
  return next;
}

export function controlAxisDelta(
  placement: Placement,
  deltaX: number,
  deltaY: number,
): number {
  return placement.mode === 'docked' && placement.edge === 'right'
    ? deltaY
    : deltaX;
}

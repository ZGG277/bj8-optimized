/*
[INPUT]: 只依赖台面长宽与球半径等纯数值参数
[OUTPUT]: 对外提供中式台球袋口/库边统一几何、袋口局部坐标与安全瞄准窗口
[POS]: 纯物理几何层；physics、aim、planner 与 Scene3D 的袋口单一事实来源
[PROTOCOL]: 变更时更新此头部，然后检查 physics/CLAUDE.md 与 ../CLAUDE.md
*/

export type TableGeometryInput = {
  width: number;
  length: number;
  ballRadius: number;
};

export type Point2 = { x: number; z: number };

export type CushionSegment = {
  id: string;
  a: Point2;
  b: Point2;
  /** 从库边实体指向球可运动区域的单位法线。 */
  inward: Point2;
  pocket: number | null;
  role: 'rail' | 'jaw';
};

export type PocketGeometry = {
  index: number;
  kind: 'corner' | 'side';
  /** 保持既有六袋中心坐标与索引语义。 */
  x: number;
  z: number;
  mouthWidth: number;
  jawRadius: number;
  shelfDepth: number;
  mouthCenter: Point2;
  outward: Point2;
  tangent: Point2;
  mouthHalfWidth: number;
  dropHalfWidth: number;
  jawSegments: readonly CushionSegment[];
};

export type PocketAimWindow = {
  center: Point2;
  left: Point2;
  right: Point2;
  halfWidth: number;
};

const CORNER_MOUTH_WIDTH = 0.088;
const SIDE_MOUTH_WIDTH = 0.092;
const CORNER_JAW_RADIUS = 0.102;
const SIDE_JAW_RADIUS = 0.064;
const CORNER_SHELF_DEPTH = 0.036;
const SIDE_SHELF_DEPTH = 0.024;
const JAW_STEPS = 12;
const AIM_CLEARANCE = 0.00075;

function add(a: Point2, b: Point2): Point2 {
  return { x: a.x + b.x, z: a.z + b.z };
}

function scale(v: Point2, amount: number): Point2 {
  return { x: v.x * amount, z: v.z * amount };
}

function dot(a: Point2, b: Point2): number {
  return a.x * b.x + a.z * b.z;
}

function jawInset(radius: number, depth: number): number {
  const d = Math.min(radius, Math.max(0, depth));
  return radius - Math.sqrt(Math.max(0, radius * radius - d * d));
}

function jawPoint(
  mouthCenter: Point2,
  outward: Point2,
  tangent: Point2,
  mouthHalfWidth: number,
  jawRadius: number,
  side: -1 | 1,
  depth: number,
): Point2 {
  const lateral = side * (mouthHalfWidth - jawInset(jawRadius, depth));
  return add(add(mouthCenter, scale(outward, depth)), scale(tangent, lateral));
}

function makeJawSegments(
  pocketIndex: number,
  mouthCenter: Point2,
  outward: Point2,
  tangent: Point2,
  mouthHalfWidth: number,
  jawRadius: number,
  shelfDepth: number,
): CushionSegment[] {
  const segments: CushionSegment[] = [];
  const tableInterior = add(mouthCenter, scale(outward, -0.18));

  for (const side of [-1, 1] as const) {
    let previous = jawPoint(
      mouthCenter,
      outward,
      tangent,
      mouthHalfWidth,
      jawRadius,
      side,
      0,
    );
    for (let step = 1; step <= JAW_STEPS; step += 1) {
      const depth = shelfDepth * (step / JAW_STEPS);
      const next = jawPoint(
        mouthCenter,
        outward,
        tangent,
        mouthHalfWidth,
        jawRadius,
        side,
        depth,
      );
      const dx = next.x - previous.x;
      const dz = next.z - previous.z;
      const length = Math.hypot(dx, dz) || 1;
      const normalA = { x: -dz / length, z: dx / length };
      const midpoint = { x: (previous.x + next.x) / 2, z: (previous.z + next.z) / 2 };
      const towardInterior = { x: tableInterior.x - midpoint.x, z: tableInterior.z - midpoint.z };
      const inward = dot(normalA, towardInterior) >= 0
        ? normalA
        : { x: -normalA.x, z: -normalA.z };
      segments.push({
        id: `p${pocketIndex}-jaw-${side}-${step}`,
        a: previous,
        b: next,
        inward,
        pocket: pocketIndex,
        role: 'jaw',
      });
      previous = next;
    }
  }
  return segments;
}

function makePocket(
  input: TableGeometryInput,
  index: number,
  x: number,
  z: number,
  kind: PocketGeometry['kind'],
): PocketGeometry {
  const sx = Math.sign(x);
  const sz = Math.sign(z);
  const mouthWidth = kind === 'corner' ? CORNER_MOUTH_WIDTH : SIDE_MOUTH_WIDTH;
  const jawRadius = kind === 'corner' ? CORNER_JAW_RADIUS : SIDE_JAW_RADIUS;
  const shelfDepth = kind === 'corner' ? CORNER_SHELF_DEPTH : SIDE_SHELF_DEPTH;
  const mouthHalfWidth = mouthWidth / 2;

  const outward = kind === 'corner'
    ? { x: sx / Math.SQRT2, z: sz / Math.SQRT2 }
    : { x: sx, z: 0 };
  const tangent = { x: -outward.z, z: outward.x };
  const mouthCenter = kind === 'corner'
    ? {
        x: x - outward.x * mouthHalfWidth,
        z: z - outward.z * mouthHalfWidth,
      }
    : { x, z };
  const dropHalfWidth = Math.max(
    0.001,
    mouthHalfWidth - input.ballRadius - AIM_CLEARANCE,
  );
  const jawSegments = makeJawSegments(
    index,
    mouthCenter,
    outward,
    tangent,
    mouthHalfWidth,
    jawRadius,
    shelfDepth,
  );

  return {
    index,
    kind,
    x,
    z,
    mouthWidth,
    jawRadius,
    shelfDepth,
    mouthCenter,
    outward,
    tangent,
    mouthHalfWidth,
    dropHalfWidth,
    jawSegments,
  };
}

export function createPocketGeometries(input: TableGeometryInput): readonly PocketGeometry[] {
  const halfW = input.width / 2;
  const halfL = input.length / 2;
  return [
    makePocket(input, 0, -halfW, -halfL, 'corner'),
    makePocket(input, 1, halfW, -halfL, 'corner'),
    makePocket(input, 2, -halfW, 0, 'side'),
    makePocket(input, 3, halfW, 0, 'side'),
    makePocket(input, 4, -halfW, halfL, 'corner'),
    makePocket(input, 5, halfW, halfL, 'corner'),
  ];
}

export function createCushionSegments(
  input: TableGeometryInput,
  pockets: readonly PocketGeometry[],
): readonly CushionSegment[] {
  const halfW = input.width / 2;
  const halfL = input.length / 2;
  const cornerAlong = CORNER_MOUTH_WIDTH / Math.SQRT2;
  const sideHalf = SIDE_MOUTH_WIDTH / 2;
  const rails: CushionSegment[] = [];

  for (const sx of [-1, 1] as const) {
    const x = sx * halfW;
    const inward = { x: -sx, z: 0 };
    rails.push(
      {
        id: `rail-x-${sx}-top`,
        a: { x, z: -halfL + cornerAlong },
        b: { x, z: -sideHalf },
        inward,
        pocket: null,
        role: 'rail',
      },
      {
        id: `rail-x-${sx}-bottom`,
        a: { x, z: sideHalf },
        b: { x, z: halfL - cornerAlong },
        inward,
        pocket: null,
        role: 'rail',
      },
    );
  }
  for (const sz of [-1, 1] as const) {
    const z = sz * halfL;
    rails.push({
      id: `rail-z-${sz}`,
      a: { x: -halfW + cornerAlong, z },
      b: { x: halfW - cornerAlong, z },
      inward: { x: 0, z: -sz },
      pocket: null,
      role: 'rail',
    });
  }

  return [...rails, ...pockets.flatMap((pocket) => pocket.jawSegments)];
}

export function worldToPocketLocal(
  pocket: PocketGeometry,
  point: Point2,
): { depth: number; lateral: number } {
  const relative = {
    x: point.x - pocket.mouthCenter.x,
    z: point.z - pocket.mouthCenter.z,
  };
  return {
    depth: dot(relative, pocket.outward),
    lateral: dot(relative, pocket.tangent),
  };
}

export function pocketLocalToWorld(
  pocket: PocketGeometry,
  depth: number,
  lateral: number,
): Point2 {
  return add(add(pocket.mouthCenter, scale(pocket.outward, depth)), scale(pocket.tangent, lateral));
}

export function getPocketAimWindow(pocket: PocketGeometry): PocketAimWindow {
  const center = pocketLocalToWorld(pocket, pocket.shelfDepth, 0);
  return {
    center,
    left: pocketLocalToWorld(pocket, pocket.shelfDepth, -pocket.dropHalfWidth),
    right: pocketLocalToWorld(pocket, pocket.shelfDepth, pocket.dropHalfWidth),
    halfWidth: pocket.dropHalfWidth,
  };
}

export function isInsidePocketShelf(pocket: PocketGeometry, point: Point2): boolean {
  const local = worldToPocketLocal(pocket, point);
  if (local.depth < -0.002 || local.depth > pocket.shelfDepth + 0.002) return false;
  const surfaceHalfWidth =
    pocket.mouthHalfWidth - jawInset(pocket.jawRadius, Math.max(0, local.depth));
  return Math.abs(local.lateral) <= surfaceHalfWidth + 0.002;
}

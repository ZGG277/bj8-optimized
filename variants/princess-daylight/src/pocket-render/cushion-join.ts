/*
[INPUT]: 共享物理库边段与端点；只读，不改变球的碰撞面
[OUTPUT]: 渲染剖面的共用斜接偏移，避免独立短角衬顶面重叠闪烁
[POS]: 袋口渲染几何；Scene3D 每个连续库边端点使用同一 miter
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import type { CushionSegment, Point2 } from '../physics/table-geometry';

const same = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z) < 1e-8;

export function cushionJoinOutward(
  segment: CushionSegment,
  endpoint: Point2,
  segments: readonly CushionSegment[],
): Point2 {
  const other = segments.find(candidate => candidate !== segment &&
    (same(endpoint, candidate.a) || same(endpoint, candidate.b)));
  if (!other) return { x: -segment.inward.x, z: -segment.inward.z };
  const denominator = 1 + segment.inward.x * other.inward.x + segment.inward.z * other.inward.z;
  // 不为异常的近反向接头生成无穷长尖角；现有六袋不走此分支。
  if (denominator < 0.1) return { x: -segment.inward.x, z: -segment.inward.z };
  return {
    x: -(segment.inward.x + other.inward.x) / denominator,
    z: -(segment.inward.z + other.inward.z) / denominator,
  };
}
